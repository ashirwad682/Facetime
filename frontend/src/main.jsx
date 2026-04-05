import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { CallProvider } from './context/CallContext.jsx';

/**
 * Top-level Error Boundary.
 * Catches any unhandled JS crash in the React tree so the user
 * sees a friendly message instead of a blank black screen.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100dvh',
          background: '#121212',
          color: '#f1f1f1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'Inter, -apple-system, sans-serif',
          textAlign: 'center',
          gap: '1rem',
        }}>
          <div style={{ fontSize: '3rem' }}>📵</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: '#888', margin: 0, fontSize: '0.95rem' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 2rem',
              background: '#0A84FF',
              color: '#fff',
              border: 'none',
              borderRadius: '9999px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <SocketProvider>
            <CallProvider>
              <App />
            </CallProvider>
          </SocketProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  </React.StrictMode>
);
