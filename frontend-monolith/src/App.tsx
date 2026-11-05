import { useEffect, useState, type KeyboardEvent, type ReactElement } from 'react';
import { checkHealth, type HealthStatus } from './api/http';
import { ArchitectureTab } from './components/ArchitectureTab';
import { DocumentationSection } from './components/DocumentationSection';
import { EndorseTab } from './components/EndorseTab';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Navbar } from './components/Navbar';
import { ProfileSection } from './components/ProfileSection';
import { RoutesTab } from './components/RoutesTab';
import { ENDORSE_API_BASE, ROUTES_API_BASE } from './config';

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

export interface HealthMap {
  endorse: HealthStatus | null;
  routes: HealthStatus | null;
}

export function App(): ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('endorse');
  const [health, setHealth] = useState<HealthMap>({ endorse: null, routes: null });

  // Sondeo periódico de salud sin bloquear la interfaz
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
    <div className="landing-layout">
      {/* 1. Header con navegación sticky y glassmorphism */}
      <Navbar health={health} />

      {/* 2. Hero Section (#inicio) */}
      <Hero />

      {/* 3. Retos Técnicos Section (#retos) ⭐ */}
      <section id="retos" className="challenges-section" aria-label="Retos Técnicos Interactivos">
        <div className="page-wrap">
          <header className="challenges-section-header">
            <div className="challenges-title-group">
              <p className="eyebrow">Demostración en Vivo</p>
              <h2 className="section-title">Retos Técnicos en Producción</h2>
              <p className="muted challenges-subtitle">
                Interactúa directamente con los microservicios desplegados en Google Cloud Run y explora la arquitectura para eliminar duplicidad de desembolsos.
              </p>
            </div>
          </header>

          {/* Tab-bar accesible con 3 pestañas */}
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

          {/* Panel activo */}
          <main id={`tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-btn-${activeTab}`}>
            {activeTab === 'endorse' && <EndorseTab />}
            {activeTab === 'routes' && <RoutesTab />}
            {activeTab === 'architecture' && <ArchitectureTab />}
          </main>
        </div>
      </section>

      {/* 4. Documentación + Stack Section (#documentacion) */}
      <DocumentationSection />

      {/* 5. Perfil del Autor (#perfil) */}
      <ProfileSection />

      {/* 6. Footer Corporativo */}
      <Footer />
    </div>
  );
}
