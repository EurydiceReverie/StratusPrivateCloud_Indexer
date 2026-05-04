/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

interface GoogleOauth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: { access_token?: string; error?: string }) => void;
  }) => GoogleTokenClient;
  revoke: (token: string, callback: () => void) => void;
}

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: GoogleOauth2;
      };
    };
  }
}
