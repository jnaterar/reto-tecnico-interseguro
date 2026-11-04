package service_test

import (
	"errors"
	"slices"
	"testing"

	"github.com/interseguro/reto-routes-golang/internal/domain"
	"github.com/interseguro/reto-routes-golang/internal/service"
)

func limaGraph() map[string]map[string]float64 {
	return map[string]map[string]float64{
		"Miraflores": {"San Isidro": 7, "Barranco": 3},
		"San Isidro": {"Miraflores": 7, "Lince": 4},
		"Barranco":   {"Miraflores": 3, "Surco": 5},
		"Lince":      {"San Isidro": 4, "Surco": 6},
		"Surco":      {"Barranco": 5, "Lince": 6, "Ate": 10},
		"Ate":        {"Surco": 10},
	}
}

func TestFindOptimalRoute(t *testing.T) {
	svc := service.NewRouteService()

	tests := []struct {
		name         string
		request      service.OptimalRouteRequest
		wantDepot    string
		wantDistance float64
		wantPath     []string
	}{
		{
			name: "elige la base más cercana del ejemplo",
			request: service.OptimalRouteRequest{
				AccidentLocation: "San Isidro",
				Depots:           []string{"Miraflores", "Ate"},
				Graph:            limaGraph(),
			},
			wantDepot:    "Miraflores",
			wantDistance: 7,
			wantPath:     []string{"Miraflores", "San Isidro"},
		},
		{
			name: "el orden de entrada no cambia el resultado",
			request: service.OptimalRouteRequest{
				AccidentLocation: "San Isidro",
				Depots:           []string{"Ate", "Miraflores"},
				Graph:            limaGraph(),
			},
			wantDepot:    "Miraflores",
			wantDistance: 7,
			wantPath:     []string{"Miraflores", "San Isidro"},
		},
		{
			name: "base en el mismo distrito del siniestro",
			request: service.OptimalRouteRequest{
				AccidentLocation: "Surco",
				Depots:           []string{"Surco", "Ate"},
				Graph:            limaGraph(),
			},
			wantDepot:    "Surco",
			wantDistance: 0,
			wantPath:     []string{"Surco"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := svc.FindOptimalRoute(tt.request)
			if err != nil {
				t.Fatalf("FindOptimalRoute() error = %v", err)
			}
			if got.FromDepot != tt.wantDepot {
				t.Errorf("fromDepot = %q, se esperaba %q", got.FromDepot, tt.wantDepot)
			}
			if got.Distance != tt.wantDistance {
				t.Errorf("distance = %v, se esperaba %v", got.Distance, tt.wantDistance)
			}
			if !slices.Equal(got.Path, tt.wantPath) {
				t.Errorf("path = %v, se esperaba %v", got.Path, tt.wantPath)
			}
		})
	}
}

func TestFindOptimalRouteTieIsDeterministic(t *testing.T) {
	graph := map[string]map[string]float64{
		"X":      {"Target": 5},
		"Y":      {"Target": 5},
		"Target": {},
	}

	first, err := service.NewRouteService().FindOptimalRoute(service.OptimalRouteRequest{
		AccidentLocation: "Target",
		Depots:           []string{"X", "Y"},
		Graph:            graph,
	})
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if first.FromDepot != "X" {
		t.Errorf("en empate debe ganar la primera base del input; se obtuvo %q", first.FromDepot)
	}

	second, err := service.NewRouteService().FindOptimalRoute(service.OptimalRouteRequest{
		AccidentLocation: "Target",
		Depots:           []string{"Y", "X"},
		Graph:            graph,
	})
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if second.FromDepot != "Y" {
		t.Errorf("en empate debe ganar la primera base del input; se obtuvo %q", second.FromDepot)
	}
}

func TestFindOptimalRouteSkipsUnreachableDepot(t *testing.T) {
	graph := map[string]map[string]float64{
		"X":      {"Target": 5},
		"Target": {},
		"Isla":   {},
	}

	got, err := service.NewRouteService().FindOptimalRoute(service.OptimalRouteRequest{
		AccidentLocation: "Target",
		Depots:           []string{"Isla", "X"},
		Graph:            graph,
	})
	if err != nil {
		t.Fatalf("una base aislada no debe impedir usar otra alcanzable: %v", err)
	}
	if got.FromDepot != "X" {
		t.Errorf("fromDepot = %q, se esperaba X", got.FromDepot)
	}
}

func TestFindOptimalRouteErrors(t *testing.T) {
	tests := []struct {
		name     string
		request  service.OptimalRouteRequest
		wantCode domain.ErrorCode
	}{
		{
			name: "accidente inexistente en el grafo",
			request: service.OptimalRouteRequest{
				AccidentLocation: "Lurigancho",
				Depots:           []string{"Miraflores"},
				Graph:            limaGraph(),
			},
			wantCode: domain.CodeNodeNotFound,
		},
		{
			name: "depot inexistente en el grafo",
			request: service.OptimalRouteRequest{
				AccidentLocation: "San Isidro",
				Depots:           []string{"Lurigancho"},
				Graph:            limaGraph(),
			},
			// Trampa 5: un nodo inexistente es NODE_NOT_FOUND, no UNREACHABLE.
			wantCode: domain.CodeNodeNotFound,
		},
		{
			name: "ninguna base alcanza el siniestro",
			request: service.OptimalRouteRequest{
				AccidentLocation: "Target",
				Depots:           []string{"Isla"},
				Graph: map[string]map[string]float64{
					"Target": {},
					"Isla":   {},
				},
			},
			wantCode: domain.CodeUnreachable,
		},
		{
			name: "depots vacío",
			request: service.OptimalRouteRequest{
				AccidentLocation: "Target",
				Depots:           []string{},
				Graph:            limaGraph(),
			},
			wantCode: domain.CodeValidation,
		},
		{
			name: "accidentLocation vacío",
			request: service.OptimalRouteRequest{
				AccidentLocation: "",
				Depots:           []string{"Miraflores"},
				Graph:            limaGraph(),
			},
			wantCode: domain.CodeValidation,
		},
		{
			name: "grafo vacío",
			request: service.OptimalRouteRequest{
				AccidentLocation: "San Isidro",
				Depots:           []string{"Miraflores"},
				Graph:            map[string]map[string]float64{},
			},
			wantCode: domain.CodeValidation,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := service.NewRouteService().FindOptimalRoute(tt.request)
			var appErr *domain.AppError
			if !errors.As(err, &appErr) {
				t.Fatalf("se esperaba *domain.AppError, se obtuvo %v", err)
			}
			if appErr.Code != tt.wantCode {
				t.Errorf("código = %q, se esperaba %q", appErr.Code, tt.wantCode)
			}
		})
	}
}
