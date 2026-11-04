// Bases relativas: en desarrollo las resuelve el proxy de Vite y en Docker nginx.
// Evita CORS y URLs hardcodeadas en el código de la aplicación.
const readBase = (value: string | undefined, fallback: string): string =>
  value && value.trim().length > 0 ? value.trim() : fallback;

export const ENDORSE_API_BASE = readBase(import.meta.env.VITE_ENDORSE_API_BASE, '/endorse-api');
export const ROUTES_API_BASE = readBase(import.meta.env.VITE_ROUTES_API_BASE, '/routes-api');
