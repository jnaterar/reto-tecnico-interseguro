import { useEffect, useState, type ReactElement } from 'react';
import type { HealthStatus } from '../api/http';

interface NavbarProps {
  health: {
    endorse: HealthStatus | null;
    routes: HealthStatus | null;
  };
}

function HealthDot({ status }: { status: HealthStatus | null }): ReactElement {
  const state = status === null ? 'unknown' : status.ok ? 'ok' : 'down';
  const text = status === null ? 'verificando' : status.detail;

  return (
    <span className={`nav-health-indicator health-${state}`} title={text}>
      <span className="health-dot" aria-hidden="true" />
    </span>
  );
}

export function Navbar({ health }: NavbarProps): ReactElement {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = (): void => {
      setIsScrolled(window.scrollY > 16);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const closeMenu = (): void => {
    setIsMenuOpen(false);
  };

  const isAllHealthy = health.endorse?.ok && health.routes?.ok;

  return (
    <header className={`site-navbar ${isScrolled ? 'is-scrolled' : ''}`}>
      <div className="nav-container page-wrap">
        {/* Brand & Active Demo Badge */}
        <div className="nav-brand-group">
          <a href="#inicio" className="nav-brand-link" onClick={closeMenu}>
            <span className="nav-brand-title">Reto Técnico</span>
            <span className="nav-brand-sep" aria-hidden="true">·</span>
            <span className="nav-brand-sub">Software Architecture</span>
          </a>

          <div className="nav-demo-chip" title="Estado de los servicios en Cloud Run">
            <HealthDot status={health.endorse} />
            <HealthDot status={health.routes} />
            <span className="nav-demo-text">
              {isAllHealthy ? 'Demo activa' : 'Verificando'}
            </span>
          </div>
        </div>

        {/* Mobile menu toggle button */}
        <button
          type="button"
          className="nav-hamburger-button"
          aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú de navegación'}
          aria-expanded={isMenuOpen}
          aria-controls="primary-nav-menu"
          onClick={() => setIsMenuOpen((prev) => !prev)}
        >
          <span className={`hamburger-bar ${isMenuOpen ? 'is-open' : ''}`} />
          <span className={`hamburger-bar ${isMenuOpen ? 'is-open' : ''}`} />
          <span className={`hamburger-bar ${isMenuOpen ? 'is-open' : ''}`} />
        </button>

        {/* Desktop & Mobile Navigation Links */}
        <nav
          id="primary-nav-menu"
          className={`nav-links-wrap ${isMenuOpen ? 'is-open' : ''}`}
          aria-label="Navegación principal"
        >
          <a href="#inicio" className="nav-link" onClick={closeMenu}>
            Inicio
          </a>
          <a href="#documentacion" className="nav-link" onClick={closeMenu}>
            Documentación
          </a>
          <a href="#perfil" className="nav-link" onClick={closeMenu}>
            Perfil
          </a>
          <a href="#retos" className="nav-cta-button" onClick={closeMenu}>
            Retos Técnicos <span className="cta-star" aria-hidden="true">⭐</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
