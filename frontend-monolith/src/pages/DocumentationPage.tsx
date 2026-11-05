import { useState, type ReactElement } from 'react';

function CopySnippet({ code, label }: { code: string; label: string }): ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        throw new Error('Clipboard API no disponible');
      }
    } catch {
      // Fallback para navegadores headless o entornos restringidos
      try {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      } catch {
        // Ignorar si el portapapeles está completamente bloqueado
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="snippet-container">
      <div className="snippet-head">
        <span className="snippet-label">{label}</span>
        <button
          type="button"
          className={`code-copy-button ${copied ? 'is-copied' : ''}`}
          onClick={() => void handleCopy()}
          aria-label={`Copiar comando ${label}`}
        >
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      <pre className="snippet-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function DocumentationPage(): ReactElement {
  return (
    <div className="page-wrap page-doc-container">
      <header className="doc-page-header">
        <p className="eyebrow">Documentación Técnica &amp; Stack</p>
        <h1 className="doc-main-title">Cómo se resolvió cada reto</h1>
        <p className="muted doc-subtitle">El por qué detrás de cada decisión, explicado simple.</p>
      </header>

      {/* Índice sticky con chips ancla */}
      <nav className="doc-nav-chips" aria-label="Índice de retos">
        <a href="#reto-1" className="doc-nav-chip chip-r1">
          <span className="chip-dot dot-r1" aria-hidden="true" />
          Reto 1 · Endosos
        </a>
        <a href="#reto-2" className="doc-nav-chip chip-r2">
          <span className="chip-dot dot-r2" aria-hidden="true" />
          Reto 2 · Rutas
        </a>
        <a href="#reto-3" className="doc-nav-chip chip-r3">
          <span className="chip-dot dot-r3" aria-hidden="true" />
          Reto 3 · Arquitectura
        </a>
      </nav>

      {/* ARTÍCULO RETO 1 */}
      <article id="reto-1" className="challenge-article challenge-r1">
        <header className="article-header">
          <div className="article-tag-row">
            <span className="article-badge r1-badge">Reto 1 · Traductor de endosos</span>
            <span className="muted small">Node.js · Hapi · TypeORM</span>
          </div>
          <h2>Normalización y traducción dinámica hacia el core</h2>
        </header>

        {/* ① En palabras sencillas */}
        <div className="simple-words-card">
          <span className="section-step-num">1</span>
          <div>
            <h3 className="simple-words-title">En palabras sencillas</h3>
            <p>
              Llega una solicitud de endoso en un formato &quot;plano&quot; (un JSON con campos sueltos). El servicio la lee, la entiende y la reescribe en un formato &quot;estructurado&quot; que el core sí puede procesar. Es como traducir de un idioma informal a un idioma formal, sin perder ningún dato.
            </p>
          </div>
        </div>

        {/* ② Cómo funciona */}
        <div className="how-it-works-block">
          <h3>2. Cómo funciona</h3>
          <ol className="step-numbered-list">
            <li>
              <strong>Recibe y valida el payload plano:</strong> Validación perimetral estricta con Joi en el backend.
            </li>
            <li>
              <strong>Consulta en BD la plantilla:</strong> Según producto + tipo de endoso: orden y etiquetas de <code>dynamicData</code>, lista de <code>eventAppliedEntities</code> y valores por defecto.
            </li>
            <li>
              <strong>Mapea cada campo a la estructura del core:</strong> Respeta orden y defaults institucionales.
            </li>
            <li>
              <strong>Devuelve el JSON estructurado:</strong> Entrega un objeto serializado con arrays explícitos listo para el core transaccional.
            </li>
          </ol>
        </div>

        {/* ③ Tecnologías */}
        <div className="tech-block">
          <h3>3. Tecnologías</h3>
          <div className="tech-pills-row" aria-label="Tecnologías del Reto 1">
            <span className="tech-pill">Node.js</span>
            <span className="tech-pill">Hapi</span>
            <span className="tech-pill">TypeScript</span>
            <span className="tech-pill">TypeORM</span>
            <span className="tech-pill">PostgreSQL (Neon)</span>
            <span className="tech-pill">JWT</span>
            <span className="tech-pill">Docker</span>
            <span className="tech-pill">Google Cloud Run</span>
          </div>
        </div>

        {/* Progressive disclosure: ④ Decisiones y ⑤ Verificación */}
        <details className="tech-details-accordion">
          <summary className="accordion-summary">
            <span>Ver detalle técnico y verificación del Reto 1</span>
            <span className="accordion-arrow" aria-hidden="true">▾</span>
          </summary>
          <div className="accordion-content">
            <div className="decisions-block">
              <h4>4. Decisiones y trade-offs</h4>
              <ul className="decisions-list">
                <li className="decision-chosen">
                  <strong>✔ Arquitectura en capas:</strong> routes / controller / service / repository / model / mapper exigida por el enunciado.
                </li>
                <li className="decision-chosen">
                  <strong>✔ Plantillas configurables en BD:</strong> agregar producto/endoso nuevo <em>sin tocar código</em> (extensibilidad).
                </li>
                <li className="decision-chosen">
                  <strong>✔ Preservar campos vacíos (<code>&quot;&quot;</code>) y valores Default:</strong> en lugar de descartarlos.
                </li>
                <li className="decision-chosen">
                  <strong>✔ Versionado del API + pruebas unitarias:</strong> contratos reproducibles y confiables.
                </li>
                <li className="decision-discarded">
                  <strong>✘ Descartado transformar en el cliente:</strong> menos seguro, no reutilizable.
                </li>
              </ul>
            </div>

            <div className="verification-block">
              <h4>5. Cómo verificarlo</h4>
              <p className="muted small">
                <code>POST /v1/auth/token</code> → token JWT; <code>POST /v1/endorse/translate</code> con el payload de ejemplo → <strong>200 OK</strong> con 12 <code>dynamicData</code>, <code>eventAppliedEntities</code> y <code>riskUnitEntities</code> correctos.
              </p>
              <CopySnippet
                label="cURL · Test Endorsement Translator"
                code={`# 1. Obtener token JWT de demo
TOKEN=$(curl -s -X POST https://endorsements-919990628042.us-central1.run.app/v1/auth/token \\
  -H "Content-Type: application/json" -d '{}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 2. Enviar traducción con payload Rumbo / CambioFrecuencia
curl -s -X POST https://endorsements-919990628042.us-central1.run.app/v1/endorse/translate \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{
    "policyNumber": "08200000049",
    "idEnvio": 5984,
    "frecuencia": "Semestral",
    "tipoEndoso": "CambioFrecuencia",
    "producto": "Rumbo",
    "plan": "PlanRumbo",
    "moneda": "Nuevo Sol",
    "usuario": "interface.servicios",
    "fechaSolicitud": "2025-08-27",
    "fechaCliente": "2025-08-27",
    "fechaEfectiva": "2025-09-01"
  }'`}
              />
            </div>
          </div>
        </details>
      </article>

      {/* ARTÍCULO RETO 2 */}
      <article id="reto-2" className="challenge-article challenge-r2">
        <header className="article-header">
          <div className="article-tag-row">
            <span className="article-badge r2-badge">Reto 2 · Ruta óptima de grúa</span>
            <span className="muted small">Golang · Algoritmo Dijkstra</span>
          </div>
          <h2>Cálculo determinista de camino mínimo en grafos no dirigidos</h2>
        </header>

        {/* ① En palabras sencillas */}
        <div className="simple-words-card">
          <span className="section-step-num">1</span>
          <div>
            <h3 className="simple-words-title">En palabras sencillas</h3>
            <p>
              Cuando ocurre un accidente, hay que enviar la grúa desde la base más cercana por el camino más corto. El servicio recibe un &quot;mapa&quot; de distritos conectados con distancias y calcula la ruta óptima automáticamente.
            </p>
          </div>
        </div>

        {/* ② Cómo funciona */}
        <div className="how-it-works-block">
          <h3>2. Cómo funciona</h3>
          <ol className="step-numbered-list">
            <li>
              <strong>Recibe parámetros de entrada:</strong> Distrito del accidente, bases de grúas y el grafo (nodos = distritos, pesos = distancias).
            </li>
            <li>
              <strong>Ejecuta el algoritmo de Dijkstra:</strong> Evalúa las distancias acumuladas desde cada base disponible.
            </li>
            <li>
              <strong>Elige la base más cercana:</strong> Resuelve deterministamente ante empates.
            </li>
            <li>
              <strong>Devuelve la ruta y la distancia total:</strong> Si el destino no es alcanzable, retorna error controlado tipado.
            </li>
          </ol>
        </div>

        {/* ③ Tecnologías */}
        <div className="tech-block">
          <h3>3. Tecnologías</h3>
          <div className="tech-pills-row" aria-label="Tecnologías del Reto 2">
            <span className="tech-pill">Golang</span>
            <span className="tech-pill">Dijkstra (grafo no dirigido)</span>
            <span className="tech-pill">JWT</span>
            <span className="tech-pill">Docker</span>
            <span className="tech-pill">Google Cloud Run</span>
          </div>
        </div>

        {/* Progressive disclosure: ④ Decisiones y ⑤ Verificación */}
        <details className="tech-details-accordion">
          <summary className="accordion-summary">
            <span>Ver detalle técnico y verificación del Reto 2</span>
            <span className="accordion-arrow" aria-hidden="true">▾</span>
          </summary>
          <div className="accordion-content">
            <div className="decisions-block">
              <h4>4. Decisiones y trade-offs</h4>
              <ul className="decisions-list">
                <li className="decision-chosen">
                  <strong>✔ Implementado en Golang:</strong> exigido por el enunciado, con el algoritmo de Dijkstra modular y testeado.
                </li>
                <li className="decision-chosen">
                  <strong>✔ Grafo no dirigido:</strong> una vía se recorre en ambos sentidos para modelar la realidad vial.
                </li>
                <li className="decision-chosen">
                  <strong>✔ Grafo como mapa de adyacencia:</strong> el mapa de Lima cambia dinámicamente sin tocar la lógica.
                </li>
                <li className="decision-chosen">
                  <strong>✔ Soporte de múltiples depósitos:</strong> devolviendo siempre la base más cercana alcanzable.
                </li>
                <li className="decision-discarded">
                  <strong>✘ Descartado asumir dirección única:</strong> daría rutas incorrectas en calles bidireccionales.
                </li>
                <li className="decision-discarded">
                  <strong>✘ Descartado hardcodear distritos:</strong> limitaría el servicio a un único mapa estático.
                </li>
              </ul>
            </div>

            <div className="verification-block">
              <h4>5. Cómo verificarlo</h4>
              <p className="muted small">
                <code>POST /v1/routes/optimal</code> con el payload del enunciado → <code>&#123;fromDepot, to, path, distance&#125;</code> (con el grafo de ejemplo, <code>Miraflores → San Isidro</code>, distancia <code>7</code>).
              </p>
              <CopySnippet
                label="cURL · Test Optimal Route (Golang)"
                code={`# 1. Obtener token JWT de demo
TOKEN=$(curl -s -X POST https://routes-919990628042.us-central1.run.app/v1/auth/token \\
  -H "Content-Type: application/json" -d '{}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 2. Calcular ruta óptima
curl -s -X POST https://routes-919990628042.us-central1.run.app/v1/routes/optimal \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{
    "accidentLocation": "San Isidro",
    "depots": ["Miraflores", "Ate"],
    "graph": {
      "Miraflores": { "San Isidro": 7, "Barranco": 3 },
      "San Isidro": { "Miraflores": 7, "Lince": 4 },
      "Barranco": { "Miraflores": 3, "Surco": 5 },
      "Lince": { "San Isidro": 4, "Surco": 6 },
      "Surco": { "Barranco": 5, "Lince": 6, "Ate": 10 },
      "Ate": { "Surco": 10 }
    }
  }'`}
              />
            </div>
          </div>
        </details>
      </article>

      {/* ARTÍCULO RETO 3 */}
      <article id="reto-3" className="challenge-article challenge-r3">
        <header className="article-header">
          <div className="article-tag-row">
            <span className="article-badge r3-badge">Reto 3 · Diseño de arquitectura</span>
            <span className="muted small">Sistemas Distribuidos · Idempotencia</span>
          </div>
          <h2>Eliminación de desembolsos duplicados por timeouts de INARI</h2>
        </header>

        {/* ① En palabras sencillas */}
        <div className="simple-words-card">
          <span className="section-step-num">1</span>
          <div>
            <h3 className="simple-words-title">En palabras sencillas</h3>
            <p>
              El cliente pide un préstamo y se queda esperando en pantalla. Si el sistema interno (INARI) tarda, el proxy responde con un error 502 — pero el préstamo sigue procesándose en segundo plano y a veces sí se desembolsa. El cliente ve &quot;falló&quot;, vuelve a intentar y <strong>se desembolsa dos veces</strong>. El reto fue rediseñar la arquitectura para que el cliente nunca dependa de esa espera y para que sea imposible desembolsar el mismo préstamo dos veces.
            </p>
          </div>
        </div>

        {/* ② Cómo funciona */}
        <div className="how-it-works-block">
          <h3>2. Cómo funciona</h3>
          <ol className="step-numbered-list">
            <li>
              <strong>El cliente no espera:</strong> Se responde de inmediato <strong>202 Accepted</strong> con un <code>requestId</code>.
            </li>
            <li>
              <strong>Publicación en cola:</strong> La solicitud se publica en una cola (<strong>Pub/Sub</strong>).
            </li>
            <li>
              <strong>Worker con idempotencia:</strong> Un worker la procesa con <strong>idempotencia</strong> (clave única) y <strong>lock por póliza</strong>.
            </li>
            <li>
              <strong>Resiliencia al core:</strong> Llama a INARI con <strong>circuit breaker + retry</strong>; el cliente consulta el estado real, nunca el 502 del proxy.
            </li>
          </ol>
        </div>

        {/* ③ Tecnologías */}
        <div className="tech-block">
          <h3>3. Tecnologías y patrones</h3>
          <div className="tech-pills-row" aria-label="Patrones y tecnologías del Reto 3">
            <span className="tech-pill">draw.io</span>
            <span className="tech-pill">Arquitectura asíncrona (Pub/Sub)</span>
            <span className="tech-pill">Idempotencia</span>
            <span className="tech-pill">Circuit breaker + retry con backoff</span>
            <span className="tech-pill">Locks distribuidos (Redis)</span>
            <span className="tech-pill">Máquina de estados</span>
            <span className="tech-pill">mTLS</span>
            <span className="tech-pill">KMS</span>
            <span className="tech-pill">Cloud Scheduler (reconciliación)</span>
          </div>
        </div>

        {/* Progressive disclosure: ④ Decisiones y ⑤ Verificación */}
        <details className="tech-details-accordion">
          <summary className="accordion-summary">
            <span>Ver detalle técnico y verificación del Reto 3</span>
            <span className="accordion-arrow" aria-hidden="true">▾</span>
          </summary>
          <div className="accordion-content">
            <div className="decisions-block">
              <h4>4. Decisiones y trade-offs</h4>
              <ul className="decisions-list">
                <li className="decision-chosen">
                  <strong>✔ Desacoplar la experiencia del cliente:</strong> inmune a la latencia de INARI.
                </li>
                <li className="decision-chosen">
                  <strong>✔ Idempotencia + UNIQUE constraint:</strong> elimina la duplicidad de raíz.
                </li>
                <li className="decision-chosen">
                  <strong>✔ Reintentos idempotentes con backoff + DLQ:</strong> absorbe saturación transitoria.
                </li>
                <li className="decision-chosen">
                  <strong>✔ Job de reconciliación para estados colgados:</strong> evita préstamos &quot;atascados&quot;.
                </li>
                <li className="decision-discarded">
                  <strong>✘ Descartado mantener el flujo 100% sincrónico:</strong> el problema de timeout persistiría.
                </li>
                <li className="decision-discarded">
                  <strong>✘ Descartado &quot;solo mejorar el proxy&quot;:</strong> reduce la frecuencia, no elimina la causa.
                </li>
              </ul>
            </div>

            <div className="verification-block">
              <h4>5. Cómo verificarlo</h4>
              <p className="muted small">
                Diagramas <strong>AS-IS</strong> y <strong>TO-BE</strong> en draw.io + tabla de criterios evaluados (escalabilidad, resiliencia, concurrencia, seguridad, costo).
              </p>
              <CopySnippet
                label="Artefactos de Arquitectura Reto 3"
                code={`# Ubicación de diagramas editables y exportados
./architecture-drawio/as-is.drawio    # Diagrama de flujo actual vulnerable
./architecture-drawio/to-be.drawio    # Diagrama de solución idempotente
./architecture-drawio/as-is.png       # Exportación HD (incluida en pestaña Retos)
./architecture-drawio/to-be.png       # Exportación HD (incluida en pestaña Retos)`}
              />
            </div>
          </div>
        </details>
      </article>

      {/* Bloque: Notas de honestidad técnica */}
      <div className="honesty-notes-card">
        <div>
          <h3>Notas de honestidad técnica</h3>
          <ul className="honesty-list">
            <li>
              <strong>Variables de entorno vs Secret Manager:</strong> Configuración por variables de entorno en lugar de Secret Manager (trade-off aceptado por el alcance; se documenta la rotación de credenciales post-reto).
            </li>
            <li>
              <strong>Token demo con TTL:</strong> El token demo tiene un TTL limitado por seguridad.
            </li>
            <li>
              <strong>Alcance del Reto 3:</strong> El Reto 3 entrega <strong>diseño</strong> de arquitectura; no implementación en código en este alcance.
            </li>
          </ul>
        </div>
      </div>

      {/* Sub-bloque: Stack técnico */}
      <section className="tech-stack-section" aria-label="Stack tecnológico">
        <h3 className="section-subtitle">Stack técnico</h3>
        <p className="muted">Componentes nativos utilizados en el desarrollo y despliegue del reto:</p>
        <div className="tech-grid">
          <div className="tech-grid-item">
            <strong>Frontend</strong>
            <span>React · Vite · TypeScript</span>
          </div>
          <div className="tech-grid-item">
            <strong>Backend Endosos</strong>
            <span>Node.js · Hapi · TypeORM</span>
          </div>
          <div className="tech-grid-item">
            <strong>Backend Rutas</strong>
            <span>Golang</span>
          </div>
          <div className="tech-grid-item">
            <strong>Persistencia</strong>
            <span>PostgreSQL (Neon)</span>
          </div>
          <div className="tech-grid-item">
            <strong>Contenerización</strong>
            <span>Docker</span>
          </div>
          <div className="tech-grid-item">
            <strong>Infraestructura Cloud</strong>
            <span>Google Cloud Run · Artifact Registry</span>
          </div>
          <div className="tech-grid-item">
            <strong>Seguridad</strong>
            <span>JWT</span>
          </div>
          <div className="tech-grid-item">
            <strong>Diagramación</strong>
            <span>draw.io</span>
          </div>
        </div>
      </section>

      {/* Sub-bloque: Cómo reproducir en 3 pasos */}
      <section className="reproduce-section" aria-label="Instrucciones de reproducción local">
        <h3 className="section-subtitle">Cómo reproducir en 3 pasos</h3>
        <p className="muted">Comandos mínimos para clonar, desplegar y smoke test:</p>
        <CopySnippet
          label="Bash · Reproducción en 3 pasos"
          code={`# Paso 1: Clonar e ingresar
git clone https://github.com/jnaterar/reto-tecnico-interseguro.git
cd reto-tecnico-interseguro

# Paso 2: Levantar el stack completo con Docker Compose
docker compose up -d --build

# Paso 3: Smoke test de salud
curl -s http://localhost:8080/healthz && echo " -> Frontend OK"
curl -s http://localhost:8081/health && echo " -> Rutas OK"
curl -s http://localhost:8082/health && echo " -> Endosos OK"`}
        />
      </section>
    </div>
  );
}
