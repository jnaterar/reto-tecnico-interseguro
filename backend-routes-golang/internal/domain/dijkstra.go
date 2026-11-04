package domain

import (
	"container/heap"
	"math"
)

// Path es el resultado de un camino mínimo.
type Path struct {
	Nodes    []string
	Distance float64
}

// pqItem es un nodo dentro de la cola de prioridad (min-heap).
type pqItem struct {
	node     string
	distance float64
}

// priorityQueue implementa heap.Interface. Se usa container/heap para lograr
// O((V + E) log V) en vez de la matriz O(V^2) ingenua.
type priorityQueue []*pqItem

func (pq priorityQueue) Len() int           { return len(pq) }
func (pq priorityQueue) Less(i, j int) bool { return pq[i].distance < pq[j].distance }
func (pq priorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
}

func (pq *priorityQueue) Push(x any) {
	item, ok := x.(*pqItem)
	if !ok {
		panic("priorityQueue: tipo inesperado")
	}
	*pq = append(*pq, item)
}

func (pq *priorityQueue) Pop() any {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	*pq = old[:n-1]
	return item
}

// ShortestPath calcula el camino mínimo entre dos nodos usando Dijkstra.
//
// Supuestos documentados:
//   - Pesos no negativos (validado en NewGraph). Dijkstra no soporta negativos;
//     si el dominio los requiriera, se usaría Bellman-Ford.
//   - Grafo no dirigido (ver Graph).
//
// Devuelve un AppError tipado para nodo inexistente o destino inalcanzable.
func (g *Graph) ShortestPath(from, to string) (Path, error) {
	if !g.HasNode(from) {
		return Path{}, NewNodeNotFoundError(from)
	}
	if !g.HasNode(to) {
		return Path{}, NewNodeNotFoundError(to)
	}
	// Caso borde: la base está en el mismo distrito del siniestro.
	if from == to {
		return Path{Nodes: []string{from}, Distance: 0}, nil
	}

	distances := make(map[string]float64, len(g.adjacency))
	previous := make(map[string]string, len(g.adjacency))
	for node := range g.adjacency {
		distances[node] = math.Inf(1)
	}
	distances[from] = 0

	pq := &priorityQueue{}
	heap.Init(pq)
	heap.Push(pq, &pqItem{node: from, distance: 0})

	for pq.Len() > 0 {
		current, ok := heap.Pop(pq).(*pqItem)
		if !ok {
			continue
		}
		// Descarte de entradas obsoletas (lazy deletion).
		if current.distance > distances[current.node] {
			continue
		}
		if current.node == to {
			break
		}

		for neighbor, weight := range g.adjacency[current.node] {
			candidate := current.distance + weight
			if candidate < distances[neighbor] {
				distances[neighbor] = candidate
				previous[neighbor] = current.node
				heap.Push(pq, &pqItem{node: neighbor, distance: candidate})
			}
		}
	}

	if math.IsInf(distances[to], 1) {
		return Path{}, NewUnreachableError(from, to)
	}

	return Path{
		Nodes:    buildPath(previous, from, to),
		Distance: distances[to],
	}, nil
}

// buildPath reconstruye el camino desde el mapa de predecesores.
func buildPath(previous map[string]string, from, to string) []string {
	reversed := []string{to}
	current := to
	for current != from {
		prev, ok := previous[current]
		if !ok {
			break
		}
		reversed = append(reversed, prev)
		current = prev
	}

	path := make([]string, 0, len(reversed))
	for i := len(reversed) - 1; i >= 0; i-- {
		path = append(path, reversed[i])
	}
	return path
}
