import { type KeyboardEvent, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArchitectureTab } from '../components/ArchitectureTab';
import { EndorseTab } from '../components/EndorseTab';
import { RoutesTab } from '../components/RoutesTab';

export type TabId = 'endorse' | 'routes' | 'architecture';

interface TabItem {
  id: TabId;
  label: string;
  hint: string;
  badge: string;
}

const TABS: ReadonlyArray<TabItem> = [
  { id: 'endorse', label: 'Traductor de Endosos', hint: 'Node.js + Hapi · TypeORM', badge: 'Reto 1' },
  { id: 'routes', label: 'Ruta Óptima de Grúa', hint: 'Golang · Dijkstra · Min-Heap', badge: 'Reto 2' },
  { id: 'architecture', label: 'Arquitectura – Préstamos', hint: 'Diseño Cloud · Idempotencia', badge: 'Reto 3' },
];

export function RetosPage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: TabId =
    rawTab === 'routes' || rawTab === 'architecture' ? rawTab : 'endorse';

  const selectTab = (id: TabId): void => {
    setSearchParams(id === 'endorse' ? {} : { tab: id });
  };

  // Navegación accesible por teclado entre pestañas con flechas izquierda / derecha
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number): void => {
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else {
      return;
    }

    event.preventDefault();
    const targetTab = TABS[nextIndex];
    if (targetTab) {
      selectTab(targetTab.id);
      const nextBtn = document.getElementById(`tab-btn-${targetTab.id}`);
      nextBtn?.focus();
    }
  };

  return (
    <div className="page-wrap page-retos-container">
      {/* Encabezado principal de la página de Retos */}
      <header className="challenges-page-header">
        <p className="eyebrow">Demostración en vivo</p>
        <h1 className="challenges-main-title">Retos Técnicos</h1>
        <p className="muted challenges-subtitle">
          Interactúa directamente con los microservicios desplegados en Google Cloud Run y explora la arquitectura para eliminar duplicidad de desembolsos.
        </p>
      </header>

      {/* Consola de navegación central y prominente de los 3 Retos */}
      <div className="tab-deck-wrapper">
        <nav className="tab-bar tab-bar-prominent" role="tablist" aria-label="Pestañas de los Retos Técnicos">
          {TABS.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-btn-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`tab tab-${tab.id} ${isActive ? 'is-active' : ''}`}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <div className="tab-badge-row">
                  <span className={`tab-step-badge badge-${tab.id}`}>{tab.badge}</span>
                  <span className="tab-active-indicator" aria-hidden="true" />
                </div>
                <span className="tab-label">{tab.label}</span>
                <span className="tab-hint">{tab.hint}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Panel interactivo activo (Protagonista) */}
      <main id={`tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-btn-${activeTab}`}>
        {activeTab === 'endorse' && <EndorseTab />}
        {activeTab === 'routes' && <RoutesTab />}
        {activeTab === 'architecture' && <ArchitectureTab />}
      </main>
    </div>
  );
}

