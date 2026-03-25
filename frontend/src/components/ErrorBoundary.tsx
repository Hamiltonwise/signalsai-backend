/**
 * ErrorBoundary — catches unhandled React errors.
 * Renders ServerError page instead of blank screen.
 */

import { Component, type ReactNode } from "react";
import ServerError from "../pages/ServerError";

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

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <ServerError />;
    }
    return this.props.children;
  }
}
