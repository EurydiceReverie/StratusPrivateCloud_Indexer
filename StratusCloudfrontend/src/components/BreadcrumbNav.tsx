import { ChevronRight, Home } from "lucide-react";
import { useState } from "react";

interface BreadcrumbNavProps {
  path: string[];
  pathStack: string[]; // actual Dropbox paths for each segment
  onNavigate: (index: number) => void;
  onDropToPath?: (destPath: string, destLabel: string) => void;
}

export default function BreadcrumbNav({ path, pathStack, onNavigate, onDropToPath }: BreadcrumbNavProps) {
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    // Only accept file/folder drags (not desktop file drops)
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      setDragOverIdx(idx);
    }
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(null);
    const destPath = pathStack[idx] ?? '';
    onDropToPath?.(destPath, path[idx]);
  };

  return (
    <div className="flex items-start">
      <div className="bg-card border border-border rounded-xl px-4 py-2 inline-flex items-center gap-2 max-w-full overflow-x-auto">
        {/* Terminal prompt */}
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="text-primary font-bold text-sm terminal-text">❯</span>
          <span className="text-primary cursor-blink terminal-text text-sm">▊</span>
        </div>

        <div className="flex items-center gap-1 terminal-text text-sm whitespace-nowrap">
          {path.map((segment, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
              <button
                onClick={e => { if (e.detail > 1) { e.preventDefault(); return; } onNavigate(i); }}
                onDragOver={e => handleDragOver(e, i)}
                onDragLeave={() => setDragOverIdx(null)}
                onDrop={e => handleDrop(e, i)}
                className={`transition-all duration-150 px-1.5 py-0.5 rounded-lg whitespace-nowrap flex items-center gap-1
                  ${i === path.length - 1 ? 'text-primary font-bold' : 'text-muted-foreground hover:text-primary'}
                  ${dragOverIdx === i ? 'bg-primary/15 text-primary ring-1 ring-primary/40' : ''}
                `}
              >
                {i === 0 ? <Home className="w-3 h-3" /> : segment}
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
