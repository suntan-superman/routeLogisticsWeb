# RouteLogistics deployment

Updated November 12, 2026. Use the existing main branch, Netlify/GitHub web deployment, Firebase project, and Mac/Xcode mobile workflow. No staging environment or additional branch is required. See [migration progress](migration-progress.md) for the actual deployment record and unfinished work.

## Validate the source

Use Node 22 and Java 21. From the repository root:

```powershell
npm ci
npm --prefix functions ci
npm test
npm run test:e2e
```

In `routeLogisticsWeb`, run `npm ci --legacy-peer-deps`, `npm run lint`, and `npm run build`. In `routeLogisticsMobile`, run `npm ci`, `npx expo install --check`, and `npx expo export --platform ios --platform android --max-workers 2`.

The emulator script creates ignored local configuration when absent. It uses the demo project, not production. Do not commit `.env.*`, `.secret.local`, migration reports, or deployment logs. `.env.example` files contain only placeholders.

## Firebase backend

The shared project is `mi-factotum-field-service`. MF uses the default function codebase; RL uses `routelogistics`. Always scope function deployment to RL:

```powershell
npx firebase deploy --only functions:routelogistics --project mi-factotum-field-service --non-interactive
npx firebase deploy --only firestore:rules,firestore:indexes,storage --project mi-factotum-field-service --non-interactive
```

Do not use an unscoped `--only functions` or force removal of legacy indexes. Rules are shared project-wide; the rules in this repository implement RL tenancy. Existing staff sessions should sign in/refresh claims after deployment to obtain the new `membershipId` claim. Wait for required composite indexes to become ready before considering query-dependent workflows verified.

Configure non-secret values in ignored `functions/.env.mi-factotum-field-service`:

```dotenv
RL_APP_URL=https://route-logistics.app
RL_EMAIL_FROM=
RL_EMAIL_ENABLED=false
```

The origin above is the existing web package homepage. Use the actual canonical origin when configuring another deployment. Email is intentionally disabled. Owners can copy invitation links; OTP portal sign-in and invoice emails return an unavailable message. Firebase Auth verification emails use Firebase's separate configuration.

To enable SMTP later, configure `RL_SMTP_URL` in Firebase Secret Manager, use a verified sender for `RL_EMAIL_FROM`, set `RL_EMAIL_ENABLED=true`, and redeploy the RL codebase. The worker binds the secret only for enabled deployments. Use an authenticated TLS-capable SMTP connection URL and keep credentials out of source control/chat. Verify delivery with a controlled recipient and check portal custom-token signing permissions before enabling customer use. The runtime identity may need permission to sign tokens through IAM.

The new server-owned collections are `rlInviteSecrets`, `rlMail`, `rlRateLimits`, `rlPortalChallenges`, `rlNotifications`, `rlOwnershipAudit`, and `rlMigrationRuns`. Clients cannot read secrets/outbox/challenges/audits; notification access is restricted to the recipient. TTL cleanup policies are not automatically provisioned by this deployment; see the retention notes in the progress report.

## Web publication

`netlify.toml` preserves the existing build configuration: Node 22, base directory `routeLogisticsWeb`, `npm run build`, output `dist`, and SPA redirects. Pushing the existing branch to GitHub triggers the user's configured web deployment. Deploy compatible backend/rules/index changes before publishing a frontend that calls them.

Keep the existing `VITE_FIREBASE_*` values in the hosting environment. Sentry and Firebase Performance are optional; `VITE_FIREBASE_PERFORMANCE_ENABLED=true` opts into Performance collection. Verify sign-in, invitation routing, customer list/import, jobs, photos, and public privacy/portal routes on the published build. Build success alone does not establish a successful hosting deployment.

## Mobile on the Mac

Keep `com.workside.routelogistics` for both application identifiers and the existing Expo project. Install from `routeLogisticsMobile/package-lock.json`. The Expo config now includes image-picker permissions and datetime-picker native configuration.

If native folders are generated through Expo, apply the current config with the existing prebuild workflow before opening the generated iOS workspace in Xcode. Do not use `--clean` on a native project with uncommitted manual changes. Select the existing signing team, build, and run on a device; manage App Store submission through the existing workflow.

Validate real email verification, company claims, role restrictions, camera/library permissions, compressed uploads, airplane-mode behavior, and notification delivery. Both platform JavaScript bundles are checked in CI, but this run does not produce a signed native binary. Expo SDK major upgrades and remaining mobile dependency findings are tracked in the progress report.

## Recovery and verification

Migration originals are recorded transactionally under the migration run listed in the progress report. Review later edits before restoring a document. Source rollback should deploy a compatible combination of frontend, functions, and rules; reverting only the web app may restore obsolete invitation behavior. No automated production data restore is included.

Check the Functions deployment exit status, all function states, scheduled-job states, index readiness, and the GitHub/hosting deployment result. Perform read-only or controlled-account smoke checks; do not use customer records as disposable test data.
