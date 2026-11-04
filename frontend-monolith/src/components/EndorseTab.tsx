import { useState, type FormEvent } from 'react';
import { ApiError, authorizedPost } from '../api/http';
import { ENDORSE_API_BASE } from '../config';
import type { CoreEndorsePayload, EndorseTranslateRequest } from '../types';
import { ErrorPanel } from './ErrorPanel';
import { JsonBlock } from './JsonBlock';

// Ejemplo oficial del enunciado (producto Rumbo, CambioFrecuencia).
const EXAMPLE_REQUEST: EndorseTranslateRequest = {
  policyNumber: '08200000049',
  idEnvio: 5984,
  frecuencia: 'Semestral',
  tipoEndoso: 'CambioFrecuencia',
  producto: 'Rumbo',
  plan: 'PlanRumbo',
  moneda: 'Nuevo Sol',
  usuario: 'interface.servicios',
  fechaSolicitud: '2025-08-27',
  fechaCliente: '2025-08-27',
  fechaEfectiva: '2025-09-01',
};

type TextFieldKey = Exclude<
  keyof EndorseTranslateRequest,
  'idEnvio' | 'fechaSolicitud' | 'fechaCliente' | 'fechaEfectiva'
>;

const TEXT_FIELDS: ReadonlyArray<{ key: TextFieldKey; label: string; placeholder: string }> = [
  { key: 'policyNumber', label: 'Número de póliza', placeholder: '08200000049' },
  { key: 'producto', label: 'Producto', placeholder: 'Rumbo' },
  { key: 'tipoEndoso', label: 'Tipo de endoso', placeholder: 'CambioFrecuencia' },
  { key: 'plan', label: 'Plan', placeholder: 'PlanRumbo' },
  { key: 'frecuencia', label: 'Frecuencia de pago', placeholder: 'Semestral' },
  { key: 'moneda', label: 'Moneda', placeholder: 'Nuevo Sol' },
  { key: 'usuario', label: 'Usuario', placeholder: 'interface.servicios' },
];

const DATE_FIELDS: ReadonlyArray<{
  key: 'fechaSolicitud' | 'fechaCliente' | 'fechaEfectiva';
  label: string;
}> = [
  { key: 'fechaSolicitud', label: 'Fecha de solicitud' },
  { key: 'fechaCliente', label: 'Fecha del cliente' },
  { key: 'fechaEfectiva', label: 'Fecha efectiva' },
];

export function EndorseTab() {
  const [form, setForm] = useState<EndorseTranslateRequest>(EXAMPLE_REQUEST);
  const [result, setResult] = useState<CoreEndorsePayload | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  // Se evita `{ ...previous, [key]: value }`: TypeScript no conserva el tipo
  // exacto con claves computadas de unión. Copiar y asignar es type-safe.
  const setField = (key: TextFieldKey, value: string): void => {
    setForm((previous) => {
      const next: EndorseTranslateRequest = { ...previous };
      next[key] = value;
      return next;
    });
  };

  const setDate = (key: 'fechaSolicitud' | 'fechaCliente' | 'fechaEfectiva', value: string): void => {
    setForm((previous) => {
      const next: EndorseTranslateRequest = { ...previous };
      next[key] = value;
      return next;
    });
  };

  const setIdEnvio = (value: number): void => {
    setForm((previous) => ({ ...previous, idEnvio: value }));
  };

  const reset = (): void => {
    setForm(EXAMPLE_REQUEST);
    setResult(null);
    setError(null);
    setElapsedMs(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const startedAt = performance.now();
      const payload = await authorizedPost<CoreEndorsePayload>(
        ENDORSE_API_BASE,
        '/v1/endorse/translate',
        form,
      );
      setElapsedMs(performance.now() - startedAt);
      setResult(payload);
    } catch (caught) {
      setResult(null);
      setElapsedMs(null);
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, 'UNKNOWN_ERROR', 'Ocurrió un error inesperado.'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="panel-grid">
      <form className="card" onSubmit={(event) => void handleSubmit(event)}>
        <header className="card-header">
          <div>
            <h2>Datos del endoso</h2>
            <p className="muted">
              JSON plano de entrada. Etiquetas, orden, constantes y eventos se resuelven
              desde la plantilla en base de datos.
            </p>
          </div>
        </header>

        <div className="form-grid">
          {TEXT_FIELDS.map((field) => (
            <label key={field.key} className="field">
              <span>{field.label}</span>
              <input
                type="text"
                value={form[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => setField(field.key, event.target.value)}
                required
              />
            </label>
          ))}

          <label className="field">
            <span>ID de envío</span>
            <input
              type="number"
              min={1}
              step={1}
              value={form.idEnvio}
              onChange={(event) => setIdEnvio(Number.parseInt(event.target.value, 10) || 0)}
              required
            />
          </label>

          {DATE_FIELDS.map((field) => (
            <label key={field.key} className="field">
              <span>{field.label}</span>
              <input
                type="date"
                value={form[field.key]}
                onChange={(event) => setDate(field.key, event.target.value)}
                required
              />
            </label>
          ))}
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? 'Traduciendo…' : 'Traducir endoso'}
          </button>
          <button type="button" className="ghost-button" onClick={reset} disabled={isLoading}>
            Restaurar ejemplo
          </button>
        </div>

        {error && <ErrorPanel error={error} />}
      </form>

      <section className="card">
        <header className="card-header">
          <div>
            <h2>JSON para el core</h2>
            <p className="muted">
              Contrato de salida ordenado según la plantilla. El core no interpreta el orden
              de las claves: recibe arrays explícitos.
            </p>
          </div>
          {elapsedMs !== null && <span className="badge">{elapsedMs.toFixed(0)} ms</span>}
        </header>

        {result ? (
          <>
            <div className="summary-row">
              <span className="chip">{result.eventEntity.dynamicData.length} dynamicData</span>
              <span className="chip">{result.eventAppliedEntities.length} eventos</span>
              <span className="chip">{result.productEntity.description}</span>
              <span className="chip">{result.currency.description}</span>
            </div>
            <JsonBlock value={result} label="Respuesta" />
            <details className="details">
              <summary>Ver request enviado</summary>
              <JsonBlock value={form} label="Request" />
            </details>
          </>
        ) : (
          <div className="empty-state">
            <p>Envía el formulario para ver la traducción.</p>
            <p className="muted">
              Se solicita un JWT de demo al backend automáticamente antes de cada llamada.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
