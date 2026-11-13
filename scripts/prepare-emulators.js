const fs = require('node:fs');
const path = require('node:path');
// Dummy local-only values. Firebase CLI excludes these files from deployed configuration.
for (const [name, content] of Object.entries({
  '.env.local': 'RL_APP_URL=http://localhost:3000\nRL_EMAIL_FROM=emulator@example.invalid\n',
  '.secret.local': 'RL_SMTP_URL=smtp://localhost:2525\n',
})) {
  const file = path.resolve(__dirname, '../functions', name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, content, { flag: 'wx' });
}
