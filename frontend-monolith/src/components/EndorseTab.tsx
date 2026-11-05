import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { ApiError, authorizedGet, authorizedPost } from '../api/http';
import { ENDORSE_API_BASE } from '../config';
import type {
  CoreEndorsePayload,
  EndorseTemplate,
  EndorseTranslateRequest,
  TemplateCatalogItem,
  TemplateFieldDefinition,
} from '../types';
import { ErrorPanel } from './ErrorPanel';
import { JsonBlock } from './JsonBlock';
import { Lightbox } from './Lightbox';

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

const ER_IMAGE_SRC = '/er-reto1.png';
const ER_CAPTION = 'Modelo de datos del traductor de endosos (5 tablas)';

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || String(value).trim() === '';

const asApiError = (caught: unknown, code: string, message: string): ApiError =>
  caught instanceof ApiError ? caught : new ApiError(0, code, message);

/** Identidad estable de una entrada del catálogo (producto + tipo). */
const templateKey = (item: TemplateCatalogItem): string =>
  `${item.productCode}::${item.endorsementTypeCode}`;

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

/**
 * Reescribe `producto` y `tipoEndoso` del editor con la plantilla elegida.
 *
 * Así el selector y el JSON de entrada describen el mismo caso: cambiar de
 * producto dispara una traducción distinta sin que el usuario edite el texto.
 */
function withSelection(raw: string, item: TemplateCatalogItem): string {
  let base: Record<string, unknown> = { ...EXAMPLE_REQUEST };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      base = { ...base, ...(parsed as Record<string, unknown>) };
    }
  } catch {
    // Si el editor tiene JSON inválido, el clic en el selector parte del
    // ejemplo en lugar de fallar: el selector siempre debe responder.
  }

  base.producto = item.productName;
  base.tipoEndoso = item.endorsementTypeName;
  return JSON.stringify(base, null, 2);
}

/** Origen del valor, con el nombre de columna que lo explica en BD. */
function describeOrigin(field: TemplateFieldDefinition): string {
  switch (field.source) {
    case 'CONSTANT':
      return 'constante en BD';
    case 'DEFAULT':
      return 'valor por defecto';
    default:
      return field.sourceKey ? `input.${field.sourceKey}` : 'input';
  }
}

/** Muestra un valor de plantilla distinguiendo el vacío intencional del nulo. */
function formatValue(value: string | null): string {
  if (value === null) {
    return '—';
  }
  return value === '' ? '(vacío)' : value;
}

/** Texto a mostrar cuando todavía no hay traducción de la que leer el valor. */
function configuredValue(field: TemplateFieldDefinition): string {
  switch (field.source) {
    case 'CONSTANT':
      return formatValue(field.constantValue);
    case 'DEFAULT':
      return formatValue(field.defaultValue);
    default:
      return field.defaultValue === null
        ? `se toma del payload`
        : `payload · default ${formatValue(field.defaultValue)}`;
  }
}

async function fetchCatalog(): Promise<TemplateCatalogItem[]> {
  return authorizedGet<TemplateCatalogItem[]>(ENDORSE_API_BASE, '/v1/templates');
}

async function fetchTemplate(item: TemplateCatalogItem): Promise<EndorseTemplate> {
  const product = encodeURIComponent(item.productCode);
  const endorsementType = encodeURIComponent(item.endorsementTypeCode);
  return authorizedGet<EndorseTemplate>(
    ENDORSE_API_BASE,
    `/v1/templates/${product}/${endorsementType}`,
  );
}

export function EndorseTab() {
  const [rawInput, setRawInput] = useState<string>(EXAMPLE_JSON);
  const [result, setResult] = useState<CoreEndorsePayload | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const [catalog, setCatalog] = useState<TemplateCatalogItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [template, setTemplate] = useState<EndorseTemplate | null>(null);
  const [templateError, setTemplateError] = useState<ApiError | null>(null);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isErImageMissing, setIsErImageMissing] = useState(false);

  // Descarta respuestas fuera de orden si el usuario cambia de plantilla rápido.
  const templateRequestId = useRef(0);

  const selected = catalog.find((item) => templateKey(item) === selectedKey) ?? null;

  const applyTemplate = useCallback(async (item: TemplateCatalogItem): Promise<void> => {
    const requestId = templateRequestId.current + 1;
    templateRequestId.current = requestId;

    setIsTemplateLoading(true);
    setTemplateError(null);

    try {
      const loaded = await fetchTemplate(item);
      if (templateRequestId.current !== requestId) {
        return;
      }
      setTemplate(loaded);
    } catch (caught) {
      if (templateRequestId.current !== requestId) {
        return;
      }
      setTemplate(null);
      setTemplateError(
        asApiError(caught, 'TEMPLATE_ERROR', 'No se pudo cargar la plantilla aplicada.'),
      );
    } finally {
      if (templateRequestId.current === requestId) {
        setIsTemplateLoading(false);
      }
    }
  }, []);

  // El catálogo lo dicta la base de datos: si mañana se inserta una plantilla
  // nueva, aparece aquí sin tocar este archivo.
  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      let items: TemplateCatalogItem[];
      try {
        items = await fetchCatalog();
      } catch (caught) {
        if (!cancelled) {
          setTemplateError(
            asApiError(caught, 'CATALOG_ERROR', 'No se pudo cargar el catálogo de plantillas.'),
          );
        }
        return;
      }

      if (cancelled) {
        return;
      }

      setCatalog(items);
      const preferred =
        items.find(
          (item) => item.productName.toLowerCase() === EXAMPLE_REQUEST.producto.toLowerCase(),
        ) ??
        items[0] ??
        null;

      if (!preferred) {
        return;
      }

      setSelectedKey(templateKey(preferred));
      await applyTemplate(preferred);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [applyTemplate]);

  // Valores realmente usados en la última traducción, indexados por etiqueta.
  // Solo se usan si el nº de campos coincide con la plantilla mostrada, para no
  // mezclar la salida de un producto con el esquema de otro.
  const resolvedValues = useMemo<Map<string, string> | null>(() => {
    if (!result || !template) {
      return null;
    }

    const entries = result.eventEntity.dynamicData;
    if (entries.length !== template.fields.length) {
      return null;
    }

    return new Map(entries.map((entry) => [entry.etiqueta, entry.value]));
  }, [result, template]);

  const orderedFields = useMemo<TemplateFieldDefinition[]>(() => {
    if (!template) {
      return [];
    }
    return [...template.fields].sort((a, b) => a.order - b.order);
  }, [template]);

  const orderedEvents = useMemo(() => {
    if (!template) {
      return [];
    }
    return [...template.events].sort((a, b) => a.orderEvent - b.orderEvent);
  }, [template]);

  const runTranslate = async (raw: string): Promise<void> => {
    setError(null);
    setResult(null);

    let payload: EndorseTranslateRequest;
    try {
      payload = parseRequest(raw);
    } catch (caught) {
      setElapsedMs(null);
      setError(asApiError(caught, 'INVALID_PAYLOAD', 'El JSON de entrada no es válido.'));
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
      setError(asApiError(caught, 'UNKNOWN_ERROR', 'Ocurrió un error inesperado.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void runTranslate(rawInput);
  };

  const handleSelectChange = async (event: ChangeEvent<HTMLSelectElement>): Promise<void> => {
    const next = catalog.find((item) => templateKey(item) === event.target.value) ?? null;
    if (!next) {
      return;
    }

    setSelectedKey(templateKey(next));

    // El selector manda también sobre el payload: cambiar de producto reescribe
    // el JSON y vuelve a traducir, así se ve la plantilla aplicada en acción.
    const nextInput = withSelection(rawInput, next);
    setRawInput(nextInput);

    await Promise.all([applyTemplate(next), runTranslate(nextInput)]);
  };

  const reset = (): void => {
    // Restaurar el ejemplo no debe desalinear el selector: si hay una plantilla
    // elegida, el JSON restaurado se ajusta a ese producto.
    setRawInput(selected ? withSelection(EXAMPLE_JSON, selected) : EXAMPLE_JSON);
    setResult(null);
    setError(null);
    setElapsedMs(null);
  };

  const isBusy = isLoading || isTemplateLoading;

  return (
    <div className="endorse-stack">
      <div className="panel-grid">
        <form className="card" onSubmit={handleSubmit}>
          <header className="card-header">
            <div>
              <h2>JSON plano del endoso</h2>
              <p className="muted">
                Edita el payload de entrada. Las etiquetas, el orden, las constantes y los
                eventos se resuelven desde la plantilla en base de datos.
              </p>
            </div>
          </header>

          <label className="field field-editor">
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

      <section className="card endorse-template-card" aria-live="polite">
        <header className="card-header">
          <div>
            <h2>Plantilla aplicada</h2>
            <p className="muted">
              Lo que ves aquí no está escrito en el código: viene de las tablas{' '}
              <code>templates</code>, <code>template_fields</code> y <code>template_events</code>.
              El selector se puebla con <code>GET /v1/templates</code>, así que agregar un
              producto o tipo de endoso nuevo es un <strong>INSERT</strong>, no un cambio de
              código.
            </p>
          </div>
          {template && <span className="badge">v{template.version}</span>}
        </header>

        <div className="template-controls">
          <label className="field field-select">
            <span>Producto y tipo de endoso (desde BD)</span>
            <select
              value={selectedKey ?? ''}
              onChange={(event) => void handleSelectChange(event)}
              disabled={isBusy || catalog.length === 0}
            >
              {catalog.length === 0 && <option value="">Cargando plantillas…</option>}
              {catalog.map((item) => (
                <option key={templateKey(item)} value={templateKey(item)}>
                  {item.productName} · {item.endorsementTypeName} ({item.fieldCount} campos)
                </option>
              ))}
            </select>
          </label>

          {isTemplateLoading && <span className="badge">cargando…</span>}
        </div>

        {templateError && <ErrorPanel error={templateError} />}

        {template ? (
          <>
            <div className="summary-row">
              <span className="chip">{template.productName}</span>
              <span className="chip">{template.endorsementTypeName}</span>
              <span className="chip">templateId {template.templateId}</span>
              <span className="chip">versión {template.version}</span>
              <span className="chip">{template.fields.length} campos</span>
              <span className="chip">{template.events.length} eventos</span>
            </div>

            <div className="template-table-wrap">
              <table className="template-table" aria-label="Campos de la plantilla aplicada">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Etiqueta</th>
                    <th scope="col">Origen</th>
                    <th scope="col">Valor efectivo</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedFields.map((field) => {
                    const resolved = resolvedValues?.get(field.label);
                    return (
                      <tr key={`${field.order}-${field.label}`}>
                        <td className="template-order">{field.order}</td>
                        <td>
                          <code>{field.label}</code>
                        </td>
                        <td>
                          <span className={`origin-tag origin-${field.source.toLowerCase()}`}>
                            {describeOrigin(field)}
                          </span>
                        </td>
                        <td className="template-value">
                          {resolved === undefined ? configuredValue(field) : formatValue(resolved)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="template-events">
              <h3>Eventos aplicados</h3>
              <ul>
                {orderedEvents.map((event) => (
                  <li key={`${event.orderEvent}-${event.description}`}>
                    <span className="chip">orden {event.orderEvent}</span>
                    <code>{event.description}</code>
                  </li>
                ))}
              </ul>
              <p className="muted">
                El orden de los campos y de los eventos lo fijan <code>order_index</code> y{' '}
                <code>order_event</code>; el mapper nunca depende del orden de las claves de un
                objeto JavaScript.
              </p>
            </div>
          </>
        ) : (
          !isTemplateLoading &&
          !templateError && (
            <div className="empty-state">
              <p>No hay plantillas activas en la base de datos.</p>
              <p className="muted">Ejecuta el seed para cargar las plantillas del reto.</p>
            </div>
          )
        )}
      </section>

      <section className="card endorse-er-card">
        <header className="card-header">
          <div>
            <h2>Modelo Entidad-Relación</h2>
            <p className="muted">
              Cinco tablas: el producto y el tipo de endoso se relacionan con la plantilla, y
              la plantilla con sus campos y eventos. Toda la variabilidad del negocio vive aquí.
            </p>
          </div>
          {!isErImageMissing && <span className="badge">clic para ampliar</span>}
        </header>

        {isErImageMissing ? (
          <div className="empty-state">
            <p>El diagrama no está disponible.</p>
            <p className="muted">
              Genera <code>er-reto1.png</code> con <code>architecture-drawio/render_drawio.py</code>.
            </p>
          </div>
        ) : (
          <button
            type="button"
            className="endorse-er-figure"
            onClick={() => setIsLightboxOpen(true)}
            aria-label="Ampliar el diagrama Entidad-Relación"
          >
            <img
              className="endorse-er-image"
              src={ER_IMAGE_SRC}
              alt="Diagrama entidad-relación con products, endorsement_types, templates, template_fields y template_events"
              onError={() => setIsErImageMissing(true)}
            />
            <span className="diagram-caption">
              Ampliar — products · endorsement_types · templates · template_fields ·
              template_events
            </span>
          </button>
        )}
      </section>

      {isLightboxOpen && !isErImageMissing && (
        <Lightbox
          isOpen
          imageUrl={ER_IMAGE_SRC}
          caption={ER_CAPTION}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}
    </div>
  );
}
