import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/error-boundary';
import { Layout } from './components/layout';
import { Home } from './pages/index';
import { Result } from './pages/result';
import { History } from './pages/history';
import { RiskTags } from './pages/risk-tags';
import { UrlCheck } from './pages/url-check';
import NotFound from './pages/not-found';

const queryClient = new QueryClient();

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Layout>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/result/:id" component={Result} />
              <Route path="/history" component={History} />
              <Route path="/history/:id" component={Result} />
              <Route path="/risk-tags" component={RiskTags} />
              <Route path="/url-check" component={UrlCheck} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </WouterRouter>
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
