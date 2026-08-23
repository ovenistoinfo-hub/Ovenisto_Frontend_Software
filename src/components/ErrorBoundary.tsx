import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { isChunkLoadError, reloadForStaleChunk } from "@/lib/chunk-reload";

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // A stale chunk is not a fault to report — the tab is just a deploy behind.
    // reloadForStaleChunk() returns false if it already tried, which means the
    // chunk really is gone and the screen below should explain that instead.
    if (isChunkLoadError(error) && reloadForStaleChunk()) return;
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      const staleChunk = isChunkLoadError(this.state.error);
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4 max-w-md mx-auto p-8">
            <AlertTriangle className="h-16 w-16 text-destructive mx-auto" />
            <h1 className="text-2xl font-semibold text-foreground">
              {staleChunk ? "A new version is available" : "Something went wrong"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {staleChunk
                ? "This tab was open while the app was updated, so part of it is out of date. Reloading picks up the new version — nothing has been lost."
                : this.state.error?.message || "An unexpected error occurred."}
            </p>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              onClick={() => {
                // Reload in place for a stale chunk — the current page is fine
                // once the new assets are fetched, so there is no reason to
                // throw the user back to the dashboard.
                if (staleChunk) { window.location.reload(); return; }
                this.setState({ hasError: false, error: null });
                window.location.href = "/";
              }}
            >
              {staleChunk ? "Reload" : "Reload App"}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
