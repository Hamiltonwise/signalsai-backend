/**
 * ErrorBoundary -- catches unhandled React errors and shows a branded recovery UI.
 *
 * Usage:
 *   <ErrorBoundary key={location.pathname}>
 *     <RouteContent />
 *   </ErrorBoundary>
 *
 * Passing `key={location.pathname}` resets error state on navigation so the
 * user isn't stuck on the error screen after clicking a link.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FAFAF8",
            padding: "1.25rem",
          }}
        >
          <div
            style={{
              maxWidth: "26rem",
              width: "100%",
              backgroundColor: "#ffffff",
              borderRadius: "1rem",
              boxShadow:
                "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
              padding: "2.5rem 2rem",
              textAlign: "center",
              fontFamily:
                'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {/* Alloro wordmark */}
            <p
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#D56753",
                letterSpacing: "-0.01em",
                marginBottom: "1.5rem",
              }}
            >
              alloro
            </p>

            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#1A1D23",
                margin: "0 0 0.5rem",
              }}
            >
              Something went wrong
            </h1>

            <p
              style={{
                fontSize: "0.875rem",
                color: "#6b7280",
                lineHeight: 1.5,
                margin: "0 0 1.75rem",
              }}
            >
              Refresh to continue. If this keeps happening, contact support.
            </p>

            <button
              onClick={() => window.location.reload()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                backgroundColor: "#D56753",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "0.875rem",
                padding: "0.75rem 1.5rem",
                borderRadius: "0.75rem",
                border: "none",
                cursor: "pointer",
                transition: "filter 150ms ease",
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLButtonElement).style.filter =
                  "brightness(1.05)";
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.filter = "none";
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
