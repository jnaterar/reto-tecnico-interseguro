import type { ReactElement } from 'react';

export function Footer(): ReactElement {
  return (
    <footer className="site-footer" aria-label="Pie de página">
      <div className="page-wrap footer-inner">
        <div className="footer-cols-grid">
          {/* Columna A: Proyecto */}
          <div className="footer-col">
            <span className="footer-brand-title">Reto Técnico · Software Architecture</span>
            <p className="footer-desc muted">
              Arquitectura cloud-native con Hapi, Go, React y PostgreSQL. Enfoque pragmático orientado a producción y resiliencia de negocio.
            </p>
          </div>

          {/* Columna B: Navegación */}
          <div className="footer-col">
            <span className="footer-col-title">Navegación</span>
            <ul className="footer-links-list">
              <li><a href="#inicio">Inicio</a></li>
              <li><a href="#retos">Retos Técnicos ⭐</a></li>
              <li><a href="#documentacion">Documentación &amp; Stack</a></li>
              <li><a href="#perfil">Sobre el autor</a></li>
            </ul>
          </div>

          {/* Columna C: Contacto */}
          <div className="footer-col">
            <span className="footer-col-title">Contacto &amp; Redes</span>
            <ul className="footer-links-list">
              <li>
                <a href="mailto:jhonder.natera@gmail.com">jhonder.natera@gmail.com</a>
              </li>
              <li>
                <a href="https://linkedin.com/in/jhondernatera" target="_blank" rel="noopener noreferrer">
                  LinkedIn: jhondernatera
                </a>
              </li>
              <li>
                <span className="muted small">Lima, Perú · Remoto / Híbrido</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Línea inferior textual obligatoria */}
        <div className="footer-bottom-line">
          <p>© 2026 Jhonder Natera · Reto técnico para Interseguro · Demo desplegada en Google Cloud Run (us-central1).</p>
        </div>
      </div>
    </footer>
  );
}
