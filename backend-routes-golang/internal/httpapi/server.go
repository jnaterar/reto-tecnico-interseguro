package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/interseguro/reto-routes-golang/internal/auth"
	"github.com/interseguro/reto-routes-golang/internal/domain"
	"github.com/interseguro/reto-routes-golang/internal/service"
)

// apiVersion se expone en cabecera para evidenciar versionamiento (/v1).
const apiVersion = "v1"

type contextKey string

const claimsContextKey contextKey = "claims"

// Server agrupa las dependencias de la capa de transporte.
type Server struct {
	routes          *service.RouteService
	auth            *auth.Service
	enableDemoToken bool
	allowedOrigin   string
	mux             *http.ServeMux
}

// NewServer construye el enrutador con middleware de CORS, logging y JWT.
func NewServer(routes *service.RouteService, authService *auth.Service, enableDemoToken bool, allowedOrigin string) *Server {
	if allowedOrigin == "" {
		allowedOrigin = "*"
	}
	s := &Server{
		routes:          routes,
		auth:            authService,
		enableDemoToken: enableDemoToken,
		allowedOrigin:   allowedOrigin,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("POST /v1/auth/token", s.handleDemoToken)
	mux.HandleFunc("POST /v1/routes/optimal", s.withAuth(s.handleOptimalRoute))
	s.mux = mux
	return s
}

// Handler devuelve el handler HTTP completo con middlewares globales.
func (s *Server) Handler() http.Handler {
	return s.withCORS(s.withLogging(s.mux))
}

type tokenRequest struct {
	Subject string `json:"subject"`
	Scope   string `json:"scope"`
}

// handleDemoToken emite un JWT para la demo del frontend.
// En producción el token lo emite el IdP / API Gateway; este endpoint se
// deshabilita con ENABLE_DEMO_TOKEN=false.
func (s *Server) handleDemoToken(w http.ResponseWriter, r *http.Request) {
	if !s.enableDemoToken {
		writeError(w, domain.NewForbiddenError("la emisión de tokens de demo está deshabilitada"))
		return
	}

	var req tokenRequest
	if r.ContentLength != 0 {
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, err)
			return
		}
	}
	if req.Subject == "" {
		req.Subject = "demo-client"
	}
	if req.Scope == "" {
		req.Scope = "routes:read"
	}

	token, expiresAt, err := s.auth.Issue(req.Subject, req.Scope)
	if err != nil {
		writeError(w, err)
		return
	}

	w.Header().Set("X-API-Version", apiVersion)
	writeJSON(w, http.StatusOK, map[string]any{
		"token":     token,
		"tokenType": "Bearer",
		"expiresIn": int(time.Until(expiresAt).Seconds()),
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "routes-optimal",
		"version": apiVersion,
	})
}

func (s *Server) handleOptimalRoute(w http.ResponseWriter, r *http.Request) {
	var req service.OptimalRouteRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	response, err := s.routes.FindOptimalRoute(req)
	if err != nil {
		writeError(w, err)
		return
	}

	w.Header().Set("X-API-Version", apiVersion)
	writeJSON(w, http.StatusOK, response)
}

// withAuth exige un JWT válido en Authorization: Bearer <token>.
func (s *Server) withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(w, domain.NewUnauthorizedError("se requiere el header Authorization: Bearer <token>"))
			return
		}

		token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		claims, err := s.auth.Verify(token)
		if err != nil {
			writeError(w, domain.NewUnauthorizedError("token inválido o expirado"))
			return
		}

		ctx := context.WithValue(r.Context(), claimsContextKey, claims)
		next(w, r.WithContext(ctx))
	}
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", s.allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Max-Age", "600")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start))
	})
}

type errorEnvelope struct {
	Error *domain.AppError `json:"error"`
}

func writeError(w http.ResponseWriter, err error) {
	var appErr *domain.AppError
	if !errors.As(err, &appErr) {
		appErr = domain.NewInternalError()
	}
	writeJSON(w, statusFor(appErr.Code), errorEnvelope{Error: appErr})
}

func statusFor(code domain.ErrorCode) int {
	switch code {
	case domain.CodeValidation, domain.CodeBadRequest, domain.CodeNegativeWeight:
		return http.StatusBadRequest
	case domain.CodeNodeNotFound, domain.CodeUnreachable:
		// El recurso no es inexistente, sino que el contrato recibido no es
		// resolvible: 422 refleja mejor el "nodo no alcanzable".
		return http.StatusUnprocessableEntity
	case domain.CodeUnauthorized:
		return http.StatusUnauthorized
	case domain.CodeForbidden:
		return http.StatusForbidden
	default:
		return http.StatusInternalServerError
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MiB
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dst); err != nil {
		return domain.NewBadRequestError("el cuerpo de la petición no es un JSON válido")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("no se pudo serializar la respuesta: %v", err)
	}
}
