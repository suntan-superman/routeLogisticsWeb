# Customer portal and platform content administration

Production project: `mi-factotum-field-service`. Development and deployment use the existing `main` branch.

## Customer portal

`https://route-logistics.com/portal` uses an isolated Firebase application/session. Email codes expire after ten minutes, have a five-attempt limit, and are consumed transactionally. Requests are limited by email and IP; unknown addresses receive the same response without mail or association disclosure. Codes are stored as challenge-bound hashes. A customer token belongs to `rl_customer_<normalized-email-hash>` and cannot become a staff or platform-admin session.

Customer OTP emails are explicitly titled **Your Route Logistics customer portal code** and link to `/portal`. Team/admin sign-in uses `/login` and a separate staff-code challenge. A customer code cannot sign in to the admin area; a code consumed by an automated/manual test cannot be reused. Unverified team/admin accounts must sign in with their password and finish normal email verification before using staff email-code sign-in.

The portal discovers only active customer records matching the current authoritative email. An outdated `emailNormalized` value cannot preserve access after an email change. Duplicate customer records within one provider are grouped into one provider account without merging or changing the source records. The provider selector scopes visits, invoices, payment controls, payment history and files. Refresh removes revoked associations and clears stale dialogs; asynchronous results cannot repopulate a previous provider or signed-out session.

Deactivating a customer, deleting/disassociating its email, or deactivating its provider revokes portal service access. Invoice/payment access retains the existing live authorization checks; the Stripe integration was not changed. Payment history is retrieved through the existing `rlGetInvoicePaymentHistory` callable. No certification transaction issues a real charge.

Only explicitly shared files are visible:

- Photo records require `customerVisible: true` and a matching live provider/customer/job association.
- Service documents use private `rlPortalDocuments` metadata with `customerVisible: true`, `status: published`, matching association and job, and a private `rlPortalDocuments/<scope>/<job>/...` object.
- Internal photos and documents remain private by default. Existing records were not automatically published.
- `rlGetCustomerPortalFile` rechecks authorization before and after the bounded Storage download. It returns image/PDF data, never a permanent download token or public object URL. Supported files are at most 2 MB.

## Platform administration

`https://route-logistics.com/platform-admin` is independent of company-owner and team-role authorization. A verified Firebase account must also have a private operator-managed `rlPlatformAdmins/<uid>` record with `status: active` and `role: admin`. Company ownership, an ordinary `admin` team claim, technician membership and customer-portal claims provide no platform access. Each protected callable checks the live grant. Clients cannot create or modify grants directly.

The authorized account must finish normal Firebase email verification. The administration screen provides explicit send-verification and check-verification actions; it does not mark accounts verified or bypass MFA/email policy. Sign-in returns to `/platform-admin` using a strictly allowlisted internal return path.

The CMS provides a dashboard, FAQ/testimonial/success-story lists, drafts, publication/archive controls, private preview, revision history, optimistic conflict checks, save feedback and unsaved-change protection. Images upload through an authorized server endpoint into private token-free Storage. Allowed image formats are JPEG, PNG and WebP, up to 2 MB, with required alternative text. A public image proxy rechecks the current published record; archiving/unpublishing removes public access.

Content uses plain text, paragraph breaks and dedicated SEO fields. HTML supplied as text is escaped, not executed. Testimonial/story publication requires an explicit genuine-source and publication-permission reference. Synthetic acceptance content cannot be published. No fictional testimonials or success stories were seeded.

Private collections are `rlPlatformContent`, `rlPlatformContentImages`, `rlContentSlugs` and `rlContentAudit`. Each save creates an immutable audit revision. Published pages have a sanitized server-managed `rlPublicContent` projection; private source evidence and administrator identities are not included. Archive/draft transitions remove the public projection atomically.

## Public routes and search rendering

| Route | Purpose |
| --- | --- |
| `/faqs` and `/faqs/:slug` | Published help library and individual answers |
| `/testimonials` and `/testimonials/:slug` | Genuine published customer feedback |
| `/success-stories` and `/success-stories/:slug` | Genuine published stories and case-study pages |
| `/sitemap.xml` | Published content discovery |
| `/robots.txt` | Discovery and private-route crawl guidance |

Netlify rewrites these routes to `rlPublicContent`, which serves complete readable HTML to all visitors, including crawlers. This is a small rendering addition to the existing application, not a separate website/CMS framework. React routes remain available for client navigation. Marketing-page resource links connect the library to the existing website.

Individual pages support editable SEO titles, descriptions, same-origin canonical URLs and Open Graph metadata. FAQ pages use FAQPage data; stories use Article data; breadcrumb and collection data reflect the actual visible content. No invented ratings or aggregate reviews are emitted. Sitemap entries come only from published projections. Unpublished/unknown pages return real 404 responses with noindex; backend failures return noindex 503 responses. Private previews/admin/portal are noindex. Public HTML and image responses avoid stale caches when content is withdrawn.

Five factual product-help FAQs were published using an audited operator bootstrap. Testimonial and story collections remain empty until genuine material and permission are supplied. Search rendering readiness does not promise indexing, ranking or rich-result eligibility; those require search-engine processing and ongoing useful content.

## Validation and operations

The normal test commands now include portal and CMS authorization/publication suites:

```powershell
npm run test:functions
npm run test:web
npm run test:rules
npm --prefix routeLogisticsWeb run lint
npm --prefix routeLogisticsWeb run build
```

The certification uses clearly marked synthetic provider/customer/job/invoice records and private synthetic image/PDF objects. Existing provider, customer, membership, job and service records are snapshotted and compared. QuickBooks, Stripe, Twilio, native push and the email worker are not redeployed by this change.

Actual email delivery, deployed API checks and publication/crawlability checks are recorded separately from emulator/browser tests. Physical acceptance remains necessary for the operator's verified admin sign-in and editor/image workflow, and for customer sign-in, provider switching and photo/PDF viewing on an actual phone.

### November 14, 2026 acceptance results

- **Production portal API checks passed:** real emailed OTP, isolated Firebase sign-in, one-time replay denial, two synthetic providers, duplicate grouping, provider selection/forgery denial, scoped visits/invoices, bounded authenticated PNG/PDF retrieval, hidden/foreign file denial, payment-history visibility and denial, live association/payment-access revocation, and denial of platform administration to the portal identity. The revoked synthetic association was restored for manual acceptance; existing customer records were not changed. OTP expiration, concurrent consumption, request/attempt limits and disabled-delivery states also passed emulator tests.
- **Email delivery passed:** the first authorized OTP arrived in the operator's Inbox. A separately authorized fresh OTP completed the full deployed API sequence after a test-harness response-field correction. Each outbox delivery was sent on its first attempt. Codes, custom tokens and Firebase session values were not printed or committed.
- **Security/workflow regression:** all 257 Firestore/Storage/workflow tests passed, including existing billing, QuickBooks, messaging, push and role/tenant controls. All 165 web tests passed. Functions validation passed 94 unit tests; its one emulator-only test was covered in the full emulator run. Existing operator/sandbox guard tests also passed.
- **Responsive/accessibility:** 20 actual headless-Chrome checks passed at 390×844 and 1440×1000, with no serious/critical axe WCAG 2 A/AA or 2.1 violations, horizontal overflow or page JavaScript errors. Heading, label and keyboard-focus checks passed. Browser fixtures stayed local; authenticated physical-device acceptance is separate.
- **Build/lint:** the web build passed. ESLint reports zero errors; two existing dependency warnings remain in unrelated Jobs/Reports pages. Changed portal/CMS files lint without warnings.
- **Deployment/crawlability:** nine RL functions, five additive CMS indexes and the private CMS Storage rule deployed successfully. Production Netlify serves full HTML with canonical/Open Graph/JSON-LD metadata on the public routes. The synthetic draft returns a real noindex 404, published FAQ pages appear in the sitemap, robots guidance is live, and admin/customer portal responses are noindex. No testimonial or success story was published.
- **Preservation:** all original versions remain unchanged in the six baseline collections: four companies, 513 customers, seven jobs, eight memberships, zero service plans and zero service logs. The 17 added portal fixture records are synthetic and use the expected prefix. Existing invoice/photo/document versions were not in the snapshot; acceptance writes used new fixture IDs only. Seven monitored QuickBooks, Stripe, Twilio, push and email-worker revisions remain unchanged and active. All five CMS indexes are ready. The approved platform grant exists, while the account's unverified email state was preserved pending normal verification.

Sanitized operational evidence is retained in ignored `.migration/portal-cms-live.json`, `.migration/portal-cms-final-verification.json`, `.migration/portal-cms-netlify-live.json`, `.migration/platform-portal-browser.json` and the emulator/build logs. Synthetic fixtures are clearly identified by the `rl-portal-cert-20261114` prefix; the private synthetic CMS draft cannot be published.
