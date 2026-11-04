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

const EXAMPLE_JSON = JSON.stringify(EXAMPLE_REQUEST, null, 2);

const REQUIRED_KEYS: ReadonlyArray<keyof EndorseTranslateRequest> = [
  'policyNumber',
  'idEnvio',
  'frecuencia',
  'tipoEndoso',
  'producto',
  'plan',
  'moneda',
  'usuario',
  'fechaSolicitud',
  'fechaCliente',
  'fechaEfectiva',
];

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || String(value).trim() === '';

/**
 * Lee y tipa el JSON plano del textarea antes de llamar al backend.
 *
 * El backend vuelve a validar con Joi (fuente de verdad); esto solo da feedback
 * inmediato en la UI para campos ausentes o JSON mal formado. Se construye el
 * objeto campo a campo para no propagar `unknown` al contrato tipado.
 */
function parseRequest(raw: string): EndorseTranslateRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError(0, 'INVALID_JSON', 'El texto no es un JSON válido.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApiError(0, 'INVALID_PAYLOAD', 'El JSON de entrada debe ser un objeto.');
  }

  const record = parsed as Record<string, unknown>;
  const missing = REQUIRED_KEYS.filter((key) => isBlank(record[key]));
  if (missing.length > 0) {
    throw new ApiError(0, 'MISSING_FIELDS', `Faltan campos obligatorios: ${missing.join(', ')}`);
  }

  const idEnvio = record.idEnvio;
  if (typeof idEnvio !== 'number' || !Number.isInteger(idEnvio)) {
    throw new ApiError(0, 'INVALID_ID_ENVIO', 'idEnvio debe ser un número entero.');
  }

  return {
    policyNumber: String(record.policyNumber),
    idEnvio,
    frecuencia: String(record.frecuencia),
    tipoEndoso: String(record.tipoEndoso),
    producto: String(record.producto),
    plan: String(record.plan),
    moneda: String(record.moneda),
    usuario: String(record.usuario),
    fechaSolicitud: String(record.fechaSolicitud),
    fechaCliente: String(record.fechaCliente),
    fechaEfectiva: String(record.fechaEfectiva),
  };
}

export function EndorseTab() {
  const [rawInput, setRawInput] = useState<string>(EXAMPLE_JSON);
  const [result, setResult] = useState<CoreEndorsePayload | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const reset = (): void => {
    setRawInput(EXAMPLE_JSON);
    setResult(null);
    setError(null);
    setElapsedMs(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setResult(null);

    let payload: EndorseTranslateRequest;
    try {
      payload = parseRequest(rawInput);
    } catch (caught) {
      setElapsedMs(null);
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, 'INVALID_PAYLOAD', 'El JSON de entrada no es válido.'),
      );
      return;
    }

    setIsLoading(true);
    try {
      const startedAt = performance.now();
      const response = await authorizedPost<CoreEndorsePayload>(
        ENDORSE_API_BASE,
        '/v1/endorse/translate',
        payload,
      );
      setElapsedMs(performance.now() - startedAt);
      setResult(response);
    } catch (caught) {
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
            <h2>JSON plano del endoso</h2>
            <p className="muted">
              Edita el payload de entrada. Las etiquetas, el orden, las constantes y los
              eventos se resuelven desde la plantilla en base de datos.
            </p>
          </div>
        </header>

        <label className="field">
          <span>Payload de entrada (JSON)</span>
          <textarea
            className="code-input"
            rows={22}
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            spellCheck={false}
          />
        </label>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? 'Traduciendo…' : 'Traducir'}
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
            <h2>JSON estructurado para el core</h2>
            <p className="muted">
              Respuesta ordenada según la plantilla. El core recibe arrays explícitos, no
              el orden de claves de un objeto.
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
          </>
        ) : (
          <div className="empty-state">
            <p>Pulsa «Traducir» para ver el JSON estructurado.</p>
            <p className="muted">
              El frontend solicita un JWT de demo al backend y lo envía en el header
              Authorization antes de cada llamada.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
