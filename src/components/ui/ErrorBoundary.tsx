'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          textAlign: 'center',
        }}>
          <h2 style={{ fontSize: 'var(--t-title2)', marginBottom: '16px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 'var(--t-body)', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--accent)',
              color: 'white',
              border: 'none',
              fontSize: 'var(--t-body)',
              fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
