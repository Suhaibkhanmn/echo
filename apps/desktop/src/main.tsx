import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "@accountability/ui/src/global.css";

type EBState = { err: Error | null };

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  EBState
> {
  state: EBState = { err: null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("render error:", err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: "monospace",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            color: "#9B3B3B",
            background: "#FAFAF7",
            height: "100%",
            overflow: "auto",
          }}
        >
          {"render error:\n\n"}
          {String(this.state.err?.stack ?? this.state.err)}
        </div>
      );
    }
    return this.props.children as any;
  }
}

window.addEventListener("error", (e) => {
  console.error("window error:", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("unhandled rejection:", e.reason);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
