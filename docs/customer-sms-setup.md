# Customer SMS configuration

Customer delivery remains disabled until the operator approves the sender, campaign/use case and tenant consent process. Existing phone numbers and notification preferences never constitute SMS consent.

Keep these Functions values until that review is complete:

```ini
RL_SMS_ENABLED=false
RL_SMS_LIVE_APPROVED=false
RL_SMS_SECRETS_CONFIGURED=false
```

The dedicated Firebase Secret Manager names are:

- `RL_TWILIO_ACCOUNT_SID`
- `RL_TWILIO_AUTH_TOKEN` — the primary Twilio Auth Token used for webhook validation.
- `RL_TWILIO_MESSAGING_SERVICE_SID`

Enter credentials through Secret Manager, never a committed environment file, chat or client build. No sender, campaign, credential or consent from Merxus or mi Factotum is adopted automatically. The reference MF Functions source did not contain a Twilio implementation. Actual Workside account/service eligibility remains an operator/provider check.

## Provider and tenant approval

Use a Messaging Service and sender approved for the Route Logistics service-message use case and applicable business/tenant registration. Configure Advanced Opt-Out and its approved STOP, START and HELP responses. Configure the incoming-message webhook as form-encoded HTTP POST:

`https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsInbound`

The worker supplies each message's status callback automatically:

`https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsStatus?id=<outbox-id>`

Twilio signs the exact URL including that query parameter. Do not replace it with a browser route, redirect or different hostname. The backend uses the official Twilio validator and checks the account and incoming Messaging Service.

After external registration and consent review, an authorized operator records a private `rlSmsSenderApprovals/{companyId}` document containing:

- `status: "approved"`
- `messagingServiceSid`: the exact approved service matching the Secret Manager configuration.
- `automationApproved: true` only after separate approval for scheduled/job-triggered service messages.
- Operator approval identity, date and registration references for the operational audit.

Staff and company settings cannot write this collection or approve their own provider registration. Owner settings can prepare templates, purpose choices, reminder timing and the company time zone. They cannot override the global delivery gates.

Only after credentials and approved metadata exist should `RL_SMS_SECRETS_CONFIGURED=true` bind the provider secrets during an RL-only deployment. Keep that binding enabled when temporarily disabling delivery so signed opt-out/status callbacks continue to work. Live delivery still requires both global flags to be explicitly enabled, company messaging enabled, matching sender approval and valid purpose-specific consent. Automation additionally requires its separate tenant approval.

## Consent and delivery behavior

Customer Details provides purpose-specific consent, the exact disclosure, source, evidence reference and server recording timestamp. The optional follow-up purpose starts disabled. No migration or import grants consent.

STOP suppresses the phone and invalidates queued consent versions. Staff cannot override it. START restores only an existing STOP-suspended consent's previous purposes; it never grants new purposes or reverses an independently revoked preference. Shared phones associated with multiple companies remain blocked for operator review. HELP and opt-out acknowledgements come from Advanced Opt-Out; RL returns empty TwiML to avoid sending duplicate replies.

Messages contain company identity, a validated appointment date/time where applicable and STOP/HELP instructions. Customer names, addresses, job notes, account credentials and financial fields are not interpolated. Templates reject unsupported placeholders and sensitive/account/financial content.

Queue entries are deduplicated by job, purpose and appointment version. Consent, current customer phone, active sender membership, registration, job state and appointment changes are checked again immediately before dispatch. Limits are 50 queued messages per company/day and five per phone/day; these are safeguards, not a bulk-send authorization.

Provider `429` rejection can retry up to five attempts. A lost/ambiguous create response is marked `uncertain` and never blindly resent; its signed per-message callback may resolve it. Provider acceptance is distinct from `delivered`. Permanent rejection, opt-out, expired work and changed consent are visible in customer message history and private audit records.

## Verification performed without real SMS

Automated tests use synthetic credentials, stub transports and the local `demo-routelogistics` emulator. They cover disabled gates, current role/tenant checks, scoped consent, STOP/START/HELP, shared-number ambiguity, queue deduplication, schedule changes, provider opt-out, rate-limit retry, ambiguous acceptance and signed status reconciliation. No Twilio campaign registration or customer text is performed by these tests.

Primary provider references: [webhook security](https://www.twilio.com/docs/usage/security), [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out), [delivery-status callbacks](https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks).
