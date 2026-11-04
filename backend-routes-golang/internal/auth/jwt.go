// Package auth implementa un JWT HS256 mínimo con la librería estándar.
//
// Se evita una dependencia externa a propósito: el reto pide "uso de JWT dentro
// del código del API"; 60 líneas de HMAC-SHA256 son auditables y no agregan
// superficie de ataque ni dependencias. En producción se preferiría una
// librería mantenida (golang-jwt) o un API Gateway que valide el token.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrInvalidToken es el error de verificación (firma, formato o expiración).
var ErrInvalidToken = errors.New("token inválido o expirado")

// Claims es el subconjunto del payload que consume el servicio.
type Claims struct {
	Subject   string `json:"sub"`
	Scope     string `json:"scope"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
}

type header struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

// Service firma y verifica tokens.
type Service struct {
	secret []byte
	ttl    time.Duration
}

// NewService valida el secreto y define el tiempo de vida del token.
func NewService(secret string, ttl time.Duration) (*Service, error) {
	if len(secret) < 16 {
		return nil, fmt.Errorf("JWT secret debe tener al menos 16 caracteres")
	}
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	return &Service{secret: []byte(secret), ttl: ttl}, nil
}

// Issue genera un token firmado y devuelve su expiración.
func (s *Service) Issue(subject, scope string) (string, time.Time, error) {
	now := time.Now().UTC()
	expiresAt := now.Add(s.ttl)
	claims := Claims{
		Subject:   subject,
		Scope:     scope,
		IssuedAt:  now.Unix(),
		ExpiresAt: expiresAt.Unix(),
	}

	headerBytes, err := json.Marshal(header{Alg: "HS256", Typ: "JWT"})
	if err != nil {
		return "", time.Time{}, err
	}
	claimsBytes, err := json.Marshal(claims)
	if err != nil {
		return "", time.Time{}, err
	}

	unsigned := encode(headerBytes) + "." + encode(claimsBytes)
	signature := s.sign([]byte(unsigned))
	return unsigned + "." + encode(signature), expiresAt, nil
}

// Verify valida formato, firma y expiración.
func (s *Service) Verify(token string) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, ErrInvalidToken
	}

	unsigned := parts[0] + "." + parts[1]
	signature, err := decode(parts[2])
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	if !hmac.Equal(signature, s.sign([]byte(unsigned))) {
		return Claims{}, ErrInvalidToken
	}

	payload, err := decode(parts[1])
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return Claims{}, ErrInvalidToken
	}
	// RFC 7519: el token es inválido cuando el tiempo actual es igual o
	// posterior a exp (no solo posterior).
	if claims.ExpiresAt <= time.Now().UTC().Unix() {
		return Claims{}, ErrInvalidToken
	}
	return claims, nil
}

func (s *Service) sign(data []byte) []byte {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write(data)
	return mac.Sum(nil)
}

func encode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func decode(value string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(value)
}
