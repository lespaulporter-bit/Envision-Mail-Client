"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Keeps a single view crash from blanking the whole Electron shell with Next's generic page. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Envision Mail UI error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-soft px-6 text-center">
        <div className="max-w-md rounded-2xl border border-line bg-white p-8 shadow-sm">
          <h1 className="font-display text-2xl text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">
            The mail UI hit an error. Your accounts and mail are still on this computer — reload to continue.
          </p>
          <p className="mt-3 break-words rounded-lg bg-soft px-3 py-2 text-left text-xs text-muted">
            {this.state.error.message || "Unknown error"}
          </p>
          <button
            type="button"
            className="mt-5 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            onClick={() => {
              this.setState({ error: null });
              window.location.assign("/app/");
            }}
          >
            Reload Envision Mail
          </button>
        </div>
      </div>
    );
  }
}
