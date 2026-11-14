# Customer SMS configuration

Broad automated customer delivery remains disabled. Existing phone numbers and notification preferences never constitute SMS consent. The verified one-message delivery test is separate from the narrowly scoped pilot described below, which is prepared but inactive pending fresh provider opt-out acceptance.

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

The readiness correction separates provider suppression from RL consent completely: STOP suspends a current RL grant and invalidates queued consent versions; START never restores either a stopped or independently revoked RL grant. A fresh, independently evidenced RL consent grant is required after opt-out. Regression tests cover both stopped and separately revoked consent, stale/duplicate provider events and queued cancellation.

## Provider and tenant approval

Select an approved Messaging Service or an explicitly approved direct sender. A production tenant's provider approval must match the actual business/use case and consent flow. For an independently routed RL sender, the incoming-message webhook is form-encoded HTTP POST:

`https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsInbound`

Do not point the existing shared toll-free number's inbound webhook at RL: its current Merxus inbound route remains unchanged. The completed one-message delivery test used RL's per-message status callback only. The readiness implementation adds an independent Event Streams receiver instead of retargeting Merxus:

`https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsProviderEvents`

Use a dedicated RL webhook sink/subscription for `com.twilio.messaging.inbound-message.received`, schema version **8** (the handler supports the provider opt-out fields introduced in version 5). It uses the existing callback Account SID, From number and Auth Token bindings; no provider API polling or expanded send-key permissions are required. Validate Twilio's `X-Twilio-Signature` against the exact configured HTTPS destination, `bodySHA256` query parameter and untouched raw JSON through the official SDK. Never substitute the Host header, parsed form fields or reserialized JSON.

The receiver accepts batches, verifies account/receiving sender, and forwards only classified STOP/START events for known RL recipient bindings. It discards unrelated messages without retaining their body or creating another application's recipient records. START/UNSTOP are the only accepted toll-free unblock keywords; YES and SUBSCRIBE do not prove carrier re-opt-in. The transactional reducer deduplicates provider message IDs, orders by provider timestamps and keeps STOP on timestamp ties. Provider suppression spans RL tenants sharing the sender, while consent and message history remain tenant-specific. Event Streams delivery is asynchronous and may be duplicated or out of order; provider-side filtering remains the final delivery guard.

Fresh physical-handset STOP → START verification is **pending**. An emulator event, a self-signed probe or the earlier successful outbound message is not evidence that this new provider synchronization passed.

The RL worker supplies each message's status callback automatically:

`https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsStatus?id=<outbox-id>`

Twilio signs the exact URL including that query parameter. Do not replace it with a browser route, redirect or different hostname. The backend uses the official Twilio validator and checks the account and configured sender mode: exact Messaging Service in service mode, or exact `To` sender in direct-number inbound mode. Status reconciliation checks the recorded recipient, provider message ID and direct sender.

After external registration and consent review, an authorized operator records a private `rlSmsSenderApprovals/{companyId}` document containing:

- `status: "approved"`
- `senderMode`: `messaging-service` or `phone-number`.
- `messagingServiceSid` for service mode, or `fromNumber` for direct-number mode: the exact approved sender matching the bound runtime configuration.
- `automationApproved: true` only after separate approval for scheduled/job-triggered service messages.
- `pilotApproved: true` only for a separately approved private test pilot; this does not replace company-wide automation approval.
- Operator approval identity, date and registration references for the operational audit.

Staff and company settings cannot write this collection or approve their own provider registration. Owner settings can prepare templates, purpose choices, reminder timing and the company time zone. They cannot override the global delivery gates.

Only after credentials and reviewed sender metadata exist should `RL_SMS_SECRETS_CONFIGURED=true` bind the provider secrets during an RL-only deployment. Callback functions bind the signature Auth Token; the sending worker uses the RL-specific restricted key when `RL_TWILIO_API_KEY_ENABLED=true`. Keep callback bindings enabled when temporarily disabling outbound delivery. Broad delivery still requires both global outbound gates, company messaging enabled, matching sender approval and valid purpose-specific consent. Broad automation additionally requires its separate tenant approval; it remains disabled.

## Consent and delivery behavior

Customer Details provides purpose-specific consent, the exact disclosure, source, evidence reference and server recording timestamp. The optional follow-up purpose starts disabled. No migration or import grants consent.

STOP suppresses the phone, invalidates queued consent versions and immediately cancels pending queued messages. Staff cannot override it. START clears only a valid provider suppression state; it never grants or restores RL consent. Fresh RL consent independently requires the exact disclosure, selected purposes, source, evidence reference and server timestamp. Previously stopped/revoked consent remains blocked until that grant. Shared phones associated with multiple companies remain blocked for operator review. The shared sender's existing provider/Merxus acknowledgements are preserved; RL sends no duplicate reply.

Messages contain company identity, a validated appointment date/time where applicable and STOP/HELP instructions. Customer names, addresses, job notes, account credentials and financial fields are not interpolated. Templates reject unsupported placeholders and sensitive/account/financial content.

Queue entries are deduplicated by job, purpose and appointment version. Consent, current customer phone, active sender membership, registration, job state and appointment changes are checked again immediately before dispatch. Limits are 50 queued messages per company/day and five per phone/day; these are safeguards, not a bulk-send authorization.

Provider `429` rejection can retry up to five attempts. A lost/ambiguous create response is marked `uncertain` and never blindly resent; its signed per-message callback may resolve it. Provider acceptance is distinct from `delivered`. Permanent rejection, opt-out, expired work and changed consent are visible in customer message history and private audit records.

Both immediate provider rejection and a genuine signed asynchronous failure with error `21610` save provider-level suppression and cancel remaining queued messages for that phone. They do not retry an opted-out destination. Consent revocation/change also cancels queued work immediately, and dispatch still checks current consent, job and sender state before submitting anything. Queue cancellation does not erase delivery or tenant history.

## Prepared, recipient-only pilot

The owner explicitly approved appointment confirmations, pre-visit reminders, technician en-route notifications and service-completion messages for the previously authorized test number on November 14, 2026. That approval does not cover optional `service-follow-up` messages or any other customer.

The current private pilot is **prepared/inactive**. Dedicated customer `rl-sms-pilot-20261114` is an inactive synthetic record; the pre-existing 508 customer records remain intact. Initial purpose-specific consent is recorded separately from provider state. No fresh handset STOP/START result or active pilot approval is claimed.

Pilot runtime configuration can be deployed while all broad gates remain false:

```ini
RL_SMS_ENABLED=false
RL_SMS_LIVE_APPROVED=false
RL_SMS_PILOT_ENABLED=true
RL_SMS_PILOT_ID=operator-sms-pilot-20261114
```

`RL_SMS_PILOT_ENABLED=true` only enables evaluation of the private exception; it cannot activate a prepared document or grant consent. The operator-only `rlSmsPilots/{pilotId}` record must have `status: active`, `testOnly: true`, exact `companyId`/`customerId`/authorized `phoneHash`, positive `version`, all four approved purposes, `createdAt`, `expiresAt` no more than 24 hours later, `maxMessages` at most four, and a transactional `reservedMessages` counter. The customer must remain marked `isTestRecord: true` and `smsPilotOnly: true`, with its active phone matching the private binding. Queue and dispatch independently require valid RL consent collected after pilot preparation, a matching private sender approval with `pilotApproved: true`, and a genuine Event Streams START for that sender/recipient after preparation. Ordinary owner settings cannot write these approvals or expand the pilot.

Only after the fresh physical STOP/START sequence and independently renewed RL consent pass may the operator activate this one pilot. It automatically stops on expiry, exhausted message reservations, revoked/stopped consent, changed phone, customer/tenant/sender mismatch or withdrawal of private approval. Existing company-wide delivery remains disabled throughout; enabling it requires explicit operator approval.

## Verification performed without real SMS

Automated tests use synthetic credentials, stub transports and the local `demo-routelogistics` emulator. They cover disabled gates, current role/tenant checks, scoped consent, STOP/START/HELP, shared-number ambiguity, queue deduplication, schedule changes, immediate/asynchronous provider opt-out, rate-limit retry, ambiguous acceptance and signed status reconciliation. The readiness run passed 75 Functions tests with one unrelated native-push emulator skip, all 31 SMS/pilot emulator tests (21 consent/delivery plus 10 pilot tests), nine SMS/settings UI tests and the web build. Eight Event Streams unit tests are included in the Functions count. Pilot tests verify atomic caps, expiry, independent re-consent, queued-message cancellation, scheduler isolation and tenant/customer/phone enforcement. Fresh physical provider acceptance remains pending. No Twilio campaign registration or customer text is performed by emulator/unit tests.

Primary provider references: [webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security), [Advanced Opt-Out and toll-free keywords](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out), [delivery-status callbacks](https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks), [Event Streams webhook setup](https://www.twilio.com/docs/events/webhook-quickstart), [provider opt-out classification](https://help.twilio.com/articles/31560110671259-How-to-Track-Opt-Out-Opt-In-and-Help-Messages-Using-the-OptOutType-Parameter), [retry and duplicate handling](https://www.twilio.com/docs/events/event-delivery-and-duplication).
