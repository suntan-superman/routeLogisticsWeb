import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // One pure JavaScript policy is shared by Functions, Metro and the web app.
  optimizeDeps: { include: ['../functions/shared/jobExceptions.js'] },
  build: { commonjsOptions: { include: [/node_modules/, /functions[\\/]shared[\\/]jobExceptions\.js$/] } },
  // Browser acceptance only: native CSP blocks external traffic without
  // intercepting/replaying Firestore streams in WebKit. Netlify never uses preview.
  ...(process.env.VITE_FIREBASE_EMULATORS === 'true' ? {
    preview: { headers: { 'Content-Security-Policy': [
      "default-src 'self' data: blob:",
      "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "frame-src 'self' http://127.0.0.1:* http://localhost:* data: blob:",
      "base-uri 'self'", "form-action 'self'",
    ].join('; ') } },
  } : {}),
})
