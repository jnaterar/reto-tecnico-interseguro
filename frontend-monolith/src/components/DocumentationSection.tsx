import { useState, type ReactElement } from 'react';

function CopySnippet({ code, label }: { code: string; label: string }): ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Entorno no seguro o permisos denegados
    }
  };

  return (
    <div className="snippet-container">
      <div className="snippet-head">
        <span className="snippet-label">{label}</span>
        <button
          type="button"
          className="ghost-button small snippet-copy-btn"
          onClick={() => void handleCopy()}
          aria-label={`Copiar comando ${label}`}
        >
          {copied ? 'Copiado ✓' : 'Copiar'}
        </button>
      </div>
      <pre className="snippet-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function DocumentationSection(): ReactElement {
  return (
    <section id="documentacion" className="doc-section" aria-label="Documentación técnica y arquitectura">
      <div className="page-wrap">
        <header className="doc-header">
          <p className="eyebrow">Documentación Técnica</p>
          <h2 className="section-title">Cómo se resolvió cada reto</h2>
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
            <h3>Normalización y traducción dinámica hacia el core</h3>
          </header>

          {/* ① En palabras sencillas */}
          <div className="simple-words-card">
            <div className="simple-words-icon" aria-hidden="true">💡</div>
            <div>
              <h4 className="simple-words-title">① En palabras sencillas</h4>
              <p>
                Llega una solicitud de endoso en un formato &quot;plano&quot; (un JSON con campos sueltos). El servicio la lee, la entiende y la reescribe en un formato &quot;estructurado&quot; que el core sí puede procesar. Es como traducir de un idioma informal a un idioma formal, sin perder ningún dato.
              </p>
            </div>
          </div>

          {/* ② Cómo funciona */}
          <div className="how-it-works-block">
            <h4>② Cómo funciona</h4>
            <ol className="step-numbered-list">
              <li>
                <strong>Recibe y valida:</strong> Lee el payload plano verificando la integridad de campos obligatorios con validación Joi en el backend.
              </li>
              <li>
                <strong>Consulta la plantilla en BD:</strong> Según el producto y tipo de endoso, obtiene el orden y etiquetas de <code>dynamicData</code>, la lista de <code>eventAppliedEntities</code> y los valores por defecto.
              </li>
              <li>
                <strong>Mapea con estructura estricta:</strong> Transforma cada campo respetando el orden exacto requerido por el core, preservando campos vacíos y constantes institucionales.
              </li>
              <li>
                <strong>Devuelve JSON estructurado:</strong> Entrega un objeto serializado con arrays explícitos listo para ser consumido por el core transaccional.
              </li>
            </ol>
          </div>

          {/* ③ Tecnologías */}
          <div className="tech-pills-row" aria-label="Tecnologías del Reto 1">
            <span className="tech-pill">Node.js</span>
            <span className="tech-pill">Hapi.js</span>
            <span className="tech-pill">TypeScript</span>
            <span className="tech-pill">TypeORM</span>
            <span className="tech-pill">PostgreSQL (Neon)</span>
            <span className="tech-pill">JWT</span>
            <span className="tech-pill">Docker</span>
            <span className="tech-pill">Google Cloud Run</span>
          </div>

          {/* Progressive disclosure: ④ Decisiones y ⑤ Verificación */}
          <details className="tech-details-accordion">
            <summary className="accordion-summary">
              <span>Ver detalle técnico y verificación del Reto 1</span>
              <span className="accordion-arrow" aria-hidden="true">▾</span>
            </summary>
            <div className="accordion-content">
              <div className="decisions-block">
                <h4>④ Decisiones y trade-offs</h4>
                <ul className="decisions-list">
                  <li className="decision-chosen">
                    <strong>✔ Arquitectura en capas:</strong> routes / controller / service / repository / model / mapper desacoplados, cumpliendo estrictamente con la convención del reto.
                  </li>
                  <li className="decision-chosen">
                    <strong>✔ Plantillas configurables en BD:</strong> agregar un producto o endoso nuevo se logra <em>sin tocar código</em> (alta extensibilidad y mantenibilidad).
                  </li>
                  <li className="decision-chosen">
                    <strong>✔ Preservar campos vacíos (<code>&quot;&quot;</code>) y valores Default:</strong> el core bancario/asegurador rechaza campos nulos o ausentes.
                  </li>
                  <li className="decision-chosen">
                    <strong>✔ Versionado de API (<code>/v1/</code>) + Pruebas unitarias:</strong> contratos estables y reproducibles con coverage.
                  </li>
                  <li className="decision-discarded">
                    <strong>✘ Descartado transformar en el cliente:</strong> menos seguro, no reutilizable por otros canales y propenso a desincronización de reglas.
                  </li>
                </ul>
              </div>

              <div className="verification-block">
                <h4>⑤ Cómo verificarlo</h4>
                <p className="muted small">Ejecuta en terminal para emitir el JWT y traducir el payload oficial:</p>
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
            <h3>Cálculo determinista de camino mínimo en grafos no dirigidos</h3>
          </header>

          {/* ① En palabras sencillas */}
          <div className="simple-words-card">
            <div className="simple-words-icon" aria-hidden="true">📍</div>
            <div>
              <h4 className="simple-words-title">① En palabras sencillas</h4>
              <p>
                Cuando ocurre un accidente, hay que enviar la grúa desde la base más cercana por el camino más corto. El servicio recibe un &quot;mapa&quot; de distritos conectados con distancias y calcula la ruta óptima automáticamente.
              </p>
            </div>
          </div>

          {/* ② Cómo funciona */}
          <div className="how-it-works-block">
            <h4>② Cómo funciona</h4>
            <ol className="step-numbered-list">
              <li>
                <strong>Recibe parámetros y topología:</strong> Ingresa el distrito del siniestro, la lista de bases disponibles y el grafo con distancias ponderadas.
              </li>
              <li>
                <strong>Ejecuta Dijkstra desde cada base:</strong> Aplica el algoritmo con cola de prioridad / montículo para encontrar el camino más corto hacia el accidente.
              </li>
              <li>
                <strong>Desempata y selecciona la mejor base:</strong> Elige la base con menor distancia acumulada; en caso de empate, resuelve deterministamente por el orden canónico.
              </li>
              <li>
                <strong>Devuelve la ruta y distancia total:</strong> Entrega el array ordenado de paradas (<code>path</code>) y la distancia total; si el destino es inalcanzable, responde con error 404 tipado.
              </li>
            </ol>
          </div>

          {/* ③ Tecnologías */}
          <div className="tech-pills-row" aria-label="Tecnologías del Reto 2">
            <span className="tech-pill">Golang (1.23)</span>
            <span className="tech-pill">Dijkstra Heap</span>
            <span className="tech-pill">Grafo no dirigido</span>
            <span className="tech-pill">JWT</span>
            <span className="tech-pill">Docker Scratch</span>
            <span className="tech-pill">Google Cloud Run</span>
          </div>

          {/* Progressive disclosure: ④ Decisiones y ⑤ Verificación */}
          <details className="tech-details-accordion">
            <summary className="accordion-summary">
              <span>Ver detalle técnico y verificación del Reto 2</span>
              <span className="accordion-arrow" aria-hidden="true">▾</span>
            </summary>
            <div className="accordion-content">
              <div className="decisions-block">
                <h4>④ Decisiones y trade-offs</h4>
                <ul className="decisions-list">
                  <li className="decision-chosen">
                    <strong>✔ Implementado en Golang nativo:</strong> máximo rendimiento computacional, binario estático ligero (~15 MB) y consumo de memoria inferior a 25 MB en Cloud Run.
                  </li>
                  <li className="decision-chosen">
                    <strong>✔ Grafo no dirigido:</strong> una vía declarada entre dos distritos permite tránsito en ambos sentidos, modelando el tráfico real.
                  </li>
                  <li className="decision-chosen">
                    <strong>✔ Grafo dinámico en el payload:</strong> el mapa vial de Lima viaja en la petición, lo que permite modificar distancias o agregar nodos sin recomilar el servicio.
                  </li>
                  <li className="decision-chosen">
                    <strong>✔ Soporte multi-base determinista:</strong> evalúa múltiples depósitos y garantiza resultados predecibles e idénticos ante peticiones idénticas.
                  </li>
                  <li className="decision-discarded">
                    <strong>✘ Descartado asumir dirección única:</strong> generaría rutas inválidas o falsos inalcanzables en distritos conectados bidireccionalmente.
                  </li>
                  <li className="decision-discarded">
                    <strong>✘ Descartado hardcodear distritos:</strong> acoplaría el algoritmo a Lima e impediría su uso en otras provincias o regiones.
                  </li>
                </ul>
              </div>

              <div className="verification-block">
                <h4>⑤ Cómo verificarlo</h4>
                <p className="muted small">Ejecuta en terminal para evaluar el siniestro en San Isidro con bases en Miraflores y Ate:</p>
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
            <h3>Eliminación de desembolsos duplicados por timeouts de INARI</h3>
          </header>

          {/* ① En palabras sencillas */}
          <div className="simple-words-card">
            <div className="simple-words-icon" aria-hidden="true">🏦</div>
            <div>
              <h4 className="simple-words-title">① En palabras sencillas</h4>
              <p>
                El cliente pide un préstamo y se queda esperando en pantalla. Si el sistema interno (INARI) tarda, el proxy responde con un error 502 — pero el préstamo sigue procesándose en segundo plano y a veces sí se desembolsa. El cliente ve &quot;falló&quot;, vuelve a intentar y <strong>se desembolsa dos veces</strong>. El reto fue rediseñar la arquitectura para que el cliente nunca dependa de esa espera y para que sea imposible desembolsar el mismo préstamo dos veces.
              </p>
            </div>
          </div>

          {/* ② Cómo funciona */}
          <div className="how-it-works-block">
            <h4>② Cómo funciona</h4>
            <ol className="step-numbered-list">
              <li>
                <strong>Respuesta asíncrona inmediata (202):</strong> El cliente envía la solicitud con <code>Idempotency-Key</code> y recibe de inmediato un <code>202 Accepted</code> con un <code>requestId</code> para consultar el progreso.
              </li>
              <li>
                <strong>Encolamiento en Pub/Sub:</strong> La orden se persiste con estado <code>PENDING</code> y se publica en un tópico distribuido, desacoplando el tiempo de respuesta del cliente.
              </li>
              <li>
                <strong>Worker con Lock distribuido:</strong> Un microservicio suscriptor consume la orden, adquiere un lock exclusivo por póliza en Redis y valida que no exista una transacción previa completada.
              </li>
              <li>
                <strong>Ejecución resiliente con Circuit Breaker:</strong> Se invoca a INARI con reintentos controlados con backoff exponencial. El cliente consulta periódicamente el estado real, inmune al timeout del proxy.
              </li>
            </ol>
          </div>

          {/* ③ Tecnologías */}
          <div className="tech-pills-row" aria-label="Patrones y tecnologías del Reto 3">
            <span className="tech-pill">draw.io</span>
            <span className="tech-pill">Google Cloud Pub/Sub</span>
            <span className="tech-pill">Idempotencia</span>
            <span className="tech-pill">Circuit Breaker</span>
            <span className="tech-pill">Redis Policy Lock</span>
            <span className="tech-pill">Máquina de estados</span>
            <span className="tech-pill">mTLS</span>
            <span className="tech-pill">KMS</span>
            <span className="tech-pill">Cloud Scheduler</span>
          </div>

          {/* Progressive disclosure: ④ Decisiones y ⑤ Verificación */}
          <details className="tech-details-accordion">
            <summary className="accordion-summary">
              <span>Ver detalle técnico y verificación del Reto 3</span>
              <span className="accordion-arrow" aria-hidden="true">▾</span>
            </summary>
            <div className="accordion-content">
              <div className="decisions-block">
                <h4>④ Decisiones y trade-offs</h4>
                <ul className="decisions-list">
                  <li className="decision-chosen">
                    <strong>✔ Desacoplar la experiencia del cliente:</strong> respuesta 202 en &lt; 80 ms, eliminando la sensación de caída o bloqueo de la aplicación.
                  </li>
                  <li className="decision-chosen">
                    <strong>✔ Idempotencia con constraint UNIQUE:</strong> clave única compuesta en base de datos que aborta a nivel físico cualquier intento duplicado.
                  </li>
                  <li className="decision-chosen">
                    <strong>✔ Reintentos idempotentes con backoff + DLQ:</strong> absorbe picos de latencia en INARI y desvía fallas persistentes a revisión sin degradar el flujo.
                  </li>
                  <li className="decision-chosen">
                    <strong>✔ Job de reconciliación nocturna:</strong> detecta solicitudes que hayan quedado en estado ambiguo y consulta directamente el core AS400.
                  </li>
                  <li className="decision-discarded">
                    <strong>✘ Descartado mantener flujo sincrónico:</strong> la naturaleza transaccional lenta del core mantendría latente la posibilidad de timeout.
                  </li>
                  <li className="decision-discarded">
                    <strong>✘ Descartado solo subir el timeout del proxy:</strong> solo posterga la falla ante caídas reales y deja al usuario esperando más de 30 segundos.
                  </li>
                </ul>
              </div>

              <div className="verification-block">
                <h4>⑤ Cómo verificarlo</h4>
                <p className="muted small">Revisar los diagramas arquitectónicos y la matriz de evaluación formal:</p>
                <CopySnippet
                  label="Artefactos de Arquitectura Reto 3"
                  code={`# Ubicación de diagramas editables y exportados
./architecture-drawio/as-is.drawio    # Diagrama de flujo actual vulnerable
./architecture-drawio/to-be.drawio    # Diagrama de solución idempotente
./architecture-drawio/as-is.png       # Exportación HD incluida en esta landing
./architecture-drawio/to-be.png       # Exportación HD incluida en esta landing`}
                />
              </div>
            </div>
          </details>
        </article>

        {/* Bloque: Notas de honestidad técnica */}
        <div className="honesty-notes-card">
          <div className="honesty-icon" aria-hidden="true">⚖️</div>
          <div>
            <h4>Notas de honestidad técnica</h4>
            <ul className="honesty-list">
              <li>
                <strong>Variables de entorno vs Secret Manager:</strong> Por el alcance técnico y agilidad de evaluación de este reto, las credenciales se configuraron mediante variables de entorno en Cloud Run. Para entornos de producción bancaria, se documenta la adopción de Google Secret Manager con rotación automática periódica.
              </li>
              <li>
                <strong>Token demo efímero:</strong> El endpoint <code>/v1/auth/token</code> emite un JWT firmado de prueba con TTL controlado de 1 hora para facilitar smoke tests continuos sin depender de un SSO corporativo externo.
              </li>
              <li>
                <strong>Alcance del Reto 3:</strong> El Reto 3 entrega el diseño formal de arquitectura de sistemas distribuidos en diagramas draw.io y especificación técnica; no incluye código ejecutable en este repositorio.
              </li>
            </ul>
          </div>
        </div>

        {/* Sub-bloque: Stack técnico */}
        <div className="tech-stack-section">
          <h3 className="section-subtitle">Stack tecnológico global</h3>
          <p className="muted">Componentes nativos utilizados en el desarrollo y despliegue del reto:</p>
          <div className="tech-grid">
            <div className="tech-grid-item">
              <strong>Frontend</strong>
              <span>React 18 · Vite · TypeScript</span>
            </div>
            <div className="tech-grid-item">
              <strong>Backend Endosos</strong>
              <span>Node.js · Hapi · TypeORM</span>
            </div>
            <div className="tech-grid-item">
              <strong>Backend Rutas</strong>
              <span>Golang · Dijkstra Nativo</span>
            </div>
            <div className="tech-grid-item">
              <strong>Persistencia</strong>
              <span>PostgreSQL (Neon Serverless)</span>
            </div>
            <div className="tech-grid-item">
              <strong>Contenerización</strong>
              <span>Docker Multi-Stage Builds</span>
            </div>
            <div className="tech-grid-item">
              <strong>Infraestructura Cloud</strong>
              <span>Google Cloud Run · Artifact Registry</span>
            </div>
            <div className="tech-grid-item">
              <strong>Seguridad</strong>
              <span>JWT Bearer Tokens · CORS Strict</span>
            </div>
            <div className="tech-grid-item">
              <strong>Diagramación</strong>
              <span>draw.io (Arquitectura TO-BE)</span>
            </div>
          </div>
        </div>

        {/* Sub-bloque: Cómo reproducir en 3 pasos */}
        <div className="reproduce-section">
          <h3 className="section-subtitle">Cómo reproducir el proyecto localmente</h3>
          <p className="muted">Tres comandos para clonar, levantar con Docker Compose y ejecutar un smoke test:</p>
          <CopySnippet
            label="Bash · Reproducción en 3 pasos"
            code={`# Paso 1: Clonar repositorio e ingresar
git clone https://github.com/jnaterar/reto-tecnico-interseguro.git
cd reto-tecnico-interseguro

# Paso 2: Levantar el stack completo (PostgreSQL + Node + Go + Frontend)
docker compose up -d

# Paso 3: Verificar salud de los 3 microservicios
curl -s http://localhost:8080/health && echo ""
curl -s http://localhost:8081/health && echo ""
curl -s http://localhost:8082/health && echo ""`}
          />
        </div>
      </div>
    </section>
  );
}
