import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

const emulatorBuild = process.env.VITE_FIREBASE_EMULATORS === 'true';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...(emulatorBuild ? [{
    // The local-only CSP intentionally blocks Google Fonts. A failed vendor
    // @import also rejects Vite's lazy calendar CSS preload. Use the existing
    // fallback font in acceptance tests without allowing external requests.
    name: 'emulator-local-fonts', enforce: 'pre',
    transform(source, id) {
      if (/\.css(?:$|\?)/.test(id)) return source.replace(/@import\s+url\(\s*['"]?https:\/\/fonts\.googleapis\.com\/[^)]*\)\s*;/g, '');
    },
  }] : [])],
  // One pure JavaScript policy is shared by Functions, Metro and the web app.
  optimizeDeps: { include: ['../functions/shared/jobExceptions.js'] },
  build: { commonjsOptions: { include: [/node_modules/, /functions[\\/]shared[\\/]jobExceptions\.js$/] } },
  // Browser acceptance only: native CSP blocks external traffic without
  // intercepting/replaying Firestore streams in WebKit. Netlify never uses preview.
  ...(emulatorBuild ? {
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
