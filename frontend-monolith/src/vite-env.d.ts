/// <reference types="vite/client" />

// Tipado estricto de las variables de entorno expuestas al cliente.
// Vite solo inyecta variables con prefijo VITE_.
interface ImportMetaEnv {
  readonly VITE_API_ENDORSEMENTS_URL?: string;
  readonly VITE_API_ROUTES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
