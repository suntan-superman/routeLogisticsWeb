# Customer SMS configuration

Automated customer delivery remains disabled. Existing phone numbers and notification preferences never constitute SMS consent. The narrowly authorized operator delivery test is separate from customer automation.

Keep these outbound Functions gates disabled during the controlled test:

```ini
RL_SMS_ENABLED=false
RL_SMS_LIVE_APPROVED=false
```

The existing approved toll-free sender can be used directly without a Messaging Service. The controlled reuse configuration is:

```ini
RL_TWILIO_SENDER_MODE=phone-number
RL_TWILIO_API_KEY_ENABLED=true
RL_SMS_SECRETS_CONFIGURED=true
```

The dedicated Firebase Secret Manager names for that path are:

- `RL_TWILIO_ACCOUNT_SID`
- `RL_TWILIO_AUTH_TOKEN` — server-only callback signature validation.
- `RL_TWILIO_FROM_NUMBER` — the existing approved sender.
- `RL_TWILIO_API_KEY_SID` and `RL_TWILIO_API_KEY_SECRET` — application-specific send-only credentials.

`RL_TWILIO_MESSAGING_SERVICE_SID` is required only for `senderMode: messaging-service`; none is needed or created for this direct-From configuration.

Enter credentials through Secret Manager, never a committed environment file, chat or client build. A sender, campaign or customer consent from Merxus does not automatically authorize Route Logistics messaging.

## November 14 working-infrastructure investigation

The initial activation inspection examined Messaging Services but did not trace actual successful message records or toll-free verification. Its conclusion that the rejected CUSTOMER_CARE campaign blocked all existing infrastructure was incomplete. That historical campaign is not representative of the currently working paths.

Actual Twilio API records and number verification metadata establish:

| Existing sender | Account and transport | Carrier-delivery evidence | Verification |
| --- | --- | --- | --- |
| `+18889494776` | Workside Home Advisor subaccount; direct `From`, no Messaging Service | 84 delivered messages in the 100-record sample; seven in the last seven days; latest November 11 Pacific | `TWILIO_APPROVED`, Workside Software LLC; provider lead/service-request notifications |
| `+18882506769` | Existing primary Workside account; direct `From`, no Messaging Service | 52 delivered messages in the 100-record sample; latest August 25 Pacific | `TWILIO_APPROVED`, Workside Software LLC; account notifications/customer care including service providers, appointment confirmations and service notifications |
| `+12134661363` | Primary account; direct `From`, no Messaging Service | Five delivered messages in the sample; latest November 13 Pacific, including recent `outbound-reply` traffic | No approved associated Messaging Service established by this investigation; not selected for the RL test |

These are bounded samples, not complete historical counts. `delivered` is distinguished from merely `accepted`, `queued` or `sent`. No message bodies or recipient numbers are included in the operational report. The toll-free paths do not depend on the old failed 10DLC campaign, and absence of a Messaging Service does not mean absence of successful SMS.

The primary toll-free number `+18882506769` is selected for the single explicitly authorized RL delivery test because its approved use-case summary includes the applicable service-message categories. The legacy toll-free registration is focused on provider lead notifications and is not treated as interchangeable merely because its messages are delivered. No new Twilio account, number purchase or campaign submission is needed for this controlled test.

RL uses its own restricted key with message-create permission for outbound requests. The existing account Auth Token remains server-only for Twilio callback signature validation and retains account-wide authority; this is not a claim of independent Twilio-account isolation. Existing authenticated server role checks, exact sender binding, private outbox and per-message callbacks constrain the RL workflow. No Merxus credential, sender, inbound URL or deployment is changed.

Controlled RL test status: **passed** on November 14, 2026 at 10:30 AM Pacific. Exactly one message-create request used the RL-specific restricted key and `+18882506769`. Twilio reported `delivered` with no error, and genuine signed `sent`/`delivered` callbacks reconciled the private RL outbox to `delivered` with the matching provider message ID. The authorized recipient confirmed receipt. The test used the existing RL template renderer and delivery transport, with an operator certification outbox record; it did not create or modify any customer or job, grant permanent customer consent, or enable scheduled delivery. Both global outbound gates remain false.

The deployed STOP/START correction preserves an independently revoked consent: STOP may suspend a current grant, but a later START cannot restore a grant that staff or the customer had separately revoked. Regression tests cover grant → revoke → STOP → START and confirm sending remains blocked.

## Provider and tenant approval

Select an approved Messaging Service or an explicitly approved direct sender. A production tenant's provider approval must match the actual business/use case and consent flow. For an independently routed RL sender, the incoming-message webhook is form-encoded HTTP POST:

`https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsInbound`

Do not point the existing shared toll-free number's inbound webhook at RL: its current Merxus inbound route remains unchanged. The controlled shared-sender test uses RL's per-message status callback only. Before enabling customer automation on this shared sender, verify that the registered brand/use case and actual RL opt-in flow remain covered, and that STOP/START replies reach RL's consent/suppression handling without disrupting Merxus. Existing provider opt-out enforcement is preserved; live RL reply synchronization is not certified by this one outbound test.

The RL worker supplies each message's status callback automatically:

`https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsStatus?id=<outbox-id>`

Twilio signs the exact URL including that query parameter. Do not replace it with a browser route, redirect or different hostname. The backend uses the official Twilio validator and checks the account and configured sender mode: exact Messaging Service in service mode, or exact `To` sender in direct-number inbound mode. Status reconciliation checks the recorded recipient, provider message ID and direct sender.

After external registration and consent review, an authorized operator records a private `rlSmsSenderApprovals/{companyId}` document containing:

- `status: "approved"`
- `senderMode`: `messaging-service` or `phone-number`.
- `messagingServiceSid` for service mode, or `fromNumber` for direct-number mode: the exact approved sender matching the bound runtime configuration.
- `automationApproved: true` only after separate approval for scheduled/job-triggered service messages.
- Operator approval identity, date and registration references for the operational audit.

Staff and company settings cannot write this collection or approve their own provider registration. Owner settings can prepare templates, purpose choices, reminder timing and the company time zone. They cannot override the global delivery gates.

Only after credentials and reviewed sender metadata exist should `RL_SMS_SECRETS_CONFIGURED=true` bind the provider secrets during an RL-only deployment. Callback functions bind the signature Auth Token; the sending worker uses the RL-specific restricted key when `RL_TWILIO_API_KEY_ENABLED=true`. Keep callback bindings enabled when temporarily disabling outbound delivery. Public delivery still requires both global outbound gates, company messaging enabled, matching sender approval and valid purpose-specific consent. Automation additionally requires its separate tenant approval; it remains disabled throughout this operator test.

## Consent and delivery behavior

Customer Details provides purpose-specific consent, the exact disclosure, source, evidence reference and server recording timestamp. The optional follow-up purpose starts disabled. No migration or import grants consent.

STOP suppresses the phone and invalidates queued consent versions. Staff cannot override it. START restores only an existing STOP-suspended consent's previous purposes; it never grants new purposes or reverses an independently revoked preference. Shared phones associated with multiple companies remain blocked for operator review. HELP and opt-out acknowledgements come from Advanced Opt-Out; RL returns empty TwiML to avoid sending duplicate replies.

Messages contain company identity, a validated appointment date/time where applicable and STOP/HELP instructions. Customer names, addresses, job notes, account credentials and financial fields are not interpolated. Templates reject unsupported placeholders and sensitive/account/financial content.

Queue entries are deduplicated by job, purpose and appointment version. Consent, current customer phone, active sender membership, registration, job state and appointment changes are checked again immediately before dispatch. Limits are 50 queued messages per company/day and five per phone/day; these are safeguards, not a bulk-send authorization.

Provider `429` rejection can retry up to five attempts. A lost/ambiguous create response is marked `uncertain` and never blindly resent; its signed per-message callback may resolve it. Provider acceptance is distinct from `delivered`. Permanent rejection, opt-out, expired work and changed consent are visible in customer message history and private audit records.

## Verification performed without real SMS

Automated tests use synthetic credentials, stub transports and the local `demo-routelogistics` emulator. They cover disabled gates, current role/tenant checks, scoped consent, STOP/START/HELP, shared-number ambiguity, queue deduplication, schedule changes, provider opt-out, rate-limit retry, ambiguous acceptance and signed status reconciliation. No Twilio campaign registration or customer text is performed by these tests.

Primary provider references: [webhook security](https://www.twilio.com/docs/usage/security), [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out), [delivery-status callbacks](https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks).
