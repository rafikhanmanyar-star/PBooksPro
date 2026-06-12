/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_VERSION: string;
  readonly VITE_APP_BUILD_VERSION: string;
  readonly VITE_APP_BUILD_TIME: string;
  readonly VITE_API_URL?: string;
  readonly VITE_LOCAL_ONLY?: string;
  readonly VITE_STAGING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
