// STUB - Original AppAccessContext removed for public release
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Lock, LogOut } from 'lucide-react';

type AppAccessState = {
  granted: boolean;
  isLoading: boolean;
  error: string | null;
  attemptsRemaining: number | null;
  blockedUntil: number | null;
  expiresAt: number | null;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  logoutAndExit: () => Promise<void>;
};

const AppAccessContext = createContext<AppAccessState | undefined>(undefined);

function AppAccessGate({ onSubmit, isLoading, error }: { onSubmit: (password: string) => Promise<boolean>; isLoading: boolean; error: string | null }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Protected app access</h1>
            <p className="text-xs text-muted-foreground">STUB - App access disabled</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}

export const AppAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [granted] = useState(false);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>('STUB - App access disabled');

  const login = useCallback(async () => false, []);
  const logout = useCallback(async () => {}, []);
  const logoutAndExit = useCallback(async () => {}, []);

  const value = useMemo<AppAccessState>(() => ({
    granted, isLoading, error, attemptsRemaining: null, blockedUntil: null, expiresAt: null, login, logout, logoutAndExit,
  }), [granted, isLoading, error, login, logout, logoutAndExit]);

  return (
    <AppAccessContext.Provider value={value}>
      {granted ? children : <AppAccessGate onSubmit={login} isLoading={isLoading} error={error} />}
    </AppAccessContext.Provider>
  );
};

export function useAppAccess(): AppAccessState {
  const context = useContext(AppAccessContext);
  if (!context) throw new Error('useAppAccess must be used within AppAccessProvider');
  return context;
}

export function AppAccessFooterButton() {
  const { logoutAndExit } = useAppAccess();
  return (
    <Button variant="ghost" size="sm" onClick={() => { void logoutAndExit(); }} className="rounded-xl">
      <LogOut className="w-3.5 h-3.5 mr-1.5" /> Exit Tab
    </Button>
  );
}
