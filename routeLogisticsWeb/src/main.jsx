import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import * as Sentry from '@sentry/react'
import { initializeMonitoring, scrubErrorEvent } from './services/monitoring'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: scrubErrorEvent,
  });
}
initializeMonitoring();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p style={{ padding: 24 }}>Something went wrong. Please refresh the page.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
