# Legacy mi Factotum retirement

As of November 14, 2026, mi Factotum is retired and its restored source is reference material. Route Logistics is the active application in Firebase project `mi-factotum-field-service`. The project name is retained and does not imply an active legacy dependency.

## Retirement inventory

The inventory found 29 independent legacy Gen2 functions and 83 Route Logistics functions, all in `us-central1`, with no Gen1 functions or unreachable regions. A scan of Route Logistics functions, web and mobile source found no references to the 29 legacy endpoint names. The retirement scope includes all 29 legacy functions, their backing Cloud Run services, four legacy Firestore/Eventarc triggers, and four legacy schedules.

| Purpose | Legacy functions |
| --- | --- |
| QuickBooks OAuth and connection management | `initiateQuickBooksOAuth`, `handleQuickBooksOAuthCallback`, `disconnectQuickBooks`, `getQuickBooksConnectionStatus` |
| QuickBooks imports, exports and webhook processing | `syncCustomerToQuickBooks`, `syncServicesToQuickBooks`, `quickbooksWebhook`, `scheduledCustomerSync` |
| Shared-document triggers | `createCustomerProfileOnSignup` on `users/{userId}`; `onJobAssignment` and `syncJobToCustomerPortal` on `jobs/{jobId}`; `syncInvoiceToCustomerPortal` on `invoices/{invoiceId}` |
| Scheduled maintenance and generation | `generateRecurringJobs`, `cleanupExpiredJobPhotos`, `cleanupOldLocations` |
| Manual profile backfill | `syncCustomersToProfiles` |
| Legacy Stripe endpoints | `createPaymentIntent`, `stripeWebhook` |
| Legacy account/team endpoints | `acceptInvitation`, `claimCompanyOwnership`, `createCompanyInvitation`, `deleteUserAccount`, `verifyInvitationCode` |
| Legacy portal/email/push/support endpoints | `requestCustomerOTP`, `verifyCustomerOTP`, `sendInvitationEmail`, `sendInvoiceEmail`, `sendPushNotification`, `submitSupportRequest` |

The four paused jobs are `firebase-schedule-<function>-us-central1` for `scheduledCustomerSync`, `generateRecurringJobs`, `cleanupExpiredJobPhotos` and `cleanupOldLocations`. They must remain paused. Pausing alone does not remove HTTP endpoints or Firestore triggers, which is why the associated functions are retired as well.

The old customer scheduler exported pending customers, and the old QuickBooks webhook imported customers by realm. The old Firestore triggers could create legacy portal records or send email/push notifications on shared documents. The old Stripe webhook was another external execution path. None is needed by the active Route Logistics app.

The initial 16-function retirement was verified at `2026-11-14T17:06:39.713Z`: all 16 functions and backing services were absent, all four event triggers were absent, and the four schedules were paused. Final verification at `2026-11-14T17:08:32.135Z` confirmed all 29 legacy functions absent, the remaining 13 backing services absent, and all four schedules still paused. Sanitized operator evidence is retained in ignored `.migration/legacy-retirement-initial-verification.json` and `.migration/legacy-retirement-verification.json`; raw source archives and credentials are not included in documentation.

## Shared infrastructure retained

- Firebase project `mi-factotum-field-service`, Firestore data/rules/indexes, Firebase Authentication, Storage and client Firebase configuration.
- All Route Logistics functions, web/mobile apps, hosting, email, Maps, Stripe and QuickBooks infrastructure.
- Existing Acme tenant, legitimate memberships, customers, invoices, and Route Logistics sandbox OAuth connection.
- Secret Manager secrets and shared runtime service account `1030013411579-compute@developer.gserviceaccount.com`, including its required IAM. Revoking this shared identity would also break Route Logistics.
- Historical legacy records and credentials. Their existence does not authorize restarting retired functions. No OAuth revocation is needed to retire the execution paths.

Names containing `mi-factotum` are not a deletion criterion. Retirement does not require application-data deletion, client-key replacement, secret deletion or creating another Firebase project.

## Ongoing operation

Use the existing `main` branch and existing Firebase project. The repository's `firebase.json` declares only codebase `routelogistics`. Deploy only affected Route Logistics functions, for example:

```powershell
npx firebase deploy --only functions:routelogistics --project mi-factotum-field-service --non-interactive
```

Do not deploy the restored mi Factotum source, resume its paused jobs, or recreate its webhooks/OAuth endpoints. No compatibility service or legacy synchronization is required by Route Logistics. Preserve historical migration reports as records of earlier conditions; previous requirements to preserve active legacy processing are superseded by the retirement decision.

QuickBooks certification uses only `Sandbox Company_US_1`, realm `9341455727000797`, for Acme tenant `z7DJMjeigjG64YfN4H5h`. Synthetic writes remain scoped to that verified sandbox. Keep public accounting exports disabled and `RL_QB_PRODUCTION_APPROVED=false`; disable temporary process-local write capability after testing. See [QuickBooks sandbox certification](quickbooks-sandbox-certification.md) for actual provider results and remaining acceptance items.
