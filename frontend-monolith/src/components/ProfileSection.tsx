import type { ReactElement } from 'react';

export function ProfileSection(): ReactElement {
  return (
    <section id="perfil" className="profile-section" aria-label="Perfil del autor">
      <div className="page-wrap">
        <header className="profile-header">
          <p className="eyebrow">Trayectoria &amp; Liderazgo Técnico</p>
          <h2 className="section-title">Sobre el autor</h2>
        </header>

        <div className="profile-card">
          <div className="profile-main-info">
            <div className="profile-avatar" aria-label="Iniciales de Jhonder Natera">
              <span>JN</span>
            </div>

            <div className="profile-identity">
              <div className="profile-name-row">
                <h3>Jhonder Natera</h3>
                <span className="profile-location-badge">📍 Perú</span>
              </div>
              <p className="profile-role">
                Senior Full Stack Engineer · Arquitecto de Software
              </p>
            </div>
          </div>

          <div className="profile-bio-block">
            <p className="profile-bio">
              Ingeniero de Sistemas con más de 10 años diseñando y desplegando aplicaciones empresariales de alta disponibilidad. Especialista en arquitecturas escalables con NestJS, Node.js y Clean Architecture (Hexagonal), y en llevar sistemas legacy a plataformas modernas sobre Google Cloud Platform. Enfoque de producto: código limpio, alcance mínimo y decisiones de arquitectura justificadas con evidencia.
            </p>
          </div>

          <div className="profile-skills-block">
            <h4 className="profile-skills-title">Competencias Clave</h4>
            <div className="profile-skills-grid">
              <span className="skill-pill">Cloud (GCP)</span>
              <span className="skill-pill">Backend (Node/NestJS, Golang)</span>
              <span className="skill-pill">Frontend (Angular, React)</span>
              <span className="skill-pill">Datos (PostgreSQL, Redis)</span>
              <span className="skill-pill">DevOps (Docker, CI/CD)</span>
            </div>
          </div>

          <div className="profile-contact-row">
            <a
              href="mailto:jhonder.natera@gmail.com"
              className="primary-button profile-contact-btn"
            >
              ✉️ jhonder.natera@gmail.com
            </a>
            <a
              href="https://linkedin.com/in/jhondernatera"
              target="_blank"
              rel="noopener noreferrer"
              className="ghost-button profile-contact-btn"
            >
              🔗 linkedin.com/in/jhondernatera
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
