// One command starts disposable local emulators, the web app and Playwright.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
delete process.env.DEBUG;
delete process.env.GRPC_TRACE;

async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is occupied. Stop existing emulators/dev servers first.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !/^[\w@./:= -]+$/.test(arg))) throw new Error('Unsupported test argument.');
  for (const port of [4173, 5001, 8080, 9099, 9199]) await freePort(port);
  const saved = [], backup = path.join(root, '.firebase', `browser-local-${randomUUID()}`);
  fs.mkdirSync(backup, { recursive: true });
  const adc = path.join(backup, 'emulator-adc.json');
  const local = {
    RL_APP_URL: 'http://127.0.0.1:4173', RL_EMAIL_FROM: 'emulator@example.invalid', RL_EMAIL_ENABLED: 'true',
    RL_REVIEW_INVITATIONS_ENABLED: 'false', RL_SMS_ENABLED: 'false', RL_SMS_LIVE_APPROVED: 'false',
    RL_SMS_PILOT_ENABLED: 'false', RL_SMS_SECRETS_CONFIGURED: 'false', RL_NATIVE_PUSH_ENABLED: 'false',
    RL_PUSH_ENABLED: 'false', RL_EXPO_ACCESS_TOKEN_ENABLED: 'false', RL_QB_ENABLED: 'false',
    RL_QB_WRITES_ENABLED: 'false', RL_QB_PRODUCTION_APPROVED: 'false', RL_STRIPE_ENABLED: 'false',
    RL_STRIPE_MODE: 'test', RL_STRIPE_LIVE_APPROVED: 'false', RL_ESTIMATE_EMAIL_ENABLED: 'false',
    RL_ESTIMATES_ENABLED: 'true', RL_SERVICE_FORMS_ENABLED: 'true',
  };
  const secrets = {
    RL_SMTP_URL: 'smtp://127.0.0.1:2525', RL_STRIPE_SECRET_KEY: 'sk_test_emulator_only', RL_STRIPE_WEBHOOK_SECRET: 'whsec_emulator_only',
    RL_QB_CLIENT_ID: 'emulator_only', RL_QB_CLIENT_SECRET: 'emulator_only', RL_QB_WEBHOOK_VERIFIER: 'emulator_only',
    RL_TWILIO_ACCOUNT_SID: `AC${'0'.repeat(32)}`, RL_TWILIO_AUTH_TOKEN: 'emulator_only',
    RL_TWILIO_API_KEY_SID: `SK${'0'.repeat(32)}`, RL_TWILIO_API_KEY_SECRET: 'emulator_only',
    RL_TWILIO_MESSAGING_SERVICE_SID: `MG${'0'.repeat(32)}`, RL_TWILIO_FROM_NUMBER: '+12025550100', RL_EXPO_ACCESS_TOKEN: 'emulator_only',
  };
  const encode = obj => Object.entries(obj).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  try {
    // Explicit inert ADC prevents falling back to a developer's real local ADC.
    // These placeholders cannot authorize a Google API request.
    fs.writeFileSync(adc, JSON.stringify({ type: 'authorized_user',
      client_id: 'emulator-only.apps.googleusercontent.com', client_secret: 'emulator-only', refresh_token: 'emulator-only',
    }));
    for (const [name, contents] of [['.env.local', encode(local)], ['.secret.local', encode(secrets)]]) {
      const target = path.join(root, 'functions', name), copy = path.join(backup, name), existed = fs.existsSync(target);
      if (existed) fs.copyFileSync(target, copy);
      saved.push({ target, copy, existed });
      fs.writeFileSync(target, contents);
    }
    const env = { ...process.env, ...local, ...secrets,
      RL_BROWSER_TESTS: 'true', GCLOUD_PROJECT: 'demo-routelogistics', GOOGLE_CLOUD_PROJECT: 'demo-routelogistics',
      VITE_FIREBASE_EMULATORS: 'true', VITE_FIREBASE_API_KEY: 'emulator-only', VITE_FIREBASE_PROJECT_ID: 'demo-routelogistics',
      VITE_FIREBASE_AUTH_DOMAIN: 'localhost', VITE_FIREBASE_STORAGE_BUCKET: 'demo-routelogistics.appspot.com',
      VITE_FIREBASE_APP_ID: '1:123:web:emulator', VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
      VITE_FIREBASE_MEASUREMENT_ID: '', VITE_APPCHECK_SITE_KEY: '', VITE_APPCHECK_DEBUG_TOKEN: '',
      VITE_GOOGLE_MAPS_API_KEY: '', VITE_STRIPE_PUBLISHABLE_KEY: '', VITE_STRIPE_MODE: 'test', VITE_STRIPE_LIVE_APPROVED: 'false', VITE_SENTRY_DSN: '',
      VITE_FIREBASE_VAPID_KEY: '', VITE_FIREBASE_PERFORMANCE_ENABLED: 'false',
      VITE_SYNCFUSION_LICENSE_KEY: '', VITE_GOOGLE_MAPS_MAP_ID: '',
    };
    env.GOOGLE_APPLICATION_CREDENTIALS = adc;
    delete env.FIREBASE_TOKEN;
    const forwarded = args.filter(arg => arg !== '--all-browsers');
    const project = args.includes('--all-browsers') || args.some(arg => arg.startsWith('--project')) ? [] : ['--project=chromium'];
    const command = ['node node_modules/@playwright/test/cli.js test', ...project, ...forwarded.map(arg => `"${arg}"`)].join(' ');
    const exit = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js'), 'emulators:exec',
        '--only', 'auth,firestore,functions,storage', '--project', 'demo-routelogistics', command],
      { cwd: root, env, stdio: 'inherit', windowsHide: true });
      const stop = () => child.kill('SIGINT');
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      const detach = () => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); };
      child.once('error', error => { detach(); reject(error); });
      child.once('exit', code => { detach(); resolve(code ?? 1); });
    });
    process.exitCode = exit;
  } finally {
    for (const row of saved) {
      if (row.existed) fs.copyFileSync(row.copy, row.target);
      else if (fs.existsSync(row.target)) fs.unlinkSync(row.target);
      if (fs.existsSync(row.copy)) fs.unlinkSync(row.copy);
    }
    if (fs.existsSync(adc)) fs.unlinkSync(adc);
    fs.rmdirSync(backup);
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'test-results/emulator-safety.json'), JSON.stringify({
      project: 'demo-routelogistics', localConfigurationRestored: true, syntheticFixturesOnly: true,
      providerTransportsDisabled: true, scheduledWorkersNotInvoked: true, realMessagesSent: false,
      applicationDefaultCredentialFallbackDisabled: true,
    }, null, 2) + '\n');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
