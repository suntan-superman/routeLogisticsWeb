// Credentials are read from process environment only and are never printed.
// Default mode verifies SMTP authentication/TLS without sending a message.
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { validEmail } = require('../functions/security');
async function main() {
  const smtp = process.env.RL_SMTP_URL, from = process.env.RL_EMAIL_FROM;
  if (!smtp || !validEmail(from)) throw new Error('Configure RL_SMTP_URL and a verified RL_EMAIL_FROM in the process environment first.');
  const recipientIndex = process.argv.indexOf('--send-to'), recipient = recipientIndex < 0 ? null : process.argv[recipientIndex + 1];
  if (recipientIndex >= 0 && !validEmail(recipient)) throw new Error('Provide one controlled test recipient after --send-to.');
  const transport = req('nodemailer').createTransport({ url: smtp, requireTLS: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000, disableFileAccess: true, disableUrlAccess: true });
  try {
    await transport.verify(); console.log('SMTP authentication and TLS verification passed.');
    if (recipient) { const sent = await transport.sendMail({ from, to: recipient, subject: 'Route Logistics delivery verification', text: 'This controlled message verifies Route Logistics transactional email delivery. Confirm receipt before enabling invitation or customer portal emails.' }); if (!sent.accepted?.length) throw new Error('Controlled recipient was not accepted.'); console.log('Controlled test message accepted. Confirm inbox receipt and sender authentication before enabling email.'); }
    else console.log('No message sent. Run with --send-to CONTROLLED_ADDRESS to verify delivery.');
  } finally { transport.close(); }
}
main().catch((error) => { console.error('Email verification failed:', ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(error.code) ? error.code : 'Missing configuration or delivery not confirmed.'); process.exitCode = 1; });
