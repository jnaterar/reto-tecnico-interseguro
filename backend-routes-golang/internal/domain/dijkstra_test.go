package domain_test

import (
	"errors"
	"slices"
	"testing"

	"github.com/interseguro/reto-routes-golang/internal/domain"
)

func exampleGraph() map[string]map[string]float64 {
	return map[string]map[string]float64{
		"Miraflores": {"San Isidro": 7, "Barranco": 3},
		"San Isidro": {"Miraflores": 7, "Lince": 4},
		"Barranco":   {"Miraflores": 3, "Surco": 5},
		"Lince":      {"San Isidro": 4, "Surco": 6},
		"Surco":      {"Barranco": 5, "Lince": 6, "Ate": 10},
		"Ate":        {"Surco": 10},
	}
}

func mustGraph(t *testing.T, raw map[string]map[string]float64) *domain.Graph {
	t.Helper()
	g, err := domain.NewGraph(raw)
	if err != nil {
		t.Fatalf("NewGraph() error inesperado = %v", err)
	}
	return g
}

func TestShortestPath(t *testing.T) {
	g := mustGraph(t, exampleGraph())

	tests := []struct {
		name     string
		from     string
		to       string
		wantDist float64
		wantPath []string
	}{
		{
			name:     "ejemplo del enunciado",
			from:     "Miraflores",
			to:       "San Isidro",
			wantDist: 7,
			wantPath: []string{"Miraflores", "San Isidro"},
		},
		{
			name:     "mismo distrito devuelve distancia 0",
			from:     "San Isidro",
			to:       "San Isidro",
			wantDist: 0,
			wantPath: []string{"San Isidro"},
		},
		{
			name:     "grafo no dirigido: arista inversa no declarada en el input",
			from:     "Ate",
			to:       "Surco",
			wantDist: 10,
			wantPath: []string{"Ate", "Surco"},
		},
		{
			name:     "camino con dos saltos",
			from:     "Barranco",
			to:       "San Isidro",
			wantDist: 10,
			wantPath: []string{"Barranco", "Miraflores", "San Isidro"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path, err := g.ShortestPath(tt.from, tt.to)
			if err != nil {
				t.Fatalf("ShortestPath() error = %v", err)
			}
			if path.Distance != tt.wantDist {
				t.Errorf("distancia = %v, se esperaba %v", path.Distance, tt.wantDist)
			}
			if !slices.Equal(path.Nodes, tt.wantPath) {
				t.Errorf("camino = %v, se esperaba %v", path.Nodes, tt.wantPath)
			}
		})
	}
}

func TestShortestPathErrors(t *testing.T) {
	tests := []struct {
		name     string
		graph    map[string]map[string]float64
		from     string
		to       string
		wantCode domain.ErrorCode
	}{
		{
			name:     "nodo origen inexistente",
			graph:    exampleGraph(),
			from:     "Lurigancho",
			to:       "San Isidro",
			wantCode: domain.CodeNodeNotFound,
		},
		{
			name:     "nodo destino inexistente",
			graph:    exampleGraph(),
			from:     "Miraflores",
			to:       "Lurigancho",
			wantCode: domain.CodeNodeNotFound,
		},
		{
			name: "nodo aislado no alcanzable",
			graph: map[string]map[string]float64{
				"A": {"B": 1},
				"C": {},
			},
			from:     "A",
			to:       "C",
			wantCode: domain.CodeUnreachable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := mustGraph(t, tt.graph)
			_, err := g.ShortestPath(tt.from, tt.to)
			assertAppErrorCode(t, err, tt.wantCode)
		})
	}
}

func TestNewGraphRejectsNegativeWeights(t *testing.T) {
	_, err := domain.NewGraph(map[string]map[string]float64{
		"A": {"B": -3},
	})
	assertAppErrorCode(t, err, domain.CodeNegativeWeight)
}

func TestNewGraphRejectsEmptyGraph(t *testing.T) {
	_, err := domain.NewGraph(map[string]map[string]float64{})
	assertAppErrorCode(t, err, domain.CodeValidation)
}

// assertAppErrorCode verifica el código tipado del error.
func assertAppErrorCode(t *testing.T, err error, want domain.ErrorCode) {
	t.Helper()
	var appErr *domain.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("se esperaba *domain.AppError, se obtuvo %v", err)
	}
	if appErr.Code != want {
		t.Errorf("código = %q, se esperaba %q", appErr.Code, want)
	}
}
