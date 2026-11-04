import { useEffect, useState } from 'react';
import { checkHealth, type HealthStatus } from './api/http';
import { EndorseTab } from './components/EndorseTab';
import { RoutesTab } from './components/RoutesTab';
import { ENDORSE_API_BASE, ROUTES_API_BASE } from './config';

type TabId = 'endorse' | 'routes';

const TABS: ReadonlyArray<{ id: TabId; label: string; hint: string }> = [
  { id: 'endorse', label: 'Traductor de endosos', hint: 'Reto 1 · Node + Hapi' },
  { id: 'routes', label: 'Ruta óptima de grúa', hint: 'Reto 2 · Go + Dijkstra' },
];

interface HealthMap {
  endorse: HealthStatus | null;
  routes: HealthStatus | null;
}

function HealthPill({ label, status }: { label: string; status: HealthStatus | null }) {
  const state = status === null ? 'unknown' : status.ok ? 'ok' : 'down';
  const text = status === null ? 'verificando' : status.detail;

  return (
    <span className={`health-pill health-${state}`} title={`${label}: ${text}`}>
      <span className="health-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('endorse');
  const [health, setHealth] = useState<HealthMap>({ endorse: null, routes: null });

  // Sondeo periódico de salud: el frontend demuestra integración real con
  // ambos servicios sin bloquear la UI.
  useEffect(() => {
    let cancelled = false;

    const refresh = async (): Promise<void> => {
      const [endorse, routes] = await Promise.all([
        checkHealth(ENDORSE_API_BASE),
        checkHealth(ROUTES_API_BASE),
      ]);
      if (!cancelled) {
        setHealth({ endorse, routes });
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Reto Técnico · Technical Lead</p>
          <h1>Interseguro</h1>
          <p className="muted">
            Dos servicios, un contrato claro: traducir endosos para el core y encontrar la grúa
            más cercana al siniestro.
          </p>
        </div>
        <div className="health-group" aria-label="Estado de los servicios">
          <HealthPill label="Endosos :8082" status={health.endorse} />
          <HealthPill label="Rutas :8081" status={health.routes} />
        </div>
      </header>

      <nav className="tab-bar" role="tablist" aria-label="Retos">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab ${activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-label">{tab.label}</span>
            <span className="tab-hint">{tab.hint}</span>
          </button>
        ))}
      </nav>

      <main role="tabpanel">{activeTab === 'endorse' ? <EndorseTab /> : <RoutesTab />}</main>

      <footer className="app-footer">
        <span>
          Reto 1: Hapi + TypeORM + plantillas en BD · Reto 2: Go + Dijkstra sobre grafo no
          dirigido
        </span>
        <span>Reto 3: arquitectura en architecture-drawio/</span>
      </footer>
    </div>
  );
}
