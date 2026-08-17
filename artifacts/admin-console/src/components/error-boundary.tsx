import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// See artifacts/rhetoric-xray/src/components/error-boundary.tsx for the
// same pattern and rationale — contains uncaught render errors to a card
// instead of a blank white page.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center px-4">
          <AlertTriangle className="w-16 h-16 text-destructive/80" />
          <h2 className="text-2xl font-bold text-foreground">畫面發生錯誤</h2>
          <p className="text-muted-foreground max-w-md">
            很抱歉，頁面在顯示過程中發生非預期錯誤。請重新整理頁面再試一次。
          </p>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" /> 重新整理
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
