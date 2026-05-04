import React, { useRef, useState, useEffect, useCallback } from 'react';

interface Rect { x: number; y: number; w: number; h: number; }

interface RubberBandSelectProps {
  itemRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  onSelect: (ids: Set<string>) => void;
  onClearSelection: () => void;
  disabled?: boolean;
  color?: 'blue' | 'purple';
}

export const RubberBandSelect: React.FC<RubberBandSelectProps> = ({
  itemRefs, onSelect, onClearSelection, disabled, color = 'blue',
}) => {
  const [rect, setRect] = useState<Rect | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const animFrame = useRef<number | null>(null);
  // Cache item bounds once per drag start for performance
  const itemBoundsCache = useRef<Map<string, DOMRect>>(new Map());

  const getOverlapping = useCallback((selRect: Rect): Set<string> => {
    const selected = new Set<string>();
    const selRight = selRect.x + selRect.w;
    const selBottom = selRect.y + selRect.h;
    itemBoundsCache.current.forEach((bounds, id) => {
      if (
        bounds.left < selRight &&
        bounds.right > selRect.x &&
        bounds.top < selBottom &&
        bounds.bottom > selRect.y
      ) {
        selected.add(id);
      }
    });
    return selected;
  }, []);

  useEffect(() => {
    if (disabled) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;

      // Skip actual interactive UI elements and file items themselves.
      // Rubber-band selection should start only from empty/background space.
      const isInteractive =
        target.closest('button') ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('a[href]') ||
        target.closest('[data-file-item="true"]') ||
        target.closest('[data-radix-context-menu-content]') ||
        target.closest('[data-radix-popper-content-wrapper]') ||
        target.closest('[data-radix-dropdown-menu-content]') ||
        target.closest('[data-radix-dialog-content]');

      if (isInteractive) {
        return;
      }

      // Clear selection only when clicking empty space outside file items.
      onClearSelection();

      // Cache all item bounds NOW (before drag) for performance
      itemBoundsCache.current.clear();
      itemRefs.current.forEach((el, id) => {
        itemBoundsCache.current.set(id, el.getBoundingClientRect());
      });

      startPos.current = { x: e.clientX, y: e.clientY };
      isDragging.current = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!startPos.current) return;
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;

      if (!isDragging.current && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      isDragging.current = true;

      const selRect: Rect = {
        x: Math.min(startPos.current.x, e.clientX),
        y: Math.min(startPos.current.y, e.clientY),
        w: Math.abs(dx),
        h: Math.abs(dy),
      };

      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      animFrame.current = requestAnimationFrame(() => {
        setRect(selRect);
        const ids = getOverlapping(selRect);
        if (ids.size > 0) onSelect(ids);
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      const wasDragging = isDragging.current;
      startPos.current = null;
      isDragging.current = false;
      itemBoundsCache.current.clear();

      if (wasDragging) {
        setTimeout(() => setRect(null), 50);
      } else {
        setRect(null);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [disabled, getOverlapping, onSelect, onClearSelection, itemRefs]);

  if (!rect) return null;

  const bg = color === 'purple' ? 'hsl(270 80% 60% / 0.10)' : 'hsl(211 100% 58% / 0.08)';
  const border = color === 'purple' ? 'hsl(270 80% 60% / 0.45)' : 'hsl(211 100% 58% / 0.4)';

  return (
    <div
      style={{
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        pointerEvents: 'none',
        zIndex: 9999,
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: '6px',
        backdropFilter: 'blur(1px)',
      }}
    />
  );
};
