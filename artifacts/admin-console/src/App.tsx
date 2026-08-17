import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./components/error-boundary";
import { ProtectedRoute } from "./components/protected-route";
import { AuthProvider } from "./lib/auth-context";
import { Login } from "./pages/login";
import { Dashboard } from "./pages/dashboard";
import { Records } from "./pages/records";
import { RecordDetail } from "./pages/record-detail";
import { Products } from "./pages/products";
import { ProductDetail } from "./pages/product-detail";
import { RiskTags } from "./pages/risk-tags";
import { RiskTagDetailPage } from "./pages/risk-tag-detail";
import { RiskAnalyze } from "./pages/risk-analyze";
import { UrlScans } from "./pages/url-scans";
import { AdminUsers } from "./pages/admin-users";

const queryClient = new QueryClient();

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Switch>
              <Route path="/login" component={Login} />
              <Route path="/">
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              </Route>
              <Route path="/records">
                <ProtectedRoute>
                  <Records />
                </ProtectedRoute>
              </Route>
              <Route path="/records/:id">
                <ProtectedRoute>
                  <RecordDetail />
                </ProtectedRoute>
              </Route>
              <Route path="/products">
                <ProtectedRoute>
                  <Products />
                </ProtectedRoute>
              </Route>
              <Route path="/products/:id">
                <ProtectedRoute>
                  <ProductDetail />
                </ProtectedRoute>
              </Route>
              <Route path="/risk-tags">
                <ProtectedRoute>
                  <RiskTags />
                </ProtectedRoute>
              </Route>
              <Route path="/risk-tags/:id">
                <ProtectedRoute>
                  <RiskTagDetailPage />
                </ProtectedRoute>
              </Route>
              <Route path="/risk-analyze">
                <ProtectedRoute>
                  <RiskAnalyze />
                </ProtectedRoute>
              </Route>
              <Route path="/url-scans">
                <ProtectedRoute>
                  <UrlScans />
                </ProtectedRoute>
              </Route>
              <Route path="/users">
                <ProtectedRoute>
                  <AdminUsers />
                </ProtectedRoute>
              </Route>
              <Route>
                <div className="flex items-center justify-center min-h-screen text-muted-foreground">
                  找不到這個頁面
                </div>
              </Route>
            </Switch>
          </WouterRouter>
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
