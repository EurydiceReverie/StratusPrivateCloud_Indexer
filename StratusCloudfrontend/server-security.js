export function buildCsp(isProd = process.env.NODE_ENV === 'production') {
  const scriptSrc = isProd
    ? "script-src 'self'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    scriptSrc,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://cdn.jsdelivr.net https://*.dropboxusercontent.com https://*.dropbox.com https://docs.google.com",
    "connect-src 'self' https://api.dropboxapi.com https://content.dropboxapi.com https://www.dropbox.com https://notify.dropboxapi.com",
    "media-src 'self' blob: https://*.dropboxusercontent.com",
    "frame-src 'self' blob: https://docs.google.com",
    "child-src 'self' blob: https://docs.google.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "require-trusted-types-for 'script'",
    "trusted-types default stratus-html",
    "upgrade-insecure-requests",
  ].join('; ');
}
