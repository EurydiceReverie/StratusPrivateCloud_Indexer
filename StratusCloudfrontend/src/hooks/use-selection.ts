import { useState, useCallback } from "react";
import { FSItem } from "@/data/filesystem";

export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const toggle = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const selectAll = useCallback((items: FSItem[]) => {
    setSelected(new Set(items.map((i) => i.name)));
    setSelectMode(true);
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectMode(false);
  }, []);

  const enterSelectMode = useCallback(() => setSelectMode(true), []);

  return { selected, selectMode, toggle, selectAll, clearSelection, enterSelectMode, setSelectMode };
}
