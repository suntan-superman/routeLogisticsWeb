# Verified service feedback

Customers use `/portal` and select their provider to see **Service feedback**, completed visits eligible for review, and previously submitted reviews. An emailed secure invitation opens `/review`; its random token stays in the URL fragment and is removed from browser history before the request. Providers use `/reviews` to manage their own feedback.

## Identity and verification

Portal reviews reuse the existing email-OTP customer identity and live provider/customer associations. A matching staff email, ordinary Firebase sign-in, or client-supplied customer/provider identifier does not authorize feedback. The server checks the selected provider, current customer association, and live completed job in the submission transaction. One deterministic review ID per job prevents duplicates across portal and invitation submissions.

Ratings are whole numbers from one to five. Comments are optional; the on-time answer is optional and is never inferred from location data. Ratings and customer comments cannot be replaced by providers or later submissions. A transport retry cannot restore withdrawn publication permission. Job reopening, deletion, invalidation, reassignment to another customer/provider, or revoked associations cannot create a new authorized review through an old link.

Company owners and active managers have `reviews.manage`; administrators and technicians do not. Responses, private follow-up notes, and moderation changes have audit history. Provider rating/count statistics include all submitted ratings, including negative and hidden feedback. Customer responses never include private follow-up notes, customer contact details, or moderation audit data.

## Publication foundation

Public-display permission is a separate, unchecked choice. Customers can grant or withdraw it through their authenticated portal. Permission alone never publishes feedback. A review can be considered publicly eligible only when the customer permits it, the service remains valid, and moderation approves it. Synthetic test records are always excluded.

Moderation applies the same standards to every rating. A negative opinion or low rating is not a reason to suppress feedback. Privacy, abuse, spam, irrelevant content, or another documented policy concern may justify flagging or hiding a review; the provider must record a reason. Original ratings and comments remain preserved. No Google/Yelp scraping, testimonial import, public review directory, provider discovery, or booking UI is introduced.

## Invitations and delivery

The company review page includes invitation preferences: enabled state, email/SMS channels, delay after completion, one optional reminder, and link lifetime. Email is the default channel. The global deployment flag `RL_REVIEW_INVITATIONS_ENABLED=false` keeps automatic outbound invitations disabled, regardless of a company's saved preferences.

Email uses the existing private `rlMail` queue and SendGrid SMTP worker. SMS uses the existing Twilio outbox, sender approval, delivery callbacks, and STOP suppression. The explicit `review-invitation` SMS consent purpose is separate from appointment and service-completion purposes. An old pilot or general service-message permission cannot authorize review SMS. Existing broad SMS approval gates remain in force.

Invitations are scheduled idempotently from new completion events; existing historical jobs are not scanned to solicit feedback. Delivery workers recheck the live service, customer, recipient, settings, invitation hash, expiry, and channel authorization. Reopened or invalidated work cancels queued invitations and makes old links unusable. Status and sanitized delivery errors appear in provider invitation history. SMTP acceptance is recorded separately from confirmed inbox receipt; SMTP retries retain the existing at-least-once delivery limitation.

SMS queue preparation retains a server-only pending delivery request until the existing Twilio outbox acknowledges it. Interrupted queue attempts retry with the original token and deterministic message identity, including a lost response after a successful queue commit. Attempts are leased and bounded to five; consent withdrawal, STOP, disabled delivery, changed settings, and expiry stop recovery. The pending link is never returned by customer or provider APIs and is cleared when no longer needed.

An operator may authorize one synthetic email using a private, expiring `rlReviewTestGrants` record bound to exactly one invitation, customer, job, recipient hash, and deterministic mail ID. Browser users, including company owners and platform administrators, cannot create or change these grants. The library-only test entry point is never exposed as a callable. This does not enable automated or company-wide delivery.

## Private records and deployment

Private collections are `rlReviews`, `rlReviewStats`, `rlReviewAudit`, `rlReviewInvitationSettings`, `rlReviewInvitations`, `rlReviewJobState`, and `rlReviewTestGrants`. Existing Firestore default-deny rules block direct browser reads and writes; authenticated callables return only authorized projections. Composite indexes support provider review pagination and invitation scheduling/history.

New callables are `rlCustomerReviews`, `rlProviderReviews`, `rlReviewInvitationSettings`, and `rlReviewInvitation`. New completion/deletion triggers and the five-minute review scheduler operate only within the existing `routelogistics` Functions codebase. The email worker and necessary SMS queue/configuration workers gain review-specific authorization checks. QuickBooks, Stripe, native push, provider opt-out callbacks, and service-area behavior are preserved.

No native application code changes are required. Physical acceptance still needs a customer to open a delivered link, submit feedback, see it in the portal and provider page, and withdraw publication permission. Test reviews must remain clearly synthetic and private.

## Implementation validation

The full local Firestore/Storage regression passed 328 checks. The final invitation/SMS regression passed 50 checks, including exact timestamp event ordering, final-attempt queue recovery, signed delivery callbacks, STOP, and existing pilot isolation. All 227 web tests and 138 Functions/unit checks passed; the native-push emulator test is skipped outside its emulator and passes in the full emulator run. Twelve synthetic Chrome scenarios at 390 and 1440 pixels found no accessibility violations, horizontal overflow, or browser errors. Web build and lint passed, with two existing hook warnings outside this change.

One real review-invitation email is authorized for the operator's test inbox, using an isolated synthetic provider/customer/visit and a private one-message grant. It does not authorize an SMS or broad automation. Deployment, SMTP acceptance, live link checks, and operator inbox/physical acceptance are tracked separately; automated tests do not establish carrier delivery or inbox receipt.
