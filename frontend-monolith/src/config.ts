// URLs de los backends configurables por entorno.
//
// En desarrollo y en Docker se usan rutas relativas (/endorse-api, /routes-api)
// que resuelven el proxy de Vite o nginx. En la nube se definen URLs absolutas
// por servicio y el navegador aplica CORS (configurado en cada backend).
//
// Los nombres siguen el contrato pedido: VITE_API_ENDORSEMENTS_URL y
// VITE_API_ROUTES_URL.
const readBase = (value: string | undefined, fallback: string): string =>
  value && value.trim().length > 0 ? value.trim() : fallback;

export const ENDORSE_API_BASE = readBase(import.meta.env.VITE_API_ENDORSEMENTS_URL, '/endorse-api');
export const ROUTES_API_BASE = readBase(import.meta.env.VITE_API_ROUTES_URL, '/routes-api');
