import { useState, type ReactElement } from 'react';
import { Lightbox } from './Lightbox';

interface ActiveDiagram {
  imageUrl: string;
  caption: string;
}

export function ArchitectureTab(): ReactElement {
  const [activeDiagram, setActiveDiagram] = useState<ActiveDiagram | null>(null);

  const openDiagram = (imageUrl: string, caption: string): void => {
    setActiveDiagram({ imageUrl, caption });
  };

  const closeDiagram = (): void => {
    setActiveDiagram(null);
  };

  return (
    <div className="arch-tab-wrap">
      {/* Encabezado interno */}
      <header className="arch-tab-header">
        <p className="eyebrow">Reto 3 · Arquitectura de Software</p>
        <h2>Duplicidad de Desembolsos</h2>
        <p className="muted arch-lead">
          Eliminar el riesgo de desembolsos duplicados por timeouts de INARI y desacoplar la experiencia del cliente.
        </p>
      </header>

      {/* Bloque comparativo AS-IS vs TO-BE */}
      <section className="arch-compare-grid" aria-label="Comparativa de arquitectura AS-IS y TO-BE">
        {/* AS-IS */}
        <div className="arch-card arch-card-asis">
          <div className="arch-card-badge-row">
            <span className="arch-badge arch-badge-warning">AS-IS · El problema</span>
            <span className="muted small">Flujo sincrónico vulnerable</span>
          </div>
          <h3>Flujo sincrónico con duplicidad</h3>
          <ol className="arch-step-list">
            <li>
              <strong>1. Bloqueo en cliente:</strong> El cliente (Zona Segura) envía el POST y <em>espera en pantalla</em>.
            </li>
            <li>
              <strong>2. Orquestación sincrónica:</strong> El backend Node orquesta e invoca INARI de forma <em>sincrónica</em>.
            </li>
            <li>
              <strong>3. Timeout del proxy:</strong> El proxy INARI aplica su timeout <code>T_proxy</code>.
            </li>
            <li>
              <strong>4. Error 502 aparente:</strong> El servidor admwr tarda más (<code>T_admwr &gt; T_proxy</code>) → el proxy devuelve <strong>502</strong> al backend.
            </li>
            <li>
              <strong>5. Duplicidad en el core:</strong> admwr <em>sigue procesando</em> y el core (AS400) ejecuta el desembolso. Al no haber idempotencia, el cliente reintenta y <strong>se duplica</strong>.
            </li>
          </ol>
        </div>

        {/* TO-BE */}
        <div className="arch-card arch-card-tobe">
          <div className="arch-card-badge-row">
            <span className="arch-badge arch-badge-success">TO-BE · La solución</span>
            <span className="muted small">Arquitectura asíncrona e idempotente</span>
          </div>
          <h3>Flujo asíncrono desacoplado</h3>
          <ol className="arch-step-list">
            <li>
              <strong>1. Clave de idempotencia:</strong> El cliente envía la solicitud con <strong>Idempotency-Key</strong> (no espera).
            </li>
            <li>
              <strong>2. Validación perimetral:</strong> API Gateway/WAF valida (JWT, rate limit, enrutamiento).
            </li>
            <li>
              <strong>3. Respuesta inmediata 202:</strong> Loans API valida, persiste y publica en <strong>Pub/Sub</strong>, respondiendo <strong>202 Accepted</strong> con <code>&#123; requestId, statusUrl &#125;</code>.
            </li>
            <li>
              <strong>4. Worker con lock y reintentos:</strong> Un trabajador en Cloud Run consume el evento, adquiere un <strong>lock por policyNumber</strong>, verifica idempotencia y llama al core con <strong>circuit breaker + retry con backoff</strong>.
            </li>
            <li>
              <strong>5. Máquina de estados:</strong> El cliente consulta el estado real; una máquina de estados (<code>PENDING → PROCESSING → COMPLETED | FAILED | COMPENSATED</code>) garantiza un único desembolso.
            </li>
          </ol>
        </div>
      </section>

      {/* Galería de diagramas con Lightbox */}
      <section className="arch-gallery-section" aria-label="Galería de diagramas de arquitectura">
        <div className="arch-gallery-head">
          <h3 className="section-subtitle">Diagramas Arquitectónicos</h3>
          <p className="muted">Haz click en cualquiera de las láminas para ampliarla a pantalla completa.</p>
        </div>

        <div className="arch-gallery-grid">
          {/* Card 1: AS-IS */}
          <figure className="arch-diagram-card" onClick={() => openDiagram('/as-is.png', 'AS-IS — Flujo sincrónico con duplicidad')}>
            <div className="diagram-thumb-wrap">
              <img
                src="/as-is.png"
                alt="Diagrama AS-IS: Flujo sincrónico con duplicidad por timeout de proxy"
                className="diagram-thumb"
              />
              <span className="diagram-zoom-badge">Ampliar diagrama</span>
            </div>
            <figcaption className="diagram-caption">
              <strong>AS-IS — Flujo sincrónico con duplicidad</strong>
              <span className="muted small">Visualiza el punto de ruptura entre T_proxy y T_admwr.</span>
            </figcaption>
          </figure>

          {/* Card 2: TO-BE */}
          <figure className="arch-diagram-card" onClick={() => openDiagram('/to-be.png', 'TO-BE — Flujo asíncrono e idempotente')}>
            <div className="diagram-thumb-wrap">
              <img
                src="/to-be.png"
                alt="Diagrama TO-BE: Flujo asíncrono e idempotente con Pub/Sub y Policy Lock"
                className="diagram-thumb"
              />
              <span className="diagram-zoom-badge">Ampliar diagrama</span>
            </div>
            <figcaption className="diagram-caption">
              <strong>TO-BE — Flujo asíncrono e idempotente</strong>
              <span className="muted small">Desacoplamiento con Pub/Sub, máquina de estados y Cloud Run.</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Pilares de la solución */}
      <section className="arch-pillars-section" aria-label="Pilares evaluados de la solución">
        <h3 className="section-subtitle">Pilares de la Solución Propuesta</h3>
        <div className="arch-pillars-grid">
          <div className="arch-pillar-card">
            <span className="pillar-num">01</span>
            <h4>Escalabilidad</h4>
            <p className="muted">
              Diseño completamente stateless + colas de mensajería en Google Cloud Pub/Sub + workers en Cloud Run con autoscaling horizontal según demanda.
            </p>
          </div>

          <div className="arch-pillar-card">
            <span className="pillar-num">02</span>
            <h4>Resiliencia y reintentos</h4>
            <p className="muted">
              Patrón Circuit Breaker, reintentos con backoff exponencial + jitter aleatorio, Dead Letter Queue (DLQ) para alertas y job de reconciliación automática.
            </p>
          </div>

          <div className="arch-pillar-card">
            <span className="pillar-num">03</span>
            <h4>Control de concurrencia</h4>
            <p className="muted">
              Idempotencia estricta (restricción <code>UNIQUE</code> en base de datos sobre <code>Idempotency-Key</code>) y Policy Lock distribuido en Redis para serializar intentos sobre la misma póliza.
            </p>
          </div>

          <div className="arch-pillar-card">
            <span className="pillar-num">04</span>
            <h4>Seguridad y Costo</h4>
            <p className="muted">
              Canal mTLS hacia INARI, validación JWT en el gateway perimetral, gestión de secretos en Google Cloud KMS, y costo optimizado mediante arquitectura serverless en capa gratuita/pago por uso.
            </p>
          </div>
        </div>
      </section>      

      {/* Nota de honestidad */}
      <footer className="arch-tab-footer">
        <p className="honesty-line">
          <em>Diseño arquitectónico documentado en draw.io. No incluye implementación en código en este alcance.</em>
        </p>
      </footer>

      {/* Lightbox Modal */}
      {activeDiagram && (
        <Lightbox
          isOpen={true}
          imageUrl={activeDiagram.imageUrl}
          caption={activeDiagram.caption}
          onClose={closeDiagram}
        />
      )}
    </div>
  );
}
