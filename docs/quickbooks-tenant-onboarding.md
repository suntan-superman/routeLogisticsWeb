# QuickBooks tenant onboarding and sandbox verification

Route Logistics uses one dedicated Intuit application's platform credentials. A customer company does not need an Intuit developer application or Google Secret Manager secrets. Its current Route Logistics owner independently authorizes its QuickBooks company from **Integrations → Connect QuickBooks**. Reconnect and disconnect use the same owner portal.

## Current deployment configuration

Firebase project: `mi-factotum-field-service`, Functions codebase: `routelogistics`.

```ini
RL_QB_ENABLED=true
RL_QB_ENV=sandbox
RL_QB_CREDENTIAL_ENV=sandbox
RL_QB_WRITES_ENABLED=false
RL_QB_PRODUCTION_APPROVED=false
RL_QB_REDIRECT_URI=https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlQuickBooksOAuthCallback
```

`RL_QB_CREDENTIAL_ENV` is a non-secret declaration of which Intuit credential environment the platform uses. Both environment settings must agree. OAuth also makes a read-only CompanyInfo request to the selected environment and authorized realm before saving a connection. `CompanyInfo.Id` is an entity identifier, not the realm ID ([Intuit API reference](https://developer.intuit.com/docs/api/accounting/CompanyInfo)).

The existing platform secrets are `RL_QB_CLIENT_ID`, `RL_QB_CLIENT_SECRET`, and `RL_QB_WEBHOOK_VERIFIER`. Their runtime access remains secret-scoped. The status function binds only the Client ID to detect a changed application identity; OAuth/API functions bind Client ID and Client Secret; the webhook binds only its verifier. No secret payload is returned to the browser.

OAuth callback:
`https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlQuickBooksOAuthCallback`

Webhook:
`https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlQuickBooksWebhook`

The callback must be in the dedicated Intuit application's **Development Redirect URIs**. The operator confirmed that registration during sandbox activation. Intuit dashboard settings are not independently readable with the available deployment tools. Configure development webhook notifications for Customer, Item, Invoice and Payment. Customer/Item notifications are recorded for review; Invoice/Payment notifications trigger inbound balance reconciliation. No accounting records are exported while writes are disabled.

## Isolation and lifecycle guarantees

- Connection/token storage is private to server code and keyed by Route Logistics company and accounting environment. Realm routing additionally prevents a QuickBooks realm already assigned to one company from being attached to another company.
- OAuth state is random, hashed at rest, short-lived, single-use, and tied to the actual company owner, environment, platform Client ID and latest authorization attempt. The callback rechecks ownership and the connection attempt after the provider response.
- Refresh tokens rotate under a transactional lease. A concurrent request gets an actionable retry response. Refresh completion cannot overwrite a disconnected or replaced connection. Revoked grants require owner reauthorization.
- Disconnect removes locally usable tokens immediately, preserves mappings/audits, cancels earlier OAuth attempts, and briefly blocks reconnect while provider revocation is in flight. A provider revocation failure is reported without restoring local access.
- Customer, service-item and invoice mappings include company, environment and realm. Inbound payment links are separately stored in private `rlQbPaymentMappings` records with the same scope. This does not implement outbound payment export.
- Webhooks verify the HMAC against the raw request body before reading routing data. Tenant resolution uses the private realm registry, never a payload-supplied Route Logistics company ID. Events retain their connection version; stale events are superseded after disconnect/reconnect. Duplicate notifications and invoice reconciliation are idempotent.
- Sandbox payment reconciliation updates `qbTestPaymentStatus`; it does not set an actual invoice's status to paid. Connecting a different QuickBooks realm when saved mappings exist requires a reviewed mapping migration; reconnecting the original realm preserves them.
- The owner portal shows safe errors, refresh/reconnect guidance and revocation warnings. In-flight responses and redirects are discarded when the signed-in identity, company, membership or role changes.

## Accounting defaults

The company owner selects **Default income account** and **Default service item** from searchable dropdowns under Integrations. `rlQuickBooksOptions` performs read-only, paginated queries against that tenant's current QuickBooks realm: active Income/Other Income accounts and active Service items. The form displays qualified names, account types/numbers and service descriptions, keeping QuickBooks IDs internal. Existing `incomeAccountId` and `defaultItemId` fields remain compatible with saved mappings; saving revalidates both provider records, actual company ownership and the connection version before changing only Route Logistics preferences.

Options refresh on connect/reconnect or **Refresh available options**. Valid saved selections remain selected; missing/inactive selections need explicit owner replacement. Provider errors retain selections and offer retry/reconnect guidance. If no service items exist, the form says: **Create a service item in QuickBooks, then choose Refresh available options.** There is no automatic account or item creation. Saving defaults does not enable accounting exports.

The real Sandbox Company_US_1 lookup returned **22 active income accounts and 31 active service items** using two GET requests. Its connection document was unchanged; no defaults or QuickBooks records were modified during validation. Loading options requires the company owner; other authorized integration viewers see stored display names without controls to change defaults.

## Verification and remaining acceptance

Run the targeted suite from the repository root:

```powershell
npx firebase emulators:exec --only firestore --project demo-routelogistics "node --test --test-concurrency=1 tests/quickbooks.integration.test.js tests/quickbooks.tenancy.integration.test.js tests/quickbooks.options.integration.test.js tests/quickbooks.rules.test.js"
npm run test:web
npm run test:functions
```

The emulator tests use synthetic tenants and a controlled Intuit transport. They cover tenant denial, private rules, shared credentials, owner lifecycle, concurrent refresh, malformed/provider-rejected company metadata, environment mismatch, webhook routing, stale callbacks/events and payment isolation. They do not authorize a real Intuit account or export records.

Validation on November 14, 2026: all 49 targeted emulator/rules tests and all 83 web tests passed. Functions unit tests passed 55 tests; the native push emulator case was skipped without its emulator. The web production build and focused Integrations page ESLint check passed. Secret metadata confirmed enabled versions and the existing runtime's secret-scoped accessor grants for all three shared secrets, without retrieving their values.

The first real sandbox owner test connected, disconnected and reconnected Sandbox Company_US_1. Investigation found that a successful HTTP 200 revocation with an empty body was incorrectly parsed as JSON, generating an unconfirmed-revocation warning and a temporary reconnect safety lease. Revocation now relies on the successful HTTP status without parsing its body; token exchange and accounting responses still require JSON. Private `oauth.revocation` audit entries retain only outcome, HTTP status, failure category and duration, with tenant/environment/connection identifiers; no provider response, authorization header or token is recorded. Historical outbound status was not logged, so the exact original Intuit response cannot be proven retrospectively.

The owner portal automatically refreshes a temporary reconnect wait using the server-provided remaining lease duration, cancels that timer when tenant access changes, and displays a revocation warning once. Empty-body success, actual timeout, local token invalidation, immediate reconnect after success, and tenant/unmount timer cancellation have regression coverage. A real second-company independence check and genuine signed Intuit notification remain outstanding.

Before calling sandbox onboarding accepted, use an authorized Route Logistics owner to connect **Sandbox Company_US_1**, confirm its company name in Integrations, disconnect and reconnect, and confirm a second independent sandbox company's connection remains unaffected. Confirm Intuit's development webhook configuration and a genuine signed sandbox notification. These browser consent/provider checks require the operator's Intuit session; deployment checks and emulator tests cannot replace them. Keep accounting writes and production approval disabled throughout.
