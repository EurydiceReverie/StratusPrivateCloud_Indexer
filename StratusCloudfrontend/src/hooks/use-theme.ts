import { useSyncExternalStore } from "react";

const STORAGE_KEY = "stratus-theme";
const subscribers = new Set<() => void>();

function getInitialDark(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

let themeState = getInitialDark();

function emitThemeChange() {
  for (const subscriber of subscribers) subscriber();
}

function applyTheme(nextDark: boolean) {
  themeState = nextDark;

  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", nextDark);
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, nextDark ? "dark" : "light");
  }

  emitThemeChange();
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  return themeState;
}

function getServerSnapshot() {
  return false;
}

// Apply theme immediately on module load (prevents flash)
if (typeof window !== "undefined") {
  document.documentElement.classList.toggle("dark", themeState);

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    themeState = event.newValue ? event.newValue === "dark" : getInitialDark();
    document.documentElement.classList.toggle("dark", themeState);
    emitThemeChange();
  });
}

export function useTheme() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => applyTheme(!themeState);

  return { isDark, toggle };
}
