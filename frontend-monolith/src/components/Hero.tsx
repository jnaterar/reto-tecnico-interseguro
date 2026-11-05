import type { ReactElement } from 'react';

export function Hero(): ReactElement {
  return (
    <section id="inicio" className="hero-section" aria-label="Introducción del reto técnico">
      <div className="page-wrap hero-content">
        <div className="hero-eyebrow-badge">
          <span className="hero-sparkle" aria-hidden="true">✨</span>
          <span>Solución Cloud Native · Google Cloud Platform</span>
        </div>

        <h1 className="hero-title">
          Arquitectura Cloud &amp; Soluciones de Alto Rendimiento
        </h1>

        <p className="hero-subtitle">
          Tres componentes y una arquitectura pensada para producción: traducción de endosos, cálculo de rutas óptimas y diseño arquitectónico para eliminar duplicidad de desembolsos. Construido con foco en clean architecture, seguridad y experiencia de usuario.
        </p>

        <div className="hero-actions">
          <a href="#retos" className="primary-button hero-cta-btn">
            Ver demo
          </a>
          <a href="#documentacion" className="ghost-button hero-doc-btn">
            Leer documentación
          </a>
        </div>

        {/* 3 Stat Cards con datos verificables */}
        <div className="hero-stats-grid" aria-label="Cifras clave del despliegue">
          <div className="stat-card">
            <span className="stat-number">3</span>
            <span className="stat-label">Componentes desplegados en Google Cloud Run</span>
            <span className="stat-hint">us-central1 · Docker containers</span>
          </div>

          <div className="stat-card">
            <span className="stat-number">2+1</span>
            <span className="stat-label">Servicios backend + 1 frontend desacoplado</span>
            <span className="stat-hint">Node (Hapi) · Go (Dijkstra) · React</span>
          </div>

          <div className="stat-card">
            <span className="stat-number">&lt; 200 ms</span>
            <span className="stat-label">Latencia de referencia en procesamiento</span>
            <span className="stat-hint">SLA objetivo del perfil técnico</span>
          </div>
        </div>
      </div>
    </section>
  );
}
