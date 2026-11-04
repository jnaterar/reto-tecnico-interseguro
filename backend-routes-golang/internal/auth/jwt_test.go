package auth_test

import (
	"errors"
	"testing"
	"time"

	"github.com/interseguro/reto-routes-golang/internal/auth"
)

func TestIssueAndVerify(t *testing.T) {
	svc, err := auth.NewService("super-secret-key-123456", time.Minute)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	token, expiresAt, err := svc.Issue("demo", "routes:read")
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}
	if token == "" || !expiresAt.After(time.Now()) {
		t.Fatalf("token o expiración inválidos")
	}

	claims, err := svc.Verify(token)
	if err != nil {
		t.Fatalf("Verify() error = %v", err)
	}
	if claims.Subject != "demo" || claims.Scope != "routes:read" {
		t.Errorf("claims inesperados: %+v", claims)
	}
}

func TestVerifyRejectsTamperedToken(t *testing.T) {
	svc, _ := auth.NewService("super-secret-key-123456", time.Minute)
	token, _, _ := svc.Issue("demo", "routes:read")

	tampered := token[:len(token)-2] + "aa"
	if _, err := svc.Verify(tampered); !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("se esperaba ErrInvalidToken, se obtuvo %v", err)
	}
}

func TestVerifyRejectsWrongSecret(t *testing.T) {
	issuer, _ := auth.NewService("super-secret-key-123456", time.Minute)
	verifier, _ := auth.NewService("another-secret-key-9999", time.Minute)

	token, _, _ := issuer.Issue("demo", "routes:read")
	if _, err := verifier.Verify(token); !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("se esperaba ErrInvalidToken, se obtuvo %v", err)
	}
}

func TestVerifyRejectsExpiredToken(t *testing.T) {
	svc, _ := auth.NewService("super-secret-key-123456", time.Nanosecond)
	token, _, _ := svc.Issue("demo", "routes:read")

	time.Sleep(10 * time.Millisecond)
	if _, err := svc.Verify(token); !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("se esperaba ErrInvalidToken, se obtuvo %v", err)
	}
}

func TestNewServiceRejectsShortSecret(t *testing.T) {
	if _, err := auth.NewService("corto", time.Minute); err == nil {
		t.Error("se esperaba error por secreto demasiado corto")
	}
}
