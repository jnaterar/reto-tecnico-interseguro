import { useEffect, useState, type ReactElement } from 'react';
import { NavLink } from 'react-router-dom';
import { ServicesStatusPopover, type HealthMap } from './ServicesStatusPopover';

interface NavbarProps {
  health: HealthMap;
}

export function Navbar({ health }: NavbarProps): ReactElement {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = (): void => {
      setIsScrolled(window.scrollY > 12);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const closeMenu = (): void => {
    setIsMenuOpen(false);
  };

  return (
    <header className={`site-navbar ${isScrolled ? 'is-scrolled' : ''}`}>
      <div className="nav-container page-wrap">
        {/* Marca del proyecto e indicador de estado de servicios */}
        <div className="nav-brand-group">
          <NavLink to="/retos" className="nav-brand-link" onClick={closeMenu}>
            <span className="nav-brand-title">Reto Técnico</span>
            <span className="nav-brand-sep" aria-hidden="true">·</span>
            <span className="nav-brand-sub">Software Architecture</span>
          </NavLink>

          <ServicesStatusPopover health={health} />
        </div>

        {/* Botón de menú móvil (hamburguesa accesible) */}
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

        {/* Navegación por rutas SPA */}
        <nav
          id="primary-nav-menu"
          className={`nav-links-wrap ${isMenuOpen ? 'is-open' : ''}`}
          aria-label="Navegación principal"
        >
          <NavLink
            to="/retos"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'is-active' : ''}`
            }
            onClick={closeMenu}
          >
            Retos Técnicos
          </NavLink>

          <NavLink
            to="/documentacion"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'is-active' : ''}`
            }
            onClick={closeMenu}
          >
            Documentación
          </NavLink>

          <NavLink
            to="/perfil"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'is-active' : ''}`
            }
            onClick={closeMenu}
          >
            Perfil
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
