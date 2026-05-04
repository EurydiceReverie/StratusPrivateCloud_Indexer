import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
// Legacy mesh background kept for easy rollback.
// import { MeshRouteBackground } from "@/components/MeshRouteBackground";
import { PaperShaderRouteBackground } from "@/components/PaperShaderRouteBackground";
import { AuthProvider } from "@/context/AuthContext";
import { AppAccessProvider } from "@/context/AppAccessContext";
import { StatusMonitorBootstrap } from "@/components/StatusMonitorBootstrap";
import { LiteModeBoundary } from "@/components/LiteModeBoundary";
import { isLiteRoutePath } from "@/lib/app-mode";
import Index from "./pages/Index";
import VaultPage from "./pages/VaultPage";
import StatusPage from "./pages/StatusPage";
import { SharePage } from "./pages/SharePage";
import { HistoryPage } from "./pages/HistoryPage";
import NotFound from "./pages/NotFound";
import { TransferPanel } from "./components/TransferPanel";

const queryClient = new QueryClient();

function AppRoutes() {
  const location = useLocation();
  const liteRoute = isLiteRoutePath(location.pathname);

  return (
    <>
      {/* Legacy mesh background kept commented for easy rollback. */}
      {/* {!liteRoute && <MeshRouteBackground />} */}
      {!liteRoute && <PaperShaderRouteBackground />}
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth/callback" element={<Index />} />
        <Route path="/vault" element={<VaultPage />} />
        <Route path="/lv" element={<LiteModeBoundary><Index /></LiteModeBoundary>} />
        <Route path="/lv/auth/callback" element={<LiteModeBoundary><Index /></LiteModeBoundary>} />
        <Route path="/lv/vault" element={<LiteModeBoundary><VaultPage /></LiteModeBoundary>} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/lv/status" element={<LiteModeBoundary><StatusPage /></LiteModeBoundary>} />
        <Route path="/share/:linkId" element={<SharePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => {
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppAccessProvider>
        <AuthProvider>
          <TooltipProvider>
            <StatusMonitorBootstrap />
            <Toaster />
            <Sonner
              position="bottom-right"
              closeButton
              toastOptions={{
                style: {
                  background: 'hsl(var(--background) / 0.80)',
                  backdropFilter: 'blur(28px) saturate(2)',
                  WebkitBackdropFilter: 'blur(28px) saturate(2)',
                  border: '1px solid hsl(var(--border) / 0.45)',
                  borderRadius: '16px',
                  boxShadow: '0 8px 32px hsl(0 0% 0% / 0.18), inset 0 1px 0 hsl(0 0% 100% / 0.1)',
                  color: 'hsl(var(--foreground))',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                },
                classNames: {
                  success: 'toast-success',
                  error: 'toast-error',
                  warning: 'toast-warning',
                  info: 'toast-info',
                  loading: 'toast-loading',
                },
              }}
            />
            <TransferPanel />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </AppAccessProvider>
    </QueryClientProvider>
  );
};

export default App;
