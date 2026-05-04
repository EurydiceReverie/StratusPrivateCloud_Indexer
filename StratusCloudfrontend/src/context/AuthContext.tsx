// STUB - Original AuthContext removed for public release
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  error: string | null;
  userInfo: { name: string; email: string; avatarUrl?: string } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated] = useState(false);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>('STUB - Auth disabled');
  const [userInfo] = useState(null);

  const login = useCallback(() => {}, []);
  const logout = useCallback(() => {}, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, error, userInfo }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export function getDevToken(): string | null { return null; }
