package httpapi_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func newTestHandler(t *testing.T) http.Handler {
	t.Helper()
	authService, err := auth.NewService("test-secret-key-123456", time.Minute)
	if err != nil {
		t.Fatalf("auth.NewService() error = %v", err)
	}
	return httpapi.NewServer(service.NewRouteService(), authService, true, "*").Handler()
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

func TestCORSPreflight(t *testing.T) {
	handler := newTestHandler(t)
	req := httptest.NewRequest(http.MethodOptions, "/v1/routes/optimal", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, se esperaba 204", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") == "" {
		t.Error("falta Access-Control-Allow-Origin")
	}
}
