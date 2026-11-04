import { Fragment, useState, type FormEvent } from 'react';
import { ApiError, authorizedPost } from '../api/http';
import { ROUTES_API_BASE } from '../config';
import type { Graph, OptimalRouteResponse } from '../types';
import { ErrorPanel } from './ErrorPanel';
import { JsonBlock } from './JsonBlock';

// Grafo de ejemplo con la trampa del enunciado: ninguna arista declara "E"
// como origen; E solo aparece como destino. Si el backend tratara el grafo
// como dirigido, E no tendría salidas y todas las bases serían inalcanzables.
// Al normalizar a NO dirigido: C -> D -> E = 10 y A -> B -> E = 21, gana C.
const EXAMPLE_GRAPH: Graph = {
  A: { B: 12 },
  B: { C: 5, E: 9 },
  C: { D: 7 },
  D: { E: 3 },
};

const EXAMPLE_DEPOTS = 'A, C';
const EXAMPLE_ACCIDENT = 'E';

function parseGraph(raw: string): Graph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError(0, 'INVALID_GRAPH_JSON', 'El grafo no es un JSON válido.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApiError(0, 'INVALID_GRAPH', 'El grafo debe ser un objeto { nodo: { vecino: costo } }.');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    throw new ApiError(0, 'INVALID_GRAPH', 'El grafo no puede estar vacío.');
  }

  const graph: Graph = {};
  for (const [node, neighbors] of entries) {
    if (typeof neighbors !== 'object' || neighbors === null || Array.isArray(neighbors)) {
      throw new ApiError(0, 'INVALID_GRAPH', `Los vecinos de "${node}" deben ser un objeto.`);
    }
    const normalized: Record<string, number> = {};
    for (const [neighbor, cost] of Object.entries(neighbors as Record<string, unknown>)) {
      if (typeof cost !== 'number' || !Number.isFinite(cost)) {
        throw new ApiError(0, 'INVALID_GRAPH', `El costo "${node}" → "${neighbor}" debe ser numérico.`);
      }
      normalized[neighbor] = cost;
    }
    graph[node] = normalized;
  }
  return graph;
}

export function RoutesTab() {
  const [accidentLocation, setAccidentLocation] = useState(EXAMPLE_ACCIDENT);
  const [depotsText, setDepotsText] = useState(EXAMPLE_DEPOTS);
  const [graphText, setGraphText] = useState(JSON.stringify(EXAMPLE_GRAPH, null, 2));
  const [result, setResult] = useState<OptimalRouteResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const reset = (): void => {
    setAccidentLocation(EXAMPLE_ACCIDENT);
    setDepotsText(EXAMPLE_DEPOTS);
    setGraphText(JSON.stringify(EXAMPLE_GRAPH, null, 2));
    setResult(null);
    setError(null);
    setElapsedMs(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);

    const depots = depotsText
      .split(',')
      .map((depot) => depot.trim())
      .filter((depot) => depot.length > 0);

    if (depots.length === 0) {
      setResult(null);
      setError(new ApiError(0, 'INVALID_DEPOTS', 'Indica al menos una base de grúas.'));
      return;
    }

    let graph: Graph;
    try {
      graph = parseGraph(graphText);
    } catch (caught) {
      setResult(null);
      setElapsedMs(null);
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, 'INVALID_GRAPH', 'El grafo no es válido.'),
      );
      return;
    }

    setIsLoading(true);
    try {
      const startedAt = performance.now();
      const response = await authorizedPost<OptimalRouteResponse>(
        ROUTES_API_BASE,
        '/v1/routes/optimal',
        { accidentLocation: accidentLocation.trim(), depots, graph },
      );
      setElapsedMs(performance.now() - startedAt);
      setResult(response);
    } catch (caught) {
      setResult(null);
      setElapsedMs(null);
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, 'UNKNOWN_ERROR', 'Ocurrió un error inesperado.'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="panel-grid">
      <form className="card" onSubmit={(event) => void handleSubmit(event)}>
        <header className="card-header">
          <div>
            <h2>Red de grúas</h2>
            <p className="muted">
              El grafo se interpreta como <strong>no dirigido</strong>: declarar una sola
              dirección habilita ambos sentidos. Se evalúan todas las bases.
            </p>
          </div>
        </header>

        <div className="form-grid">
          <label className="field">
            <span>Ubicación del siniestro</span>
            <input
              type="text"
              value={accidentLocation}
              onChange={(event) => setAccidentLocation(event.target.value)}
              placeholder="E"
              required
            />
          </label>

          <label className="field">
            <span>Bases de grúas (separadas por coma)</span>
            <input
              type="text"
              value={depotsText}
              onChange={(event) => setDepotsText(event.target.value)}
              placeholder="A, C"
              required
            />
          </label>
        </div>

        <label className="field">
          <span>Grafo de la red (JSON)</span>
          <textarea
            className="code-input"
            rows={14}
            value={graphText}
            onChange={(event) => setGraphText(event.target.value)}
            spellCheck={false}
          />
        </label>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? 'Calculando…' : 'Calcular ruta óptima'}
          </button>
          <button type="button" className="ghost-button" onClick={reset} disabled={isLoading}>
            Restaurar ejemplo
          </button>
        </div>

        {error && <ErrorPanel error={error} />}
      </form>

      <section className="card">
        <header className="card-header">
          <div>
            <h2>Resultado</h2>
            <p className="muted">
              Base más cercana alcanzable y camino mínimo (Dijkstra con montículo).
            </p>
          </div>
          {elapsedMs !== null && <span className="badge">{elapsedMs.toFixed(0)} ms</span>}
        </header>

        {result ? (
          <>
            <div className="route-result">
              <p className="muted">Base asignada</p>
              <p className="route-depot">{result.fromDepot}</p>
              <div className="path-list" aria-label="Camino mínimo">
                {result.path.map((node, index) => (
                  <Fragment key={`${node}-${index}`}>
                    {index > 0 && (
                      <span className="path-arrow" aria-hidden="true">
                        →
                      </span>
                    )}
                    <span
                      className={[
                        'node-chip',
                        index === 0 ? 'is-depot' : '',
                        index === result.path.length - 1 ? 'is-accident' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {node}
                    </span>
                  </Fragment>
                ))}
              </div>
              <p className="route-distance">
                Distancia total: <strong>{result.distance}</strong>
              </p>
            </div>
            <JsonBlock value={result} label="Respuesta" />
          </>
        ) : (
          <div className="empty-state">
            <p>Calcula la ruta para ver la base y el camino mínimo.</p>
            <p className="muted">
              Prueba el ejemplo: accidente en E, bases A y C. Gana C con 10 (C → D → E) frente a
              A con 21 (A → B → E), aunque ninguna arista declare E como origen.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
