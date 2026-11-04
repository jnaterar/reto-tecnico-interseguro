package service

import (
	"errors"
	"sort"

	"github.com/interseguro/reto-routes-golang/internal/domain"
)

// OptimalRouteRequest es el contrato de entrada de la API.
// Se define como tipo propio (entity/DTO) para no acoplar la capa HTTP al
// modelo de dominio.
type OptimalRouteRequest struct {
	AccidentLocation string                        `json:"accidentLocation"`
	Depots           []string                      `json:"depots"`
	Graph            map[string]map[string]float64 `json:"graph"`
}

// OptimalRouteResponse es el contrato de salida.
type OptimalRouteResponse struct {
	FromDepot string   `json:"fromDepot"`
	To        string   `json:"to"`
	Path      []string `json:"path"`
	Distance  float64  `json:"distance"`
}

// RouteService contiene la lógica de negocio: construir el grafo, evaluar
// TODAS las bases y quedarse con la más cercana alcanzable.
//
// Depende del dominio, no de infraestructura (Dependency Inversion en la
// práctica: el algoritmo es puro y testeable sin red ni HTTP).
type RouteService struct{}

// NewRouteService construye el servicio sin estado (thread-safe).
func NewRouteService() *RouteService {
	return &RouteService{}
}

// FindOptimalRoute resuelve la base de grúa más cercana al siniestro.
func (s *RouteService) FindOptimalRoute(req OptimalRouteRequest) (OptimalRouteResponse, error) {
	if err := validate(req); err != nil {
		return OptimalRouteResponse{}, err
	}

	graph, err := domain.NewGraph(req.Graph)
	if err != nil {
		return OptimalRouteResponse{}, err
	}

	// El accidente debe existir en la red: si no, es un error de contrato
	// distinto de "inalcanzable".
	if !graph.HasNode(req.AccidentLocation) {
		return OptimalRouteResponse{}, domain.NewNodeNotFoundError(req.AccidentLocation)
	}

	var best *domain.Path
	bestDepot := ""

	for _, depot := range req.Depots {
		// Se evalúa cada base de forma independiente: una base aislada no debe
		// impedir que otra, sí alcanzable, sea seleccionada.
		if !graph.HasNode(depot) {
			continue
		}

		path, pathErr := graph.ShortestPath(depot, req.AccidentLocation)
		if pathErr != nil {
			var appErr *domain.AppError
			if errors.As(pathErr, &appErr) && appErr.Code == domain.CodeUnreachable {
				continue
			}
			return OptimalRouteResponse{}, pathErr
		}

		// Empate: se mantiene la primera base en el orden de entrada.
		// Esto hace la salida determinista y documentada.
		if best == nil || path.Distance < best.Distance {
			copied := path
			best = &copied
			bestDepot = depot
		}
	}

	if best == nil {
		return OptimalRouteResponse{}, domain.NewNoReachableDepotError(req.AccidentLocation, req.Depots)
	}

	return OptimalRouteResponse{
		FromDepot: bestDepot,
		To:        req.AccidentLocation,
		Path:      best.Nodes,
		Distance:  best.Distance,
	}, nil
}

// validate aplica validaciones de contrato antes de tocar el grafo.
func validate(req OptimalRouteRequest) error {
	if req.AccidentLocation == "" {
		return domain.NewValidationError("accidentLocation", "accidentLocation es obligatorio")
	}
	if len(req.Depots) == 0 {
		return domain.NewValidationError("depots", "se requiere al menos una base de grúas")
	}
	for _, depot := range req.Depots {
		if depot == "" {
			return domain.NewValidationError("depots", "las bases no pueden estar vacías")
		}
	}
	if len(req.Graph) == 0 {
		return domain.NewValidationError("graph", "el grafo no puede estar vacío")
	}
	return nil
}

// SortedDepots es un helper expuesto para tests/diagnóstico: ordena una copia.
func SortedDepots(depots []string) []string {
	copied := append([]string(nil), depots...)
	sort.Strings(copied)
	return copied
}
