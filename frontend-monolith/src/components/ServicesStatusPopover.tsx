import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { HealthStatus } from '../api/http';

export interface HealthMap {
  endorse: HealthStatus | null;
  routes: HealthStatus | null;
}

interface ServicesStatusPopoverProps {
  health: HealthMap;
}

function resolveState(status: HealthStatus | null): {
  state: 'ok' | 'down' | 'unknown';
  label: string;
} {
  if (status === null) {
    return { state: 'unknown', label: 'Verificando…' };
  }
  return status.ok
    ? { state: 'ok', label: 'Operativo' }
    : { state: 'down', label: 'No disponible' };
}

export function ServicesStatusPopover({ health }: ServicesStatusPopoverProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const endorseInfo = resolveState(health.endorse);
  const routesInfo = resolveState(health.routes);

  const isAllOk = endorseInfo.state === 'ok' && routesInfo.state === 'ok';
  const hasDown = endorseInfo.state === 'down' || routesInfo.state === 'down';
  const overallState: 'ok' | 'down' | 'unknown' = hasDown ? 'down' : isAllOk ? 'ok' : 'unknown';
  const overallText = hasDown ? 'Degradado' : isAllOk ? 'Operativos' : 'Verificando';

  // Cierre accesible con tecla Escape y click fuera
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="services-status-wrapper"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className={`services-status-trigger status-${overallState}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Servicios Cloud Run: ${overallText}. Haz clic para ver detalle.`}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className={`status-dot-pulse dot-${overallState}`} aria-hidden="true" />
        <span className="status-trigger-title">Servicios Cloud Run</span>
        <span className={`status-badge-text badge-${overallState}`}>
          {overallText}
        </span>
      </button>

      {isOpen && (
        <div
          className="services-status-popover"
          role="dialog"
          aria-label="Detalle de estado de los servicios"
        >
          <div className="status-popover-header">
            <span className="status-popover-title">Google Cloud Run (us-central1)</span>
            <span className="muted small">Sondeo automático cada 15 s</span>
          </div>

          <ul className="status-services-list">
            <li className="status-service-item">
              <div className="status-service-info">
                <span className={`service-status-dot dot-${endorseInfo.state}`} aria-hidden="true" />
                <div className="service-details">
                  <span className="service-name">Endosos (Node · Hapi)</span>
                  <span className="service-desc muted small">
                    Traductor · Puerto 8082 · v1
                  </span>
                </div>
              </div>
              <span className={`service-status-pill badge-${endorseInfo.state}`}>
                {endorseInfo.label}
              </span>
            </li>

            <li className="status-service-item">
              <div className="status-service-info">
                <span className={`service-status-dot dot-${routesInfo.state}`} aria-hidden="true" />
                <div className="service-details">
                  <span className="service-name">Rutas (Go)</span>
                  <span className="service-desc muted small">
                    Dijkstra · Puerto 8081 · v1
                  </span>
                </div>
              </div>
              <span className={`service-status-pill badge-${routesInfo.state}`}>
                {routesInfo.label}
              </span>
            </li>
          </ul>

          <div className="status-popover-footer">
            <span className="muted small">
              Presiona <kbd>Esc</kbd> o haz clic fuera para cerrar.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

