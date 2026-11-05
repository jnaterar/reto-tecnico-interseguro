import { useState, type KeyboardEvent, type ReactElement } from 'react';
import { ArchitectureTab } from '../components/ArchitectureTab';
import { EndorseTab } from '../components/EndorseTab';
import { RoutesTab } from '../components/RoutesTab';

export type TabId = 'endorse' | 'routes' | 'architecture';

interface TabItem {
  id: TabId;
  label: string;
  hint: string;
}

const TABS: ReadonlyArray<TabItem> = [
  { id: 'endorse', label: 'Traductor de endosos', hint: 'Reto 1 · Node + Hapi' },
  { id: 'routes', label: 'Ruta óptima de grúa', hint: 'Reto 2 · Go + Dijkstra' },
  { id: 'architecture', label: 'Arquitectura – Préstamos', hint: 'Reto 3 · Diseño Cloud' },
];

export function RetosPage(): ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('endorse');

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
      setActiveTab(targetTab.id);
      const nextBtn = document.getElementById(`tab-btn-${targetTab.id}`);
      nextBtn?.focus();
    }
  };

  return (
    <div className="page-wrap page-retos-container">
      {/* Encabezado principal de la página de Retos */}
      <header className="challenges-page-header">
        <p className="eyebrow">Demostración en vivo</p>
        <h1 className="challenges-main-title">Retos Técnicos en Producción</h1>
        <p className="muted challenges-subtitle">
          Interactúa directamente con los microservicios desplegados en Google Cloud Run y explora la arquitectura para eliminar duplicidad de desembolsos.
        </p>
      </header>

      {/* Tab-bar accesible con las 3 pestañas */}
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
              className={`tab ${isActive ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <span className="tab-label">{tab.label}</span>
              <span className="tab-hint">{tab.hint}</span>
            </button>
          );
        })}
      </nav>

      {/* Panel interactivo activo (Protagonista) */}
      <main id={`tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-btn-${activeTab}`}>
        {activeTab === 'endorse' && <EndorseTab />}
        {activeTab === 'routes' && <RoutesTab />}
        {activeTab === 'architecture' && <ArchitectureTab />}
      </main>
    </div>
  );
}

