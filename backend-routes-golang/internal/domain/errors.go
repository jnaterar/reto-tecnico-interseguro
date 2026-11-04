package domain

import "fmt"

// ErrorCode es un identificador estable y tipado de error de dominio.
// Se usa para mapear a códigos HTTP en la capa de transporte sin comparar
// strings sueltas (práctica solicitada en las recomendaciones transversales).
type ErrorCode string

const (
	CodeValidation     ErrorCode = "VALIDATION_ERROR"
	CodeBadRequest     ErrorCode = "BAD_REQUEST"
	CodeNodeNotFound   ErrorCode = "NODE_NOT_FOUND"
	CodeUnreachable    ErrorCode = "UNREACHABLE"
	CodeNegativeWeight ErrorCode = "NEGATIVE_WEIGHT"
	CodeUnauthorized   ErrorCode = "UNAUTHORIZED"
	CodeForbidden      ErrorCode = "FORBIDDEN"
	CodeInternal       ErrorCode = "INTERNAL_ERROR"
)

// AppError es un error controlado y serializable.
type AppError struct {
	Code    ErrorCode      `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

func (e *AppError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// NewValidationError indica que un campo de entrada no cumple el contrato.
func NewValidationError(field, message string) *AppError {
	return &AppError{
		Code:    CodeValidation,
		Message: message,
		Details: map[string]any{"field": field},
	}
}

// NewNodeNotFoundError indica que un nodo (distrito) no existe en el grafo.
// Es distinto de "no alcanzable": el nodo no forma parte de la red.
func NewNodeNotFoundError(node string) *AppError {
	return &AppError{
		Code:    CodeNodeNotFound,
		Message: fmt.Sprintf("el distrito %q no existe en el grafo", node),
		Details: map[string]any{"node": node},
	}
}

// NewUnreachableError indica que la red no conecta origen y destino.
func NewUnreachableError(from, to string) *AppError {
	return &AppError{
		Code:    CodeUnreachable,
		Message: fmt.Sprintf("no existe una ruta entre %q y %q", from, to),
		Details: map[string]any{"from": from, "to": to},
	}
}

// NewNoReachableDepotError indica que NINGUNA base pudo alcanzar el siniestro.
// El enunciado exige error solo cuando ninguna base alcanza, no cuando una falla.
func NewNoReachableDepotError(accident string, depots []string) *AppError {
	return &AppError{
		Code:    CodeUnreachable,
		Message: fmt.Sprintf("ninguna base de grúas puede alcanzar %q", accident),
		Details: map[string]any{"accidentLocation": accident, "depots": depots},
	}
}

// NewNegativeWeightError: Dijkstra no soporta pesos negativos.
func NewNegativeWeightError(from, to string, weight float64) *AppError {
	return &AppError{
		Code:    CodeNegativeWeight,
		Message: "el grafo contiene un peso negativo; Dijkstra requiere pesos >= 0",
		Details: map[string]any{"from": from, "to": to, "weight": weight},
	}
}

// NewUnauthorizedError se usa en el borde (middleware JWT).
func NewUnauthorizedError(message string) *AppError {
	return &AppError{Code: CodeUnauthorized, Message: message}
}

// NewForbiddenError se usa cuando la operación está deshabilitada.
func NewForbiddenError(message string) *AppError {
	return &AppError{Code: CodeForbidden, Message: message}
}

// NewBadRequestError cubre cuerpos JSON malformados.
func NewBadRequestError(message string) *AppError {
	return &AppError{Code: CodeBadRequest, Message: message}
}

// NewInternalError evita filtrar detalles internos al cliente.
func NewInternalError() *AppError {
	return &AppError{Code: CodeInternal, Message: "error interno del servidor"}
}
