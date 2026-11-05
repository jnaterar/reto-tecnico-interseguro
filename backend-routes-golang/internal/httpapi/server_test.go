package httpapi_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/interseguro/reto-routes-golang/internal/auth"
	"github.com/interseguro/reto-routes-golang/internal/httpapi"
	"github.com/interseguro/reto-routes-golang/internal/service"
)

const examplePayload = `{
  "accidentLocation": "San Isidro",
  "depots": ["Miraflores", "Ate"],
  "graph": {
    "Miraflores": { "San Isidro": 7, "Barranco": 3 },
    "San Isidro": { "Miraflores": 7, "Lince": 4 },
    "Barranco": { "Miraflores": 3, "Surco": 5 },
    "Lince": { "San Isidro": 4, "Surco": 6 },
    "Surco": { "Barranco": 5, "Lince": 6, "Ate": 10 },
    "Ate": { "Surco": 10 }
  }
}`

func newTestServer(t *testing.T, origins []string) (*auth.Service, http.Handler) {
	t.Helper()
	authService, err := auth.NewService("test-secret-key-123456", time.Minute)
	if err != nil {
		t.Fatalf("auth.NewService() error = %v", err)
	}
	return authService, httpapi.NewServer(service.NewRouteService(), authService, true, origins).Handler()
}

func newTestHandler(t *testing.T) http.Handler {
	t.Helper()
	_, handler := newTestServer(t, []string{"http://localhost:8080"})
	return handler
}

func issueToken(t *testing.T, handler http.Handler) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/token", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("token status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("respuesta de token inválida: %v", err)
	}
	if body.Token == "" {
		t.Fatal("token vacío")
	}
	return body.Token
}

func TestHealth(t *testing.T) {
	handler := newTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, se esperaba 200", rec.Code)
	}
}

func TestOptimalRouteRequiresJWT(t *testing.T) {
	handler := newTestHandler(t)
	req := httptest.NewRequest(http.MethodPost, "/v1/routes/optimal", bytes.NewBufferString(examplePayload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, se esperaba 401", rec.Code)
	}
}

func TestOptimalRouteWithJWT(t *testing.T) {
	handler := newTestHandler(t)
	token := issueToken(t, handler)

	req := httptest.NewRequest(http.MethodPost, "/v1/routes/optimal", bytes.NewBufferString(examplePayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var response service.OptimalRouteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	if response.FromDepot != "Miraflores" {
		t.Errorf("fromDepot = %q, se esperaba Miraflores", response.FromDepot)
	}
	if response.Distance != 7 {
		t.Errorf("distance = %v, se esperaba 7", response.Distance)
	}
}

func TestOptimalRouteInvalidJSON(t *testing.T) {
	handler := newTestHandler(t)
	token := issueToken(t, handler)

	req := httptest.NewRequest(http.MethodPost, "/v1/routes/optimal", bytes.NewBufferString(`{ no-json`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, se esperaba 400", rec.Code)
	}
}

func TestOptimalRouteUnreachable(t *testing.T) {
	handler := newTestHandler(t)
	token := issueToken(t, handler)

	payload := `{
	  "accidentLocation": "Target",
	  "depots": ["Isla"],
	  "graph": { "Target": {}, "Isla": {} }
	}`
	req := httptest.NewRequest(http.MethodPost, "/v1/routes/optimal", bytes.NewBufferString(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, se esperaba 422", rec.Code)
	}
}

func TestCORSPreflightAllowsConfiguredOrigin(t *testing.T) {
	handler := newTestHandler(t)
	req := httptest.NewRequest(http.MethodOptions, "/v1/routes/optimal", nil)
	req.Header.Set("Origin", "http://localhost:8080")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "authorization,content-type")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, se esperaba 204", rec.Code)
	}
	// Se refleja el origen exacto, nunca `*`, para que el navegador lo valide.
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:8080" {
		t.Errorf("Access-Control-Allow-Origin = %q, se esperaba el origen exacto", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(got, "Authorization") {
		t.Errorf("Access-Control-Allow-Headers = %q, falta Authorization", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(got, "POST") {
		t.Errorf("Access-Control-Allow-Methods = %q, falta POST", got)
	}
	if got := rec.Header().Get("Access-Control-Expose-Headers"); got != "X-API-Version" {
		t.Errorf("Access-Control-Expose-Headers = %q, se esperaba X-API-Version", got)
	}
}

func TestCORSPreflightRejectsUnknownOrigin(t *testing.T) {
	handler := newTestHandler(t)
	req := httptest.NewRequest(http.MethodOptions, "/v1/routes/optimal", nil)
	req.Header.Set("Origin", "http://evil.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, se esperaba 204 sin cabeceras CORS", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("un origen hostil no debe recibir Access-Control-Allow-Origin, se obtuvo %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got != "" {
		t.Errorf("un origen hostil no debe recibir Access-Control-Allow-Headers, se obtuvo %q", got)
	}
}

func TestCORSDoesNotEchoUnknownOriginOnSimpleRequest(t *testing.T) {
	handler := newTestHandler(t)

	allowed := httptest.NewRequest(http.MethodGet, "/health", nil)
	allowed.Header.Set("Origin", "http://localhost:8080")
	allowedRec := httptest.NewRecorder()
	handler.ServeHTTP(allowedRec, allowed)
	if got := allowedRec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:8080" {
		t.Errorf("origen permitido: Access-Control-Allow-Origin = %q", got)
	}

	hostile := httptest.NewRequest(http.MethodGet, "/health", nil)
	hostile.Header.Set("Origin", "http://evil.example.com")
	hostileRec := httptest.NewRecorder()
	handler.ServeHTTP(hostileRec, hostile)
	if got := hostileRec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("origen hostil: no debe haber Access-Control-Allow-Origin, se obtuvo %q", got)
	}
}

func TestDemoTokenRejectsArbitraryScope(t *testing.T) {
	handler := newTestHandler(t)
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/token", bytes.NewBufferString(`{"scope":"admin:all"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, se esperaba 400", rec.Code)
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("respuesta inválida: %v", err)
	}
	if body.Error.Code != "VALIDATION_ERROR" {
		t.Errorf("code = %q, se esperaba VALIDATION_ERROR", body.Error.Code)
	}
}

func TestDemoTokenDefaultsToLimitedScope(t *testing.T) {
	authService, handler := newTestServer(t, []string{"http://localhost:8080"})
	token := issueToken(t, handler)

	claims, err := authService.Verify(token)
	if err != nil {
		t.Fatalf("token emitido no verificable: %v", err)
	}
	if claims.Scope != "routes:optimal" {
		t.Errorf("scope = %q, se esperaba routes:optimal", claims.Scope)
	}
}

func TestOptimalRouteRejectsTokenWithWrongScope(t *testing.T) {
	authService, handler := newTestServer(t, []string{"http://localhost:8080"})
	token, _, err := authService.Issue("demo-client", "admin:all")
	if err != nil {
		t.Fatalf("no se pudo firmar el token de prueba: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/routes/optimal", bytes.NewBufferString(examplePayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, se esperaba 403", rec.Code)
	}
}
