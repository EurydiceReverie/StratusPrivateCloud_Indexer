import React, { useState, useEffect, useRef } from 'react';
import { readMaybeEncryptedJson, secureFetch } from '@/lib/api-envelope';
import { useParams } from 'react-router-dom';
import { hashPin } from '@/lib/links-manager';
import { buildSandboxedSrcDoc, sanitizeUntrustedHtml } from '@/lib/html-sanitizer';
import {
  Shield, Download, FileText, Clock, AlertCircle, Lock, Eye, Cloud, Flame,
  Check, Loader2, Music, Film, FileCode, File, Folder, FolderOpen, ChevronRight,
  ChevronDown as ChevronDownIcon, Image, Archive, Sun, Moon, User, MessageSquare, Copy
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

interface LinkInfo {
  fileName: string;
  fileSize?: number;
  isVaultFile?: boolean;
  isFolder?: boolean;
  expiresAt: number | null;
  accessCount: number;    // page views
  downloadCount: number;  // actual downloads
  oneTime?: boolean;
  sharedBy?: string;
  message?: string;
  maxViews?: number | null;
}

interface FolderEntry {
  name: string;
  path: string;
  tag: 'file' | 'folder';
  size?: number;
  clientModified?: string;
}

type PageState = 'loading' | 'pin-required' | 'ready' | 'downloading' | 'previewing' | 'done' | 'error' | 'expired' | 'not-found' | 'locked';

const formatBytes = (b?: number) => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
};

const getFileIconEl = (name: string, size = 'w-5 h-5') => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (/jpe?g|png|gif|webp|svg|avif|heic/.test(ext)) return <Image className={size} />;
  if (/mp4|mov|mkv|avi|webm/.test(ext)) return <Film className={size} />;
  if (/mp3|wav|flac|aac|ogg|m4a/.test(ext)) return <Music className={size} />;
  if (/zip|rar|7z|tar|gz/.test(ext)) return <Archive className={size} />;
  if (/js|ts|py|css|html|json|yaml|yml|sh|md/.test(ext)) return <FileCode className={size} />;
  return <File className={size} />;
};

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (/jpe?g|png|gif|webp|svg|avif|heic/.test(ext)) return <FileText className="w-8 h-8" />;
  if (/mp4|mov|mkv|avi|webm/.test(ext)) return <Film className="w-8 h-8" />;
  if (/mp3|wav|flac|aac|ogg|m4a/.test(ext)) return <Music className="w-8 h-8" />;
  if (/js|ts|py|css|html|json|yaml|yml|sh|md/.test(ext)) return <FileCode className="w-8 h-8" />;
  return <File className="w-8 h-8" />;
};

// ── CountdownTimer Component ──────────────────────────────────────────────────
const CountdownTimer: React.FC<{ expiresAt: number | null }> = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      if (!expiresAt) {
        setTimeLeft('No expiry');
        return;
      }
      const diff = expiresAt - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d >= 1) {
        setTimeLeft(`${d}d ${h}h ${m}m left`);
      } else if (h >= 1) {
        setTimeLeft(`${h}h ${m}m ${s}s left`);
      } else if (m >= 1) {
        setTimeLeft(`${m}m ${s}s left`);
      } else {
        setTimeLeft(`${s}s left`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return <span>{timeLeft}</span>;
};

// ── DarkToggle Component ──────────────────────────────────────────────────────
const DarkToggle: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-foreground/60 hover:text-foreground"
      title="Toggle theme"
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};

// ── TextPreview Component ─────────────────────────────────────────────────────
const TextPreview: React.FC<{ url: string }> = ({ url }) => {
  const [text, setText] = React.useState('');
  React.useEffect(() => {
    fetch(url).then(r => r.text()).then(setText).catch(() => setText('Could not load preview.'));
  }, [url]);
  return (
    <pre className="p-4 text-xs font-mono text-foreground/75 whitespace-pre-wrap break-all max-h-72 overflow-y-auto modal-scroll">
      {text || 'Loading…'}
    </pre>
  );
};

// ── DocumentPreview Components ────────────────────────────────────────────────

const DocxPreview: React.FC<{ blob: Blob }> = ({ blob }) => {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const { default: mammoth } = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setHtml(sanitizeUntrustedHtml(result.value));
      } catch (err) {
        setError('Failed to render DOCX');
      }
    })();
  }, [blob]);

  if (error) return <div className="p-4 text-sm text-red-400">{error}</div>;
  if (!html) return <div className="p-4"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="p-4 max-h-72 overflow-y-auto modal-scroll">
      <iframe
        srcDoc={buildSandboxedSrcDoc(html)}
        className="w-full h-full border-0"
        title="DOCX Preview"
        style={{ minHeight: '400px' }}
        sandbox=""
      />
    </div>
  );
};

const XlsxPreview: React.FC<{ blob: Blob }> = ({ blob }) => {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const htmlContent = XLSX.utils.sheet_to_html(workbook.Sheets[firstSheet]);
        setHtml(sanitizeUntrustedHtml(htmlContent));
      } catch (err) {
        setError('Failed to render XLSX');
      }
    })();
  }, [blob]);

  if (error) return <div className="p-4 text-sm text-red-400">{error}</div>;
  if (!html) return <div className="p-4"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="p-4 max-h-72 overflow-y-auto modal-scroll">
      <iframe srcDoc={buildSandboxedSrcDoc(html)} className="w-full min-h-[400px] border-0 bg-background" title="XLSX Preview" sandbox="" />
    </div>
  );
};

const PptxPreview: React.FC = () => {
  return (
    <div className="p-8 text-center text-foreground/60 flex flex-col items-center gap-3">
      <FileText className="w-12 h-12 opacity-40 text-orange-400" />
      <p className="text-sm font-semibold text-foreground">PowerPoint File</p>
      <p className="text-xs text-muted-foreground">PPTX files cannot be rendered in the browser.<br/>Download and open with PowerPoint or Google Slides.</p>
    </div>
  );
};

// ── FolderBrowser Component ───────────────────────────────────────────────────
const FolderBrowser: React.FC<{ rootPath: string; downloadToken: string; linkId: string }> = ({ rootPath, downloadToken, linkId }) => {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<{ blob: Blob; mime: string; name: string } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const loadFolder = async (path: string) => {
    if (!path) return; // don't load if path is empty
    setLoading(true);
    try {
      const res = await secureFetch('/api/share/list-folder', { downloadToken, path }, { method: 'POST' });
      if (!res.ok) { setEntries([]); setLoading(false); return; }
      const data = await readMaybeEncryptedJson<{ entries: FolderEntry[] }>(res);
      const sorted = (data.entries as FolderEntry[]).sort((a, b) => {
        if (a.tag !== b.tag) return a.tag === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(sorted);
    } catch { setEntries([]); }
    setLoading(false);
  };

  useEffect(() => { loadFolder(currentPath); }, [currentPath]); // eslint-disable-line

  const navigateTo = (path: string) => {
    setHistory(h => [...h, currentPath]);
    setCurrentPath(path);
    setPreviewFile(null);
  };

  const navigateBack = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(h => h.slice(0, -1));
    setCurrentPath(prev);
    setPreviewFile(null);
  };

  const downloadFile = async (entry: FolderEntry) => {
    setDownloading(entry.path);
    try {
      const res = await secureFetch('/api/share/download-file', { downloadToken, path: entry.path }, {
        method: 'POST',
      });
      if (!res.ok) { setDownloading(null); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = entry.name; a.click();
      URL.revokeObjectURL(url);
    } catch {}
    setDownloading(null);
  };

  const previewFileEntry = async (entry: FolderEntry) => {
    setDownloading(entry.path);
    try {
      const res = await secureFetch('/api/share/download-file', { downloadToken, path: entry.path, preview: true }, {
        method: 'POST',
      });
      if (!res.ok) { setDownloading(null); return; }
      // Detect mime from extension first — Dropbox returns octet-stream for many types
      let mime = res.headers.get('content-type') || 'application/octet-stream';
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
        webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
        mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
        avi: 'video/x-msvideo', webm: 'video/webm',
        mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
        aac: 'audio/aac', ogg: 'audio/ogg', m4a: 'audio/mp4',
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
        json: 'application/json', js: 'text/javascript', ts: 'text/typescript',
        html: 'text/html', css: 'text/css', xml: 'text/xml',
      };
      if (mimeMap[ext]) mime = mimeMap[ext];
      const blob = await res.blob();
      setPreviewFile({ blob: new Blob([blob], { type: mime }), mime, name: entry.name });
    } catch {}
    setDownloading(null);
  };

  const getPreviewType = (name: string, mime: string) => {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (/jpe?g|png|gif|webp|svg|avif|heic/.test(ext)) return 'image';
    if (/mp4|mov|mkv|avi|webm/.test(ext)) return 'video';
    if (/mp3|wav|flac|aac|ogg|m4a/.test(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx') return 'docx';
    if (ext === 'xlsx') return 'xlsx';
    if (ext === 'pptx') return 'pptx';
    if (/txt|md|json|js|ts|jsx|tsx|css|html|xml|csv|py|sh|yaml|yml|env|log|ini|toml/.test(ext)) return 'text';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('text/')) return 'text';
    return null;
  };

  const relativePath = currentPath.slice(rootPath.length) || '/';
  const parts = relativePath.split('/').filter(Boolean);

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-wrap text-xs text-foreground/50 px-1">
        <button
          onClick={() => { setHistory([]); setCurrentPath(rootPath); setPreviewFile(null); }}
          className="flex items-center gap-1 hover:text-foreground/80 transition-colors font-medium"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Root
        </button>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            <ChevronRight className="w-3 h-3 shrink-0" />
            <button
              onClick={() => {
                const targetPath = rootPath + '/' + parts.slice(0, i + 1).join('/');
                const historyUpTo = history.slice(0, history.indexOf(targetPath) + 1);
                setHistory(historyUpTo.length ? historyUpTo : history.slice(0, i));
                setCurrentPath(targetPath);
                setPreviewFile(null);
              }}
              className="hover:text-foreground/80 transition-colors truncate max-w-[100px]"
            >
              {part}
            </button>
          </React.Fragment>
        ))}
        {history.length > 0 && (
          <button onClick={navigateBack} className="ml-auto share-badge share-badge--neutral hover:bg-primary/10 transition-all duration-200 hover:scale-105 active:scale-[0.96]">
            ← Back
          </button>
        )}
      </div>

      {/* File/folder list */}
      <div className="share-folder-list">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary/60" />
          </div>
        )}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-foreground/40 text-center py-6">Empty folder</p>
        )}
        {!loading && entries.map((entry, i) => (
          <div
            key={entry.path}
            className={`share-folder-row ${i < entries.length - 1 ? 'share-folder-row--border' : ''}`}
          >
            <div className="share-folder-row-icon">
              {entry.tag === 'folder'
                ? <Folder className="w-4 h-4 text-primary" />
                : getFileIconEl(entry.name, 'w-4 h-4')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{entry.name}</p>
              {entry.size !== undefined && entry.tag === 'file' && (
                <p className="text-xs text-foreground/40">{formatBytes(entry.size)}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {entry.tag === 'folder' ? (
                <button onClick={() => navigateTo(entry.path)} className="share-btn-secondary !py-1 !px-3 !text-xs !rounded-lg">
                  Open
                </button>
              ) : (
                <>
                  <button
                    onClick={() => previewFileEntry(entry)}
                    disabled={downloading === entry.path}
                    className="share-icon-btn"
                    title="Preview"
                  >
                    {downloading === entry.path ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => downloadFile(entry)}
                    disabled={downloading === entry.path}
                    className="share-icon-btn"
                    title="Download"
                  >
                    {downloading === entry.path ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Inline preview */}
      {previewFile && (() => {
        const pt = getPreviewType(previewFile.name, previewFile.mime);
        return pt ? (
          <div className="share-preview-box">
            <div className="flex items-center justify-between px-3 py-2 border-b border-black/5 dark:border-white/5">
              <p className="text-xs font-medium text-foreground/60 truncate">{previewFile.name}</p>
              <button onClick={() => setPreviewFile(null)} className="bg-secondary hover:bg-secondary/80 rounded-lg px-2 py-1 text-xs text-foreground/50 hover:text-foreground ml-2 shrink-0 transition-all duration-200 hover:scale-105 active:scale-[0.96]">✕</button>
            </div>
            {pt === 'image' && <img src={URL.createObjectURL(previewFile.blob)} alt={previewFile.name} className="w-full max-h-72 object-contain" />}
            {pt === 'video' && <video src={URL.createObjectURL(previewFile.blob)} controls className="w-full max-h-72" />}
            {pt === 'audio' && <div className="p-4"><audio src={URL.createObjectURL(previewFile.blob)} controls className="w-full" /></div>}
            {pt === 'pdf' && <iframe src={URL.createObjectURL(previewFile.blob)} className="w-full h-72 border-0" title={previewFile.name} />}
            {pt === 'docx' && <DocxPreview blob={previewFile.blob} />}
            {pt === 'xlsx' && <XlsxPreview blob={previewFile.blob} />}
            {pt === 'pptx' && <PptxPreview />}
            {pt === 'text' && <TextPreview url={URL.createObjectURL(previewFile.blob)} />}
          </div>
        ) : null;
      })()}
    </div>
  );
};

// ── GlassPage Component ───────────────────────────────────────────────────────
const GlassPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="share-page-bg">
    {/* Ambient background blobs */}
    <div className="share-bg-blob share-bg-blob--1" />
    <div className="share-bg-blob share-bg-blob--2" />

    <div className="share-page-inner">
      {/* Brand with theme toggle */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2 text-foreground/40">
          <Cloud className="w-5 h-5" />
          <span className="text-sm font-semibold tracking-widest uppercase">Stratus</span>
        </div>
        <DarkToggle />
      </div>

      {/* Card */}
      <div className="bg-card">
        {children}
      </div>
    </div>
  </div>
);

// ── SharePage Main Component ──────────────────────────────────────────────────
export const SharePage: React.FC = () => {
  const { linkId } = useParams<{ linkId: string }>();

  const [state, setState] = useState<PageState>('loading');
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [realLinkId, setRealLinkId] = useState<string | null>(null); // real UUID from server
  const [folderPath, setFolderPath] = useState<string>('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinRemaining, setPinRemaining] = useState<number | null>(null);
  const [retryAfterMins, setRetryAfterMins] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup ObjectURLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!linkId) { setState('not-found'); return; }
    validateLink(null);
  }, [linkId]); // eslint-disable-line

  const validateLink = async (pinValue: string | null) => {
    if (!linkId) return;
    setState('loading');
    try {
      let pinHash: string | null = null;
      if (pinValue) pinHash = await hashPin(pinValue);
      const res = await secureFetch('/api/share/validate', { linkId, pinHash }, { method: 'POST' });
      const data = await readMaybeEncryptedJson<any>(res);
      if (res.status === 401 && data.pinRequired) { setPin(''); setState('pin-required'); return; }
      if (res.status === 403) { setPin(''); setPinError(data.error || 'Incorrect PIN'); setPinRemaining(data.remaining ?? null); setState('pin-required'); return; }
      if (res.status === 429) { setRetryAfterMins(data.retryAfterMins); setState('locked'); return; }
      if (res.status === 410) { setState('expired'); return; }
      if (res.status === 404) { setState('not-found'); return; }
      if (!res.ok) { setErrorMsg(data.error || 'Something went wrong'); setState('error'); return; }
      setLinkInfo({
        fileName: data.fileName,
        fileSize: data.fileSize,
        isVaultFile: data.isVaultFile,
        isFolder: data.isFolder,
        expiresAt: data.expiresAt,
        accessCount: data.accessCount,
        downloadCount: data.downloadCount || 0,
        oneTime: data.oneTime,
        sharedBy: data.sharedBy,
        message: data.message,
        maxViews: data.maxViews,
      });
      setDownloadToken(data.downloadToken);
      setRealLinkId(data.linkId || linkId || null); // prefer real UUID
      setFolderPath(data.filePath || '');
      setPreviewUrl(null);
      setPreviewMime('');
      setPreviewBlob(null);
      setState('ready');
    } catch {
      setErrorMsg('Network error. Please try again.');
      setState('error');
    }
  };

  const fetchBlob = async (signal?: AbortSignal, isPreview = false): Promise<{ blob: Blob; mime: string } | null> => {
    if (!downloadToken || !linkInfo || !linkId) return null;
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setPaused(false);
    try {
      const res = await secureFetch('/api/share/download', { downloadToken, preview: isPreview }, {
        method: 'POST',
        signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        if (res.status === 401) { setErrorMsg('Session expired.'); setState('pin-required'); setDownloadToken(null); return null; }
        setErrorMsg(err.error || 'Download failed'); setState('error'); return null;
      }
      // Detect mime from filename if server returns octet-stream
      let mime = res.headers.get('content-type') || 'application/octet-stream';
      if (mime === 'application/octet-stream' && linkInfo?.fileName) {
        const ext = linkInfo.fileName.split('.').pop()?.toLowerCase() ?? '';
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
          webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
          mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
          avi: 'video/x-msvideo', webm: 'video/webm',
          mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
          aac: 'audio/aac', ogg: 'audio/ogg', m4a: 'audio/mp4',
          pdf: 'application/pdf',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
          json: 'application/json', js: 'text/javascript', ts: 'text/typescript',
          html: 'text/html', css: 'text/css', xml: 'text/xml',
        };
        if (mimeMap[ext]) mime = mimeMap[ext];
      }
      const contentLength = parseInt(res.headers.get('content-length') || '0');
      setTotalBytes(contentLength);
      const reader = res.body!.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setDownloadedBytes(received);
        if (contentLength > 0) setDownloadProgress(Math.round((received / contentLength) * 100));
      }
      return { blob: new Blob(chunks, { type: mime }), mime };
    } catch (err: any) {
      if (err.name === 'AbortError') { setPaused(true); return null; }
      throw err;
    }
  };

  // View count is now incremented server-side on every successful /validate call.
  // incrementAccess is kept only for folder ZIP downloads (separate action from page visit).
  const incrementAccess = () => {
    secureFetch('/api/share/increment', { linkId: realLinkId || linkId, downloadToken }, { method: 'POST' })
      .then(r => readMaybeEncryptedJson(r))
      .then(() => {
        setLinkInfo(prev => prev ? { ...prev, accessCount: (prev.accessCount ?? 0) + 1 } : prev);
      })
      .catch(() => {});
  };

  const handleDownload = async () => {
    if (!downloadToken || !linkInfo) return;
    if (paused) {
      setPaused(false);
      setState('downloading');
      try {
        const result = await fetchBlob();
        if (!result) return;
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url; a.download = linkInfo.fileName; a.click();
        URL.revokeObjectURL(url);
        setLinkInfo(prev => prev ? { ...prev, downloadCount: (prev.downloadCount ?? 0) + 1 } : prev);
        setState('done');
      } catch { setErrorMsg('Download failed.'); setState('error'); }
      return;
    }

    setState('downloading');
    abortControllerRef.current = new AbortController();
    try {
      const result = await fetchBlob(abortControllerRef.current.signal);
      if (!result) return;
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url; a.download = linkInfo.fileName; a.click();
      URL.revokeObjectURL(url);
      setLinkInfo(prev => prev ? { ...prev, downloadCount: (prev.downloadCount ?? 0) + 1 } : prev);
      setState('done');
    } catch { setErrorMsg('Download failed.'); setState('error'); }
  };

  const handlePause = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setPaused(true);
    }
  };

  const handlePreview = async () => {
    if (!downloadToken || !linkInfo) return;
    setState('previewing');
    try {
      const result = await fetchBlob(undefined, true);
      if (!result) return;
      setPreviewUrl(URL.createObjectURL(result.blob));
      setPreviewBlob(result.blob);
      setPreviewMime(result.mime);
      setState('done');
    } catch { setErrorMsg('Preview failed.'); setState('error'); }
  };

  const getPreviewType = (name: string, mime: string): string | null => {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    // Always check filename extension first — Dropbox often returns octet-stream
    if (/jpe?g|png|gif|webp|svg|avif|heic/.test(ext)) return 'image';
    if (/mp4|mov|mkv|avi|webm/.test(ext)) return 'video';
    if (/mp3|wav|flac|aac|ogg|m4a/.test(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx') return 'docx';
    if (ext === 'xlsx') return 'xlsx';
    if (ext === 'pptx') return 'pptx';
    if (/txt|md|json|js|ts|jsx|tsx|css|html|xml|csv|py|sh|yaml|yml|env|log|ini|toml/.test(ext)) return 'text';
    // Fall back to mime type
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf') return 'pdf';
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
    if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
    if (mime.startsWith('text/')) return 'text';
    return null;
  };

  const previewType = previewUrl && linkInfo ? getPreviewType(linkInfo.fileName, previewMime) : null;

  // ── Error / status screens ────────────────────────────────────────────────
  if (state === 'loading') return (
    <GlassPage>
      <div className="share-status-screen">
        <div className="share-spinner" />
        <p className="text-sm text-foreground/50 mt-4">Verifying link…</p>
      </div>
    </GlassPage>
  );

  if (state === 'not-found') return (
    <GlassPage>
      <div className="share-status-screen">
        <div className="share-status-icon share-status-icon--red">
          <AlertCircle className="w-7 h-7 text-white" />
        </div>
        <h1 className="share-status-title">Link Not Found</h1>
        <p className="share-status-sub">This share link is invalid or has been revoked.</p>
      </div>
    </GlassPage>
  );

  if (state === 'expired') return (
    <GlassPage>
      <div className="share-status-screen">
        <div className="share-status-icon share-status-icon--gray">
          <Clock className="w-7 h-7 text-white" />
        </div>
        <h1 className="share-status-title">Link Expired</h1>
        <p className="share-status-sub">This share link has expired and is no longer accessible.</p>
      </div>
    </GlassPage>
  );

  if (state === 'locked') return (
    <GlassPage>
      <div className="share-status-screen">
        <div className="share-status-icon share-status-icon--red">
          <Lock className="w-7 h-7 text-white" />
        </div>
        <h1 className="share-status-title">Too Many Attempts</h1>
        <p className="share-status-sub">Access temporarily blocked due to too many failed PIN attempts.</p>
        {retryAfterMins && <p className="text-sm font-semibold mt-2">Try again in {retryAfterMins} min.</p>}
      </div>
    </GlassPage>
  );

  if (state === 'error') return (
    <GlassPage>
      <div className="share-status-screen">
        <div className="share-status-icon share-status-icon--red">
          <AlertCircle className="w-7 h-7 text-white" />
        </div>
        <h1 className="share-status-title">Something Went Wrong</h1>
        <p className="share-status-sub">{errorMsg}</p>
        <button onClick={() => validateLink(null)} className="share-btn-primary mt-4 w-full justify-center">Try Again</button>
      </div>
    </GlassPage>
  );

  if (state === 'pin-required') return (
    <GlassPage>
      <div className="share-status-screen">
        <div className="share-status-icon share-status-icon--blue">
          <Shield className="w-7 h-7 text-white" />
        </div>
        <h1 className="share-status-title">PIN Protected</h1>
        <p className="share-status-sub">Enter the PIN to access this file</p>
      </div>
      <form onSubmit={e => { e.preventDefault(); setPinError(''); validateLink(pin); }} className="space-y-3 mt-2">
        <input
          type="password"
          inputMode="numeric"
          placeholder="Enter PIN"
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
          autoFocus
          maxLength={8}
          className="share-input w-full text-center text-2xl tracking-[0.5em] font-mono"
        />
        {pinError && (
          <p className="text-sm text-red-400 text-center">
            {pinError}
            {pinRemaining !== null && pinRemaining > 0 && <span className="text-foreground/40 ml-1">({pinRemaining} left)</span>}
          </p>
        )}
        <button type="submit" disabled={!pin} className="share-btn-primary w-full justify-center">
          <Lock className="w-4 h-4" /> Unlock
        </button>
      </form>
    </GlassPage>
  );

  // ── Ready / downloading / done ────────────────────────────────────────────
  return (
    <GlassPage>
      {/* File info header */}
      <div className="share-file-header">
        <div className={`share-file-icon ${linkInfo?.isFolder ? 'share-file-icon--folder' : ''}`}>
          <span className="text-white">
            {linkInfo?.isFolder
              ? <FolderOpen className="w-8 h-8" />
              : getFileIcon(linkInfo?.fileName ?? '')}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-semibold leading-tight break-all line-clamp-2">{linkInfo?.fileName}</h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {linkInfo?.fileSize && (
              <span className="share-meta-pill">{formatBytes(linkInfo.fileSize)}</span>
            )}
            <span className="share-meta-pill">
              <Clock className="w-3 h-3" /> <CountdownTimer expiresAt={linkInfo?.expiresAt ?? null} />
            </span>
            <span className="share-meta-pill" title="Page views">
              <Eye className="w-3 h-3" /> {linkInfo?.accessCount ?? 0} views
            </span>
            <span className="share-meta-pill" title="Downloads">
              <Download className="w-3 h-3" /> {linkInfo?.downloadCount ?? 0} downloads
              {linkInfo?.maxViews && (
                <span className="opacity-60 ml-0.5">/ {linkInfo.maxViews}</span>
              )}
            </span>
            {linkInfo?.oneTime && (
              <span className="share-meta-pill share-meta-pill--orange">
                <Flame className="w-3 h-3" /> One-time
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Shared by */}
      {linkInfo?.sharedBy && (
        <div className="flex items-center gap-2 px-1">
          <User className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
          <span className="text-xs text-foreground/50">Shared by</span>
          <span className="text-xs font-semibold text-foreground truncate">{linkInfo.sharedBy}</span>
        </div>
      )}
      {/* Message */}
      {linkInfo?.message && (
        <div className="share-hint share-hint--blue flex items-start gap-2">
          <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <p className="text-sm leading-relaxed">{linkInfo.message}</p>
        </div>
      )}

      {/* Warnings */}
      {linkInfo?.isVaultFile && (
        <div className="share-hint share-hint--purple">
          <Lock className="w-4 h-4 shrink-0" />
          Encrypted — you'll need the vault password to decrypt after downloading.
        </div>
      )}
      {linkInfo?.oneTime && state === 'ready' && (
        <div className="share-hint share-hint--orange">
          <Flame className="w-4 h-4 shrink-0" />
          This link self-destructs after one use.
        </div>
      )}

      {/* Expiry warning — pulsing red when < 1 hour left */}
      {linkInfo?.expiresAt && linkInfo.expiresAt - Date.now() < 3600_000 && linkInfo.expiresAt > Date.now() && state === 'ready' && (
        <div className="share-hint share-hint--red flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span>Expires in <CountdownTimer expiresAt={linkInfo.expiresAt} /> — download soon</span>
        </div>
      )}

      {/* Progress bar with MB display */}
      {(state === 'downloading' || state === 'previewing') && (
        <div className="space-y-1.5">
          <div className="share-progress-track">
            <div className="share-progress-fill" style={{ width: `${downloadProgress || 8}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-foreground/45">
            <span>{state === 'previewing' ? 'Loading preview' : 'Downloading'}…</span>
            <span>
              {downloadedBytes > 0 && (
                <>
                  {formatBytes(downloadedBytes)}
                  {totalBytes > 0 && <> / {formatBytes(totalBytes)}</>}
                  {downloadProgress > 0 && <> ({downloadProgress}%)</>}
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Preview */}
      {previewUrl && previewType && (
        <div className="share-preview-box">
          {previewType === 'image' && (
            <img src={previewUrl} alt={linkInfo?.fileName} className="w-full max-h-72 object-contain rounded-xl" />
          )}
          {previewType === 'video' && (
            <video src={previewUrl} controls className="w-full max-h-72 rounded-xl" />
          )}
          {previewType === 'audio' && (
            <div className="p-4">
              <audio src={previewUrl} controls className="w-full" />
            </div>
          )}
          {previewType === 'pdf' && (
            <iframe src={previewUrl} className="w-full h-72 border-0 rounded-xl" title={linkInfo?.fileName} />
          )}
          {previewType === 'docx' && previewBlob && <DocxPreview blob={previewBlob} />}
          {previewType === 'xlsx' && previewBlob && <XlsxPreview blob={previewBlob} />}
          {previewType === 'pptx' && <PptxPreview />}
          {previewType === 'text' && <TextPreview url={previewUrl} />}
        </div>
      )}

      {/* Folder: ZIP download + browser */}
      {linkInfo?.isFolder && downloadToken && folderPath && (state === 'ready' || state === 'done') && (
        <>
          <button
            onClick={async () => {
              setState('downloading');
              setDownloadProgress(0);
              try {
                const res = await secureFetch('/api/share/download-zip', { downloadToken }, {
                  method: 'POST',
                });
                if (!res.ok) { setErrorMsg('Folder download failed'); setState('error'); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `${linkInfo.fileName}.zip`; a.click();
                URL.revokeObjectURL(url);
                setLinkInfo(prev => prev ? { ...prev, downloadCount: (prev.downloadCount ?? 0) + 1 } : prev);
                setState('ready'); // stay on ready so folder browser stays visible
              } catch { setErrorMsg('Folder download failed'); setState('ready'); }
            }}
            className="share-btn-primary w-full justify-center"
          >
            <Download className="w-4 h-4" /> Download Folder as ZIP
          </button>
          {/* Reset state so folder browser stays visible after ZIP download */}
          <FolderBrowser
            rootPath={folderPath}
            downloadToken={downloadToken}
            linkId={linkId!}
          />
        </>
      )}

      {/* Copy link button — shown when ready and link is still active (not one-time/expired) */}
      {(state === 'ready' || state === 'done') && !linkInfo?.oneTime && !linkInfo?.isVaultFile && linkId && (
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="share-btn-secondary w-full justify-center"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Link copied!' : 'Copy Share Link'}
        </button>
      )}

      {/* Folder done state */}
      {linkInfo?.isFolder && state === 'done' && (
        <button onClick={() => setState('ready')} className="share-btn-secondary w-full justify-center">
          <FolderOpen className="w-4 h-4" /> Browse Folder
        </button>
      )}

      {/* File actions — only for non-folder */}
      {!linkInfo?.isFolder && (
        <>
          {state === 'done' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 py-2">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-500" />
                </div>
                <p className="text-sm font-medium text-foreground/70">
                  {previewUrl ? 'Preview ready' : 'Download complete'}
                </p>
              </div>
              {linkInfo?.oneTime ? (
                <p className="share-hint share-hint--amber justify-center">
                  This one-time link has now been revoked.
                </p>
              ) : (
                <button onClick={() => validateLink(pin || null)} className="share-btn-secondary w-full justify-center">
                  <Download className="w-4 h-4" /> Download Again
                </button>
              )}
            </div>
          ) : state === 'ready' ? (
            <div className="flex gap-2.5">
              {!linkInfo?.isVaultFile && (
                <button onClick={handlePreview} className="share-btn-secondary flex-1 justify-center">
                  <Eye className="w-4 h-4" /> Preview
                </button>
              )}
              <button onClick={handleDownload} className="share-btn-primary flex-1 justify-center">
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
          ) : state === 'downloading' && paused ? (
            <button onClick={handleDownload} className="share-btn-primary w-full justify-center">
              <Download className="w-4 h-4" /> Resume
            </button>
          ) : state === 'downloading' ? (
            <button onClick={handlePause} className="share-btn-secondary w-full justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Pause
            </button>
          ) : null}
        </>
      )}
    </GlassPage>
  );
};
