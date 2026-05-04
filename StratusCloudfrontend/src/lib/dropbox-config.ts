export const DROPBOX_CONFIG = {
  clientId: import.meta.env.VITE_DROPBOX_CLIENT_ID || '',
  redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '',
  scope: 'files.metadata.write files.metadata.read files.content.write files.content.read sharing.write sharing.read account_info.read',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
};

export const isDropboxConfigured = (): boolean => {
  return !!DROPBOX_CONFIG.clientId;
};
