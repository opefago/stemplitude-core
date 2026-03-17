import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            backgroundColor: "#1e3c72",
            color: "white",
            minHeight: "50vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <h2>🚧 Oops! Something went wrong</h2>
          <p style={{ marginBottom: "2rem" }}>
            The electronics simulator encountered an error. This might be due to
            graphics compatibility issues.
          </p>
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.1)",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "2rem",
              maxWidth: "600px",
            }}
          >
            <h3>Try these solutions:</h3>
            <ul style={{ textAlign: "left" }}>
              <li>Refresh the page (F5 or Cmd+R)</li>
              <li>Try a different browser (Chrome, Firefox, Safari)</li>
              <li>Update your browser to the latest version</li>
              <li>Make sure hardware acceleration is enabled</li>
            </ul>
          </div>
          {this.state.error && (
            <details
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                padding: "1rem",
                borderRadius: "8px",
                maxWidth: "800px",
                width: "100%",
              }}
            >
              <summary style={{ cursor: "pointer", marginBottom: "1rem" }}>
                Technical Details
              </summary>
              <pre
                style={{
                  fontSize: "0.8rem",
                  textAlign: "left",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {this.state.error.toString()}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              padding: "1rem 2rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: "bold",
              marginTop: "2rem",
            }}
          >
            🔄 Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
