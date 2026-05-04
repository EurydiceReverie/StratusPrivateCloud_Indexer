const BLOCKED_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
]);

const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'poster']);
const GLOBAL_ATTR_BLOCKLIST = new Set(['srcdoc', 'nonce', 'integrity']);

function escapeHtml(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(tag: string, attrName: string, value: string): boolean {
  const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  if (!normalized) return true;
  if (normalized.startsWith('#') || normalized.startsWith('/') || normalized.startsWith('./') || normalized.startsWith('../')) return true;

  const lower = normalized.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) return false;

  if (attrName === 'src' && tag === 'img') {
    return /^(https:|data:image\/|blob:)/i.test(lower);
  }

  if (attrName === 'poster') {
    return /^(https:|blob:|data:image\/)/i.test(lower);
  }

  if (attrName === 'href') {
    return /^(https:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(lower);
  }

  return /^(https:|blob:|data:image\/)/i.test(lower);
}

function cleanNodeTree(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  let current = walker.nextNode();
  while (current) {
    comments.push(current as Comment);
    current = walker.nextNode();
  }
  comments.forEach((comment) => comment.remove());

  const elements = Array.from(root.querySelectorAll('*')) as HTMLElement[];

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    if (BLOCKED_TAGS.has(tag)) {
      el.remove();
      continue;
    }

    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();

      if (name.startsWith('on') || name.startsWith('xmlns') || GLOBAL_ATTR_BLOCKLIST.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'style' || name === 'srcset') {
        el.removeAttribute(attr.name);
        continue;
      }

      if (URL_ATTRS.has(name) && !isSafeUrl(tag, name, value)) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'target' && value === '_blank') {
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }
  }
}

export function sanitizeUntrustedHtml(html: string): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') return escapeHtml(html);

  const doc = new DOMParser().parseFromString(html, 'text/html');
  cleanNodeTree(doc);
  return doc.body.innerHTML;
}

export function buildSandboxedSrcDoc(bodyHtml: string): string {
  const safeBody = sanitizeUntrustedHtml(bodyHtml);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="referrer" content="no-referrer" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; connect-src 'none'; script-src 'none'; img-src data: blob: https:; media-src data: blob: https:; style-src 'unsafe-inline'; font-src data: https:;" />
    <style>
      body { margin: 0; padding: 16px; font-family: Inter, system-ui, sans-serif; color: #111827; background: #ffffff; }
      table { border-collapse: collapse; width: 100%; }
      img { max-width: 100%; height: auto; }
      pre { white-space: pre-wrap; }
      a { color: #2563eb; }
    </style>
  </head>
  <body>${safeBody}</body>
</html>`;
}
