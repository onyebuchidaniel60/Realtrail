import { Component, type ReactNode } from "react";

export class QueryErrorBoundary extends Component<
  {
    children: ReactNode;
    fallback: (error: unknown, reset: () => void) => ReactNode;
  },
  { error: unknown; resetKey: number }
> {
  constructor(props: {
    children: ReactNode;
    fallback: (error: unknown, reset: () => void) => ReactNode;
  }) {
    super(props);
    this.state = { error: null, resetKey: 0 };
  }

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  reset = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render() {
    if (this.state.error !== null && this.state.error !== undefined) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}
