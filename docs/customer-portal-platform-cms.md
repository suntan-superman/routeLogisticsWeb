# Customer portal and platform content administration

Production project: `mi-factotum-field-service`. Development and deployment use the existing `main` branch.

## Customer portal

`https://route-logistics.com/portal` uses an isolated Firebase application/session. Email codes expire after ten minutes, have a five-attempt limit, and are consumed transactionally. Requests are limited by email and IP; unknown addresses receive the same response without mail or association disclosure. Codes are stored as challenge-bound hashes. A customer token belongs to `rl_customer_<normalized-email-hash>` and cannot become a staff or platform-admin session.

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
