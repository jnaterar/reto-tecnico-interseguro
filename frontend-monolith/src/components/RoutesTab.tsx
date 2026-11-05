import { Fragment, useState, type FormEvent } from 'react';
import { ApiError, authorizedPost } from '../api/http';
import { ROUTES_API_BASE } from '../config';
import type { Graph, OptimalRouteResponse } from '../types';
import { ErrorPanel } from './ErrorPanel';
import { JsonBlock } from './JsonBlock';

// Red de distritos de Lima del enunciado. El grafo viaja en el payload: el
// backend no conoce esta red, por lo que cambiar el mapa no toca el algoritmo.
const LIMA_GRAPH: Graph = {
  Miraflores: { 'San Isidro': 7, Barranco: 3 },
  'San Isidro': { Miraflores: 7, Lince: 4 },
  Barranco: { Miraflores: 3, Surco: 5 },
  Lince: { 'San Isidro': 4, Surco: 6 },
  Surco: { Barranco: 5, Lince: 6, Ate: 10 },
  Ate: { Surco: 10 },
};

// Lista estable y ordenada: el backend desempata por el orden de `depots`, así
// que el resultado es determinista para una selección dada.
const DISTRICTS: readonly string[] = Object.keys(LIMA_GRAPH).sort((a, b) =>
  a.localeCompare(b, 'es'),
);

const DEFAULT_ACCIDENT = 'San Isidro';
const DEFAULT_DEPOTS: readonly string[] = ['Miraflores', 'Ate'];

export function RoutesTab() {
  const [accidentLocation, setAccidentLocation] = useState<string>(DEFAULT_ACCIDENT);
  const [selectedDepots, setSelectedDepots] = useState<readonly string[]>(DEFAULT_DEPOTS);
  const [result, setResult] = useState<OptimalRouteResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const toggleDepot = (depot: string, checked: boolean): void => {
    setSelectedDepots((previous) => {
      if (checked) {
        return previous.includes(depot) ? previous : [...previous, depot];
      }
      return previous.filter((item) => item !== depot);
    });
  };

  const reset = (): void => {
    setAccidentLocation(DEFAULT_ACCIDENT);
    setSelectedDepots(DEFAULT_DEPOTS);
    setResult(null);
    setError(null);
    setElapsedMs(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setResult(null);

    // Se envía en el orden canónico de distritos para que el empate sea
    // determinista, independientemente del orden de clic del usuario.
    const depots = DISTRICTS.filter((district) => selectedDepots.includes(district));

    if (depots.length === 0) {
      setElapsedMs(null);
      setError(new ApiError(0, 'INVALID_DEPOTS', 'Selecciona al menos una base de grúas.'));
      return;
    }

    setIsLoading(true);
    try {
      const startedAt = performance.now();
      const response = await authorizedPost<OptimalRouteResponse>(
        ROUTES_API_BASE,
        '/v1/routes/optimal',
        { accidentLocation, depots, graph: LIMA_GRAPH },
      );
      setElapsedMs(performance.now() - startedAt);
      setResult(response);
    } catch (caught) {
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

  // Payload reactivo en tiempo real enviado al microservicio en Go
  const currentPayload = {
    accidentLocation,
    depots: DISTRICTS.filter((district) => selectedDepots.includes(district)),
    graph: LIMA_GRAPH,
  };

  return (
    <div className="panel-grid">
      <form className="card routes-card" onSubmit={(event) => void handleSubmit(event)}>
        <header className="card-header">
          <div>
            <h2>Red de grúas de Lima</h2>
            <p className="muted">
              El grafo se interpreta como <strong>no dirigido</strong>: declarar una sola
              dirección habilita ambos sentidos. El backend evalúa todas las bases y se
              queda con la más cercana alcanzable.
            </p>
          </div>
        </header>

        <label className="field">
          <span>Ubicación del accidente</span>
          <select
            value={accidentLocation}
            onChange={(event) => setAccidentLocation(event.target.value)}
            required
          >
            {DISTRICTS.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="checkbox-fieldset">
          <legend>Bases de grúas disponibles</legend>
          <div className="checkbox-grid">
            {DISTRICTS.map((district) => {
              const isAccident = district === accidentLocation;
              return (
                <label key={district} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedDepots.includes(district)}
                    onChange={(event) => toggleDepot(district, event.target.checked)}
                  />
                  <span>{district}</span>
                  {isAccident && <span className="checkbox-hint">siniestro</span>}
                </label>
              );
            })}
          </div>
          <p className="muted">
            Marca una o varias bases. Si una base está en el mismo distrito del siniestro,
            la distancia es 0 y el camino es ese distrito.
          </p>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? 'Calculando…' : 'Calcular Ruta Óptima'}
          </button>
          <button type="button" className="ghost-button" onClick={reset} disabled={isLoading}>
            Restaurar ejemplo
          </button>
        </div>

        {error && <ErrorPanel error={error} />}

        {/* Inspector interactivo y accesible del payload HTTP enviado al backend */}
        <details className="payload-inspector">
          <summary
            className="payload-inspector-summary"
            title="Haz clic para ver u ocultar el payload JSON enviado al microservicio Go"
          >
            <div className="payload-inspector-meta">
              <span className="payload-method-pill">POST</span>
              <span className="payload-inspector-title">Payload de la petición</span>
              <span className="payload-inspector-badge">
                Topología dinámica · {DISTRICTS.length} distritos
              </span>
            </div>
            <div className="payload-toggle-cta">
              <span className="payload-toggle-label">Ver payload</span>
              <span className="payload-chevron" aria-hidden="true">
                ▾
              </span>
            </div>
          </summary>
          <div className="payload-inspector-content">
            <p className="payload-inspector-hint">
              <strong>Arquitectura desacoplada:</strong> El microservicio en Go es un motor de grafos agnóstico a la ciudad: no tiene nodos ni rutas quemadas en su código. Recibe la topología vial completa en el cuerpo de la petición (<code>graph</code>) junto con el siniestro y las bases, resolviendo el camino mínimo sin depender de datos estáticos en el backend.
            </p>
            <div className="payload-json-wrap">
              <JsonBlock value={currentPayload} label="request payload (POST /v1/routes/optimal)" />
            </div>
          </div>
        </details>
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
            <p>Selecciona el siniestro y las bases, y calcula la ruta.</p>
            <p className="muted">
              Ejemplo: siniestro en San Isidro con bases Miraflores y Ate. Gana Miraflores con
              distancia 7.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
