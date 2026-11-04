import type { ApiError } from '../api/http';

interface ErrorPanelProps {
  error: ApiError;
}

/** Muestra el envelope de error tipado de los backends sin ocultar el código. */
export function ErrorPanel({ error }: ErrorPanelProps) {
  return (
    <div className="alert alert-error" role="alert">
      <div className="alert-head">
        <span className="code-badge">{error.code}</span>
        <span className="alert-message">{error.message}</span>
      </div>
      {error.status > 0 && <p className="alert-meta">HTTP {error.status}</p>}
      {error.details !== undefined && (
        <pre className="alert-details">{JSON.stringify(error.details, null, 2)}</pre>
      )}
    </div>
  );
}
