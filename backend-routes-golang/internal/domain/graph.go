package domain

// Graph es una red de distritos NO DIRIGIDA.
//
// Decisión de diseño clave: el JSON de entrada describe aristas de forma
// "dirigida" (por ejemplo Miraflores -> Barranco = 3, sin la arista inversa),
// pero una vía urbana se recorre en ambos sentidos. Para el cálculo de la grúa
// más cercana, tratar el grafo como dirigido dejaría bases inalcanzables de
// forma artificial. Por eso la construcción normaliza cada arista a doble
// sentido (u -> v y v -> u con el mismo peso).
//
// Extensibilidad: el grafo se recibe como dato (input/archivo/env), nunca se
// codifica en el algoritmo. Cambiar la red de Lima no requiere tocar código.
type Graph struct {
	adjacency map[string]map[string]float64
}

// NewGraph construye un grafo no dirigido validando pesos no negativos.
func NewGraph(raw map[string]map[string]float64) (*Graph, error) {
	if len(raw) == 0 {
		return nil, NewValidationError("graph", "el grafo no puede estar vacío")
	}

	g := &Graph{adjacency: make(map[string]map[string]float64, len(raw))}

	for from, edges := range raw {
		if from == "" {
			return nil, NewValidationError("graph", "el grafo contiene un nodo sin nombre")
		}
		g.ensureNode(from)

		for to, weight := range edges {
			if to == "" {
				return nil, NewValidationError("graph", "el grafo contiene una arista sin destino")
			}
			if weight < 0 {
				return nil, NewNegativeWeightError(from, to, weight)
			}
			g.ensureNode(to)
			// Normalización a no dirigido: se agrega en ambos sentidos.
			// Si la entrada define ambos sentidos con pesos distintos, se
			// conserva el menor (la distancia de la vía es la más corta).
			g.addEdge(from, to, weight)
			g.addEdge(to, from, weight)
		}
	}

	return g, nil
}

func (g *Graph) ensureNode(node string) {
	if _, ok := g.adjacency[node]; !ok {
		g.adjacency[node] = make(map[string]float64)
	}
}

func (g *Graph) addEdge(from, to string, weight float64) {
	if g.adjacency[from] == nil {
		g.adjacency[from] = make(map[string]float64)
	}
	existing, ok := g.adjacency[from][to]
	if !ok || weight < existing {
		g.adjacency[from][to] = weight
	}
}

// HasNode indica si el distrito existe en la red.
func (g *Graph) HasNode(node string) bool {
	_, ok := g.adjacency[node]
	return ok
}

// Neighbors devuelve las aristas salientes (ya normalizadas a no dirigido).
func (g *Graph) Neighbors(node string) map[string]float64 {
	return g.adjacency[node]
}

// Nodes devuelve la lista de distritos del grafo.
func (g *Graph) Nodes() []string {
	nodes := make([]string, 0, len(g.adjacency))
	for node := range g.adjacency {
		nodes = append(nodes, node)
	}
	return nodes
}
