# Route Logistics AI Assistant and Workside Support Integration

Status: implemented and validated for the authenticated Route Logistics web application on 2026-11-17. Physical browser acceptance remains an operator task.

## Architecture

The browser never calls the shared support service directly. It calls the authenticated Firebase callable `rlAssistant`, which verifies the current Firebase user, active company membership, role and workspace on the server. The callable then sends a deliberately small context envelope to the existing Merxus chat API.

```text
Authenticated Route Logistics browser
  -> rlAssistant Firebase callable
     -> active-account and live-membership verification
     -> rate, size, session and tenant controls
     -> https://api.merxus.ai/api/chat/public/session/*
        -> existing Merxus conversation/support store
        -> existing human-transfer workflow
           -> Workside Support Console
```

`rlAssistantSessions` contains only the local security binding, pseudonymous user reference, remote session ID, role at creation, workspace reference, route metadata, counters and escalation state. Message content and the operator conversation remain in the existing Merxus support infrastructure. No new support database or console was introduced.

## Existing infrastructure reused

- Firebase Authentication and the existing Route Logistics company membership/capability model.
- The existing `https://api.merxus.ai/api/chat/public/session` conversation, history, timeout and `request-human` contracts.
- Existing Merxus conversation persistence, support routing, status, assignment and operator reply behavior.
- Workside Support Console product/tenant scoping, conversation history, assignment and resolution workflow.
- Existing Route Logistics notification/toast patterns and React Router navigation.

## Repositories and endpoints

| Component | Source | Production endpoint |
| --- | --- | --- |
| Route Logistics web and callable | `C:\Users\sjroy\Source\routeLogistics` | `https://route-logistics.com`; callable `https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlAssistant` |
| Shared Merxus chat backend | `C:\Users\sjroy\Source\Merxus\merxus-ai-backend` | `https://api.merxus.ai/api/chat/public/session/*` |
| Workside Support Console | `C:\Users\sjroy\Source\WorksideSupportConsole` | `https://support.worksidesoftware.com` |

The shared backend recognizes the product key `route-logistics` and displays it as `Route Logistics`. Existing Merxus product keys and behavior remain unchanged.

## Widget behavior

The authenticated application shell mounts one persistent assistant launcher. It supports:

- expand, minimize, close with Escape, and a new-conversation action;
- bounded message history, loading, error and retry states;
- Help with this page and page-specific suggested questions;
- verified in-app navigation actions;
- Workside Support handoff and a structured Report a Problem form;
- nearly full-screen presentation at narrow browser widths;
- screen-reader labels, keyboard operation, safe text rendering and managed focus;
- session continuity during ordinary navigation, without opening automatically;
- workspace-scoped browser state that is cleared on logout or workspace change.

The assistant is guidance-only. It cannot modify a customer, job, estimate, invoice, payment or other business record.

## Knowledge registry

`routeLogisticsWeb/src/features/assistant/knowledgeRegistry.js` is the version-controlled source for product guidance. Each entry identifies its feature, page, route, required capabilities, supported roles, implementation status, workflow steps, common problems and approved actions. It covers:

- customer/prospect intake and service properties;
- scheduling, dispatch, availability, geographic eligibility and reassignment;
- field work, shifts, arrivals/departures, photos, notes, completion and offline recovery;
- estimate visits, technician drafts, version review, customer decisions and approved-work scheduling;
- invoice terminology, preview/generation restrictions, status and payment history;
- team, services, service areas, availability, company settings, integrations and notifications;
- customer portal access, provider switching, records, documents, invoices and reviews;
- planned marketplace/provider discovery as planned rather than available.

Future feature changes should update this registry in the same change. Registry tests reject unknown routes, stale capabilities and unsafe actions.

## Navigation integration

The assistant returns an approved action ID, never an arbitrary URL. The web application resolves that ID against the local registry and checks the current role/capabilities again before using React Router. The callable separately normalizes the current route against its server registry. External URLs, unknown routes, query-string attempts and unauthorized routes are rejected or reduced to the dashboard.

## Authorization and role behavior

- Owner/admin: authorized company, scheduling, estimate and financial guidance.
- Manager: operational, dispatch and estimate-review guidance; financial actions remain capability-gated.
- Technician: assigned work, offline work, notes, photos, visit completion and assigned estimate preparation only.
- Platform-admin claims do not imply ownership of a Route Logistics company.
- Customer portal permissions are not inherited by the authenticated staff widget.

Client-supplied role, company, tenant and capability values are ignored. Every callable action resolves the principal from the authenticated token plus the current live membership record. Revoked or missing membership fails closed.

## Safe context contract

Permitted outbound fields are product, verified workspace reference, pseudonymous user reference, current approved route/page category, server-derived role/capabilities, feature availability, knowledge version and the user's typed question. Support handoff additionally sends only the signed-in email, user-supplied contact name and issue fields, sanitized app version, and the current approved page.

The integration does not automatically send customer names, contact details, addresses, job notes, photos, arbitrary Firestore documents, financial records, credentials, tokens or payment details. Credential/card-like content is rejected. Messages are plain text and response rendering does not use raw HTML.

## Workside Support handoff

`Contact Workside Support` and `Report a Problem` call the existing `request-human` endpoint with product `route-logistics`, source conversation ID, pseudonymous user/workspace references, page, category and the explicit description. An operation ID and stored escalation state make the request idempotent. A failed request is marked retryable; a successful repeated request does not create another transfer.

The acknowledgment accurately states that the existing support workflow handles replies. It does not promise real-time operator chat inside Route Logistics. Operator access continues to be enforced by Workside Support Console product and tenant scopes.

## Usage and cost controls

- 1,000-character question limit and restricted-content check.
- 12 messages per user per minute.
- 30 messages per conversation and 40 normalized messages returned.
- Three human-transfer attempts per user per hour.
- Twelve-second upstream timeout with sanitized errors.
- Only selected route/capability metadata is sent; the complete registry is not attached to every request.
- `RL_AI_ASSISTANT_ENABLED=false` disables upstream assistant messages without disabling deterministic help or support handoff.
- `RL_SUPPORT_API_BASE_URL` selects the existing support API; no AI credential is present in the browser or Route Logistics repository.
- Existing Merxus support metrics and conversation usage remain the operational source of cost/volume visibility.

The Route Logistics knowledge response is deliberately deterministic and product-specific. It does not consume a second model/provider or add a paid service.

## Failure recovery

If the shared chat API, network, or response contract fails, the widget shows a retryable error and continues to offer deterministic knowledge topics and verified navigation. Core Route Logistics screens remain usable. A failed handoff retains its local conversation and may be retried. Invalid upstream responses never create an unbound local session. The kill switch can disable provider messages without a client rebuild.

## Automated test evidence

Validated on 2026-11-17:

- Route Logistics Functions: assistant authorization, forged context, cross-tenant access, revocation, content bounds, invalid provider responses, kill switch, handoff metadata/idempotency/recovery.
- Route Logistics web unit/source tests: registry coverage, role-specific results, route/capability validation, XSS-safe rendering contract, logout cleanup and responsive/accessibility behavior.
- Playwright Chromium: manager Dispatch page help and authorized navigation; mobile-width technician open/close with page state retained.
- Merxus backend: Route Logistics product attribution and knowledge isolation plus existing public human-handoff regression.
- Workside Support Console: Route Logistics product label plus existing chat normalization tests and production build.
- Full Route Logistics web and Functions suites, lint and production build.

Automated tests do not create a live support transfer.

## Deployment and verification

Deployment order is Support Console compatibility, Merxus product support, Route Logistics Functions, then the Route Logistics web release. Record the deployed revision/commit identifiers in the release report. Production verification must remain read-only: load the site, confirm the launcher, request deterministic help, verify authorized navigation and inspect the client bundle for server credentials. A live transfer requires separate operator authorization.

## Rollback

1. Set `RL_AI_ASSISTANT_ENABLED=false` in the Route Logistics Functions environment to stop upstream assistant messages immediately while preserving deterministic help.
2. Roll the Route Logistics site back to the preceding Netlify production deploy if the shell/widget causes a browser regression.
3. Roll `rlAssistant` back to the preceding Firebase Functions revision if callable behavior is defective.
4. Roll the Merxus Cloud Run service to its preceding revision if the shared product adapter causes a regression.
5. Roll the Support Console site back to its preceding deploy if product presentation regresses.

No rollback requires deleting conversations or altering business data.

## Known limitations

- The assistant provides read-only guidance and navigation; it does not inspect unsupplied form values or private records.
- Human replies use the existing support workflow; immediate in-widget two-way live chat is not promised.
- Record-specific deep links are intentionally excluded from v1.
- Customer-facing portal chat is outside this authenticated staff-widget release.
- Physical operator acceptance and one explicitly authorized synthetic support escalation remain required.

## Physical browser acceptance checklist

- [ ] Owner asks how to create a new inquiry; instructions and Go to Customers work.
- [ ] Manager asks how to approve and send a technician estimate; guidance matches current permissions.
- [ ] Technician asks how to generate an invoice; restriction appears and no invoice navigation is offered.
- [ ] On Dispatch, Help with this page returns dispatch/exception guidance.
- [ ] With explicit authorization, one synthetic issue appears in Workside Support Console as Route Logistics.
- [ ] Existing Merxus chat-to-console handoff still operates.
- [ ] Switching companies does not expose the previous conversation.
- [ ] With the assistant upstream disabled, deterministic help/navigation remain available and normal work continues.
- [ ] Verify desktop Chrome/Edge, tablet width and a narrow mobile browser; no native mobile rebuild is involved.
