import React, { useState, useEffect, useCallback } from 'react';
import type { DBXFile } from '@/services/dropbox-service';
import { getVaultPassword, getVaultMasterKey } from '@/lib/vault-manager';
import { buildSandboxedSrcDoc, sanitizeUntrustedHtml } from '@/lib/html-sanitizer';
import {
  X, Download, Lock, AlertCircle, ChevronLeft, ChevronRight,
  FileText, Music, Video, Image as ImageIcon, Code, FileSpreadsheet, FileQuestion,
} from 'lucide-react';
import { downloadSingleFile } from '@/services/downloadService';
import { toast } from 'sonner';

interface FilePreviewDialogProps {
  open: boolean;
  file: DBXFile | null;
  files?: DBXFile[];
  vaultId?: string | null;
  onClose: () => void;
}

type PreviewType = 'image' | 'video' | 'audio' | 'pdf' | 'code' | 'text' | 'docx' | 'xlsx' | 'pptx' | 'unsupported';

function getPreviewType(name: string): PreviewType {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes(ext)) return 'image';
  if (['mp4','webm','ogg','mov','mkv'].includes(ext)) return 'video';
  if (['mp3','wav','flac','aac','m4a','opus'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (['docx','doc'].includes(ext)) return 'docx';
  if (['xlsx','xls'].includes(ext)) return 'xlsx';
  if (['pptx','ppt'].includes(ext)) return 'pptx';
  if (['js','ts','tsx','jsx','py','java','c','cpp','cs','go','rs','php','rb','swift','kt',
       'sh','json','yaml','yml','toml','xml','html','css','scss','md','sql'].includes(ext)) return 'code';
  if (['txt','log','csv','ini'].includes(ext)) return 'text';
  return 'unsupported';
}

// iPhone-style activity indicator
const IPhoneSpinner: React.FC<{ label?: string }> = ({ label }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: '16px' }}>
    <div style={{ position: 'relative', width: '36px', height: '36px' }}>
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30 * Math.PI) / 180;
        const r = 12;
        const cx = 18 + r * Math.sin(angle);
        const cy = 18 - r * Math.cos(angle);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: '2.5px',
              height: '7px',
              borderRadius: '2px',
              background: 'currentColor',
              left: `${cx}px`,
              top: `${cy}px`,
              transformOrigin: 'center center',
              transform: `rotate(${i * 30}deg)`,
              opacity: (i + 1) / 12,
              animation: 'iphone-spin 1.2s linear infinite',
              animationDelay: `${(i / 12) - 1}s`,
            }}
          />
        );
      })}
    </div>
    {label && (
      <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: 0 }}>{label}</p>
    )}
  </div>
);

async function getDropboxTempLink(path: string): Promise<string> {
  const { getTemporaryLink } = await import('@/services/dropbox-service');
  return getTemporaryLink(path);
}

async function downloadDropboxBlob(path: string): Promise<Blob> {
  const { downloadFile } = await import('@/services/dropbox-service');
  return downloadFile(path);
}

// ── Preview renderers ─────────────────────────────────────────────────────────

const ImagePreview: React.FC<{ path: string; name: string; isVault: boolean; blob?: Blob }> = ({ path, name, isVault, blob }) => {
  const [src, setSrc] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (blob) { setSrc(URL.createObjectURL(blob)); return; }
    if (!isVault) {
      // Use temp link for full-quality image streaming
      getDropboxTempLink(path)
        .then(link => setSrc(link))
        .catch(() => {
          downloadDropboxBlob(path).then(b => setSrc(URL.createObjectURL(b))).catch(() => setError(true));
        });
    }
  }, [path, isVault, blob]);

  if (error) return <p className="text-destructive text-sm text-center py-8">Failed to load image</p>;
  if (!src) return <IPhoneSpinner label="Loading" />;
  return <img src={src} alt={name} className="max-w-full max-h-[70vh] object-contain mx-auto rounded-lg" />;
};

const MediaPreview: React.FC<{ path: string; type: 'video' | 'audio'; isVault: boolean; blob?: Blob }> = ({ path, type, isVault, blob }) => {
  const [src, setSrc] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (blob) { setSrc(URL.createObjectURL(blob)); return; }
    if (!isVault) {
      getDropboxTempLink(path).then(link => setSrc(link)).catch(() => setError(true));
    }
  }, [path, isVault, blob]);

  if (error) return <p className="text-destructive text-sm text-center py-8">Failed to load media</p>;
  if (!src) return <IPhoneSpinner label="Loading" />;

  if (type === 'video') return <video src={src} controls autoPlay className="max-w-full max-h-[70vh] mx-auto rounded-lg" />;
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Music className="w-16 h-16 text-muted-foreground opacity-50" />
      <audio src={src} controls className="w-full" />
    </div>
  );
};

const PdfPreview: React.FC<{ path: string; name: string; isVault: boolean; blob?: Blob }> = ({ path, name, isVault, blob }) => {
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState(0);
  const [renderedPages, setRenderedPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setLoading(true);
    setNumPages(0);
    setRenderedPages(0);
    if (canvasRef.current) canvasRef.current.innerHTML = '';

    const render = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        let data: ArrayBuffer;
        if (blob) {
          data = await blob.arrayBuffer();
        } else if (!isVault) {
          const b = await downloadDropboxBlob(path);
          data = await b.arrayBuffer();
        } else {
          return;
        }

        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;

        setNumPages(pdf.numPages);
        setLoading(false);

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) break;
          const page = await pdf.getPage(pageNum);
          if (cancelled) break;

          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'w-full rounded mb-2 border border-border/30';
          const ctx = canvas.getContext('2d')!;

          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) break;

          canvasRef.current?.appendChild(canvas);
          setRenderedPages(pageNum);
        }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    };

    void render();
    return () => { cancelled = true; };
  }, [path, isVault, blob]);

  if (error) return <p className="text-destructive text-sm text-center py-8">Failed to load PDF</p>;
  return (
    <div className="w-full h-[70vh] overflow-y-auto rounded-lg border border-border bg-background p-2">
      {loading && <IPhoneSpinner label="Loading PDF" />}
      {!loading && numPages > 0 && renderedPages < numPages && (
        <p className="text-xs text-center text-muted-foreground mb-2">Rendering page {renderedPages} of {numPages}…</p>
      )}
      <div ref={canvasRef} className="flex flex-col items-center" />
    </div>
  );
};

const DocxPreview: React.FC<{ blob: Blob }> = ({ blob }) => {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    import('mammoth').then(async ({ default: mammoth }) => {
      const buf = await blob.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      setHtml(sanitizeUntrustedHtml(result.value));
    }).catch(() => setError('Failed to render document'));
  }, [blob]);

  if (error) return <p className="text-destructive text-sm text-center py-8">{error}</p>;
  if (!html) return <IPhoneSpinner label="Rendering" />;
  return (
    <iframe
      srcDoc={buildSandboxedSrcDoc(html)}
      className="w-full h-[70vh] rounded-lg border border-border bg-background"
      title="Document preview"
      sandbox=""
    />
  );
};

const XlsxPreview: React.FC<{ blob: Blob }> = ({ blob }) => {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    import('xlsx').then(async (XLSX) => {
      const buf = await blob.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      setHtml(sanitizeUntrustedHtml(XLSX.utils.sheet_to_html(ws)));
    }).catch(() => setError('Failed to render spreadsheet'));
  }, [blob]);

  if (error) return <p className="text-destructive text-sm text-center py-8">{error}</p>;
  if (!html) return <IPhoneSpinner label="Rendering" />;
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-background">
      <iframe
        srcDoc={buildSandboxedSrcDoc(html)}
        className="w-full h-[70vh] border-0 bg-background"
        title="Spreadsheet preview"
        sandbox=""
      />
    </div>
  );
};

// PPTX Preview — uses Google Docs Viewer (external, no download needed)
const PptxPreview: React.FC<{ path: string; dropboxToken: string }> = ({ path, dropboxToken }) => {
  const [tempLink, setTempLink] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Get Dropbox temp link, then pass through Google Docs Viewer
    getDropboxTempLink(path)
      .then(link => setTempLink(link))
      .catch(() => setError('Failed to get file link'));
  }, [path]);

  if (error) return <p className="text-destructive text-sm text-center py-8">{error}</p>;
  if (!tempLink) return <IPhoneSpinner label="Loading presentation" />;

  const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(tempLink)}&embedded=true`;

  return (
    <iframe
      src={viewerUrl}
      className="w-full h-[70vh] rounded-xl border border-border"
      title="PPTX Preview"
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  );
};

const CodePreview: React.FC<{ blob: Blob }> = ({ blob }) => {
  const [text, setText] = useState('');
  useEffect(() => { blob.text().then(setText); }, [blob]);
  if (!text) return <IPhoneSpinner label="Loading" />;
  return (
    <pre className="max-h-[70vh] overflow-auto p-4 bg-muted rounded-lg text-xs font-mono whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
};

// ── Main dialog ───────────────────────────────────────────────────────────────
export const FilePreviewDialog: React.FC<FilePreviewDialogProps> = ({
  open, file, files = [], vaultId, onClose,
}) => {
  const [currentFile, setCurrentFile] = useState<DBXFile | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const navigableFiles = files.filter(f => !f.isFolder);
  const displayFile = currentFile || file;
  const displayName = displayFile?.isVaultFile ? displayFile.name.replace(/\.vault$/, '') : displayFile?.name || '';
  const type = getPreviewType(displayName);
  const currentIdx = currentFile ? navigableFiles.findIndex(f => f.id === currentFile.id) : -1;
  const needsBlob = displayFile?.isVaultFile || ['docx', 'xlsx', 'code', 'text'].includes(type);

  const loadFile = useCallback(async (f: DBXFile) => {
    const fName = f.isVaultFile ? f.name.replace(/\.vault$/, '') : f.name;
    const fType = getPreviewType(fName);
    const fNeedsBlob = f.isVaultFile || ['docx', 'xlsx', 'code', 'text'].includes(fType);

    if (!fNeedsBlob) { setBlob(null); setLoading(false); setError(''); return; }

    setLoading(true); setBlob(null); setError('');
    try {
      const rawBlob = await downloadDropboxBlob(f.path);

      if (f.isVaultFile && vaultId) {
        const access = getVaultMasterKey(vaultId) ?? getVaultPassword(vaultId);
        if (!access) { setError('Vault is locked. Please unlock it first.'); setLoading(false); return; }

        const { decryptForPreview } = await import('@/lib/vault-crypto-advanced');
        const { data, originalName } = await decryptForPreview(rawBlob, access, vaultId);
        // Update displayName via state trick
        setBlob(new Blob([await data.arrayBuffer()], { type: data.type }));
        setCurrentFile({ ...f, name: originalName + '.vault' }); // keep .vault suffix for type detection
      } else {
        setBlob(rawBlob);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  }, [vaultId]);

  useEffect(() => {
    if (open) {
      setIsVisible(true);
      setIsClosing(false);
    }
  }, [open]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      onClose();
    }, 200); // match genie-close duration
  };

  useEffect(() => {
    if (open && file) { setCurrentFile(file); loadFile(file); }
    if (!open) { setBlob(null); setError(''); setCurrentFile(null); }
  }, [open, file, loadFile]);

  const navigate = (dir: -1 | 1) => {
    const next = navigableFiles[currentIdx + dir];
    if (next) { setCurrentFile(next); loadFile(next); }
  };

  const typeIcon: Record<PreviewType, React.ReactNode> = {
    image: <ImageIcon className="w-4 h-4" />, video: <Video className="w-4 h-4" />,
    audio: <Music className="w-4 h-4" />, pdf: <FileText className="w-4 h-4" />,
    code: <Code className="w-4 h-4" />, text: <FileText className="w-4 h-4" />,
    docx: <FileText className="w-4 h-4" />, xlsx: <FileSpreadsheet className="w-4 h-4" />,
    pptx: <FileText className="w-4 h-4" />, unsupported: <FileQuestion className="w-4 h-4" />,
  };

  const renderContent = () => {
    if (loading) return <IPhoneSpinner label={displayFile?.isVaultFile ? 'Decrypting' : 'Loading'} />;
    if (error) return (
      <div className="flex flex-col items-center gap-3 py-12 text-destructive">
        <AlertCircle className="w-10 h-10" /><p className="text-sm">{error}</p>
      </div>
    );
    if (!displayFile) return null;

    if (displayFile.isVaultFile && blob) {
      const t = getPreviewType(displayName);
      if (t === 'image') return <ImagePreview path={displayFile.path} name={displayName} isVault blob={blob} />;
      if (t === 'video') return <MediaPreview path={displayFile.path} type="video" isVault blob={blob} />;
      if (t === 'audio') return <MediaPreview path={displayFile.path} type="audio" isVault blob={blob} />;
      if (t === 'pdf') return <PdfPreview path={displayFile.path} name={displayName} isVault blob={blob} />;
      if (t === 'docx') return <DocxPreview blob={blob} />;
      if (t === 'xlsx') return <XlsxPreview blob={blob} />;
      if (t === 'code' || t === 'text') return <CodePreview blob={blob} />;
    }

    if (type === 'image') return <ImagePreview path={displayFile.path} name={displayName} isVault={false} />;
    if (type === 'video') return <MediaPreview path={displayFile.path} type="video" isVault={false} />;
    if (type === 'audio') return <MediaPreview path={displayFile.path} type="audio" isVault={false} />;
    if (type === 'pdf') return <PdfPreview path={displayFile.path} name={displayName} isVault={false} />;
    if (type === 'docx' && blob) return <DocxPreview blob={blob} />;
    if (type === 'xlsx' && blob) return <XlsxPreview blob={blob} />;
    if (type === 'pptx') return <PptxPreview path={displayFile.path} dropboxToken="" />;
    if ((type === 'code' || type === 'text') && blob) return <CodePreview blob={blob} />;

    return (
      <div className="flex flex-col items-center gap-4 py-12 text-muted-foreground">
        <FileQuestion className="w-16 h-16 opacity-30" />
        <p className="text-sm">Preview not available for this file type.</p>
        <p className="text-xs opacity-60">Download the file to open it locally.</p>
      </div>
    );
  };

  if (!isVisible && !open) return null;

  return (
    // Custom modal — no shadcn Dialog (avoids double close button)
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-xl" onClick={handleClose} />
      <div className={`relative bg-card border border-border rounded-2xl w-full max-w-[90vw] max-h-[95vh] overflow-hidden flex flex-col ${
        isClosing ? 'genie-close' : 'genie-open'
      }`}>

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 shrink-0">
          {displayFile?.isVaultFile && <Lock className="w-4 h-4 text-purple-500 shrink-0" />}
          {typeIcon[type]}
          <span className="font-medium text-sm truncate flex-1">{displayName}</span>
          {navigableFiles.length > 1 && (
            <span className="text-xs text-muted-foreground shrink-0">{currentIdx + 1} / {navigableFiles.length}</span>
          )}
          <button
            className="bg-secondary hover:bg-secondary/80 rounded-xl p-2 shrink-0 transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-[0.96]"
            onClick={() => displayFile && downloadSingleFile(displayFile.path, displayFile.name).catch(() => toast.error('Download failed'))}
          >
            <Download className="w-4 h-4 text-foreground/70" />
          </button>
          <button className="bg-secondary hover:bg-secondary/80 rounded-xl p-2 shrink-0 transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-[0.96]" onClick={handleClose}>
            <X className="w-4 h-4 text-foreground/70" />
          </button>
        </div>

        {/* Nav arrows */}
        {navigableFiles.length > 1 && currentIdx > 0 && (
          <button className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-secondary hover:bg-secondary/80 rounded-full p-2.5 transition-all duration-200 hover:scale-110 hover:shadow-lg active:scale-95" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {navigableFiles.length > 1 && currentIdx < navigableFiles.length - 1 && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-secondary hover:bg-secondary/80 rounded-full p-2.5 transition-all duration-200 hover:scale-110 hover:shadow-lg active:scale-95" onClick={() => navigate(1)}>
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 min-h-0">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};
