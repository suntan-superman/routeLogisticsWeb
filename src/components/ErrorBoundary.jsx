import React, { Component } from 'react';

/**
 * Error Boundary component that catches JavaScript errors anywhere in the child
 * component tree and displays a fallback UI instead of crashing the whole app.
 * 
 * Usage:
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * 
 * Or with custom fallback:
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <MyComponent />
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      eventId: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Store error info for display
    this.setState({ 
      errorInfo,
      eventId: Date.now().toString(36) // Simple error tracking ID
    });
    
    // Log to external error tracking service (if configured)
    // This is where you'd integrate with Sentry, LogRocket, etc.
    this.logErrorToService(error, errorInfo);
  }

  logErrorToService(error, errorInfo) {
    // In production, you would send this to an error tracking service
    // For now, we'll just log to console
    const errorData = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    console.error('[ErrorBoundary] Error logged:', errorData);
    
    // TODO: Integrate with error tracking service
    // Example with Sentry:
    // Sentry.captureException(error, { extra: errorData });
  }

  handleRefresh = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReportError = () => {
    // Open support page with pre-filled error info
    const { error, eventId } = this.state;
    const errorSummary = encodeURIComponent(
      `Error ID: ${eventId}\nMessage: ${error?.message}\nURL: ${window.location.href}`
    );
    window.location.href = `/support?error=${errorSummary}`;
  };

  render() {
    const { hasError, error, eventId } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // If a custom fallback is provided, use it
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
            {/* Error Icon */}
            <div className="mx-auto mb-6">
              <svg 
                className="w-16 h-16 text-red-500 mx-auto" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                />
              </svg>
            </div>

            {/* Error Title */}
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Something went wrong
            </h1>
            
            {/* Error Description */}
            <p className="text-gray-600 mb-6">
              We're sorry, but something unexpected happened. 
              Please try refreshing the page or contact support if the problem persists.
            </p>

            {/* Error ID (for support reference) */}
            {eventId && (
              <p className="text-sm text-gray-400 mb-6">
                Error ID: <code className="bg-gray-100 px-2 py-1 rounded">{eventId}</code>
              </p>
            )}

            {/* Error Details (development only) */}
            {process.env.NODE_ENV === 'development' && error && (
              <details className="mb-6 text-left bg-gray-50 p-4 rounded-lg">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
                  Technical Details
                </summary>
                <pre className="text-xs text-red-600 overflow-auto max-h-40 whitespace-pre-wrap">
                  {error.toString()}
                  {'\n\n'}
                  {error.stack}
                </pre>
              </details>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={this.handleRefresh}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Refresh Page
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Go to Home
              </button>

              <button
                onClick={this.handleReportError}
                className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors text-sm"
              >
                Report this issue
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Hook wrapper for functional components that need error boundary behavior
 * Note: This doesn't catch errors in event handlers, only render errors
 */
export function withErrorBoundary(WrappedComponent, fallback = null) {
  return function ErrorBoundaryWrapper(props) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

export default ErrorBoundary;
