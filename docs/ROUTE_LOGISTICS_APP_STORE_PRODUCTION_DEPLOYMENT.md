# Route Logistics App Store onboarding production deployment

**Released:** November 22, 2026 (America/Los_Angeles)
**Result:** PASS for the authorization and web release; iOS build and App Store submission remain separate.

## Release scope

- Git `main` code commit: `b1082bfb8fea9146dcce58de372885e27006b91b` (previous commit `e7fd35b94096ff965f7c51f307c29a759c8f1955`). The native `routeLogisticsMobile/app.config.js` working-tree change, `debug.log`, README edits, data, and other unrelated files were excluded.
- Firebase project: `mi-factotum-field-service`. Deployed the `routelogistics` Functions codebase as a unit because the shared authorization modules are imported across the existing callables and triggers. Firebase reported 130 successful updates and one successful creation (`rlCompanyRegistration`). No mi Factotum codebase was targeted. Transient Google Cloud mutation-quota responses were retried by Firebase; the command exited successfully.
- Firestore: `firestore.rules` compiled and was released to `cloud.firestore`. No indexes or Storage rules changed.
- Web: pushed `main`; the production homepage and public routes returned HTTP 200. Production served `assets/index-DZrFpGCD.js`, exactly matching the validated local build. Desktop and mobile browser checks found Log In, Add Your Company, and Customer Portal links. Netlify's authenticated deploy ID was unavailable from this environment; the served asset is the release identifier verified here.
- Registration policy: `rlCompanyRegistration/policy` is `approval_required`, revision 1. It was changed through the existing platform-admin authorization handler with the verified active administrator account, creating an audit entry. The deployed registration endpoint returned `configured: true` and `mode: approval_required`.
- No EAS production build or Apple submission was initiated.

## Authorization model and validation

The old solo-workspace path was removed from the shared callable access checks, offline job operations, assistant principal resolution, and Firestore client rules. A verified personal account without an active company membership is `unassociated`; it does not inherit owner or manager permissions. Company creation requires a single-use Workside authorization when policy is `approval_required`. Existing invitation, tenant, and role checks continue to use active company membership and server-issued claims.

| Check | Result | Evidence |
| --- | --- | --- |
| New personal account registers without membership | PASS | Temporary production Auth account registered; `syncClaims` returned `unassociated` and null company claims. |
| Unassociated account denied company resources | PASS | Production `rlReadWorkspace` denied the temporary account. |
| Company creation requires Workside authorization | PASS | Production `rlCreateCompany` denied the temporary verified account without an authorization code; registration policy was confirmed active. Positive code redemption passed local emulator tests. |
| Invitation grants intended membership | PASS in emulator; production read-only consistency PASS | Invitation and claim tests passed locally. The two active Acme and two active BLS membership records all matched their Auth company, role, and membership claims. No production invitation email was sent. |
| Cross-company access and role permissions | PASS in emulator | Firestore and Functions integration tests denied cross-tenant requests and unauthorized roles. No production customer records were read into public test artifacts. |
| Unassociated account deletion | PASS | The temporary production account used its own fresh sign-in and full-email confirmation; `rlDeleteAccount` returned success and the Auth user was removed. |
| Platform-admin policy control | PASS | An active, verified platform admin was checked before the audited policy change. |
| Integrations after whole-codebase rollout | PASS for runtime health | Stripe webhook, QuickBooks webhook, and email worker remained ACTIVE with their prior secret-binding counts (2, 1, and 1). Their business logic and configuration were not changed. No financial or customer communications were sent. |

Local validation: Functions tests passed; web tests passed; mobile tests 447/447 passed; Firestore/Storage emulator tests 620/620 passed; Auth/Functions emulator tests 7/7 passed; Chromium browser smoke 18/18 passed; production Vite build succeeded. The production browser smoke loaded the homepage at desktop and mobile widths and opened the signup route. The new production Function revisions were ACTIVE, with 100% traffic on the sampled authorization-critical services below.

## Authorization-critical production revisions

| Function | Revision | Traffic |
| --- | --- | ---: |
| `rlCompanyRegistration` | `rlcompanyregistration-00001-red` | 100% |
| `rlCreateCompany` | `rlcreatecompany-00007-naj` | 100% |
| `rlActivateCompanyOnboarding` | `rlactivatecompanyonboarding-00005-zuv` | 100% |
| `rlReadWorkspace` | `rlreadworkspace-00017-tac` | 100% |
| `syncClaims` | `syncclaims-00019-zup` | 100% |
| `rlManageJob` | `rlmanagejob-00019-haz` | 100% |
| `rlDeleteAccount` | `rldeleteaccount-00005-wuj` | 100% |
| `rlAssistant` | `rlassistant-00008-jev` | ACTIVE |

The complete deployed Function/revision inventory is appended below. Every one of the 130 pre-existing Function update timestamps advanced, and the registration Function was added.

## Rollback

1. If new registrations must stop immediately, change the audited registration policy from `approval_required` to `closed` in Platform Admin. Do not delete the policy or its audit history.
2. Revert the release commit on `main` with a new revert commit (no force push). Netlify will republish the previous web source. The prior web asset observed before this release was `assets/index-CrQLDtCA.js`.
3. From the reverted source, redeploy only `functions:routelogistics` and `firestore:rules` to `mi-factotum-field-service`. A source revert by itself does not roll back Firebase. Previous sampled revisions were `rlcreatecompany-00006-voh`, `rlactivatecompanyonboarding-00004-rug`, `rlreadworkspace-00016-yer`, `syncclaims-00018-ruw`, and `rlmanagejob-00018-gaf`.
4. Recheck `syncClaims`, company-resource denial, the policy, and served web assets after any rollback. The pre-release policy document was absent and therefore fail-closed; use the audited `closed` mode instead of deleting records.

## Remaining App Store work

- Prepare a reviewer-safe synthetic company/account and provide its access instructions privately in App Store Connect. Do not expose Acme or BLS records to reviewers.
- Complete App Store Connect metadata, privacy and permission declarations, export-compliance answers, signed iOS build inspection, and physical-device acceptance. A local uncommitted iOS permission-description change was intentionally excluded from this authorization release and should be reviewed before the build.
- This release did not run an EAS production build or submit to Apple. The owner must separately authorize that step.

## Complete Route Logistics Function inventory

| Function | Active revision |
| --- | --- |
| `acceptTeamInvite` | `acceptteaminvite-00015-giv` |
| `bulkImportCustomers` | `bulkimportcustomers-00019-puv` |
| `emailInvoice` | `emailinvoice-00021-wic` |
| `generateServicePlanJob` | `generateserviceplanjob-00020-pej` |
| `getCustomerPortal` | `getcustomerportal-00019-kat` |
| `manageTeamMember` | `manageteammember-00015-wey` |
| `notifyJobAssigned` | `notifyjobassigned-00015-tas` |
| `onTeamMemberDeleted` | `onteammemberdeleted-00018-pos` |
| `onTeamMemberUpdated` | `onteammemberupdated-00018-mep` |
| `rlActivateCompanyOnboarding` | `rlactivatecompanyonboarding-00005-zuv` |
| `rlApplyJobOperation` | `rlapplyjoboperation-00016-lak` |
| `rlAssistant` | `rlassistant-00008-jev` |
| `rlBillingSettings` | `rlbillingsettings-00002-jan` |
| `rlCancelInvoicePayment` | `rlcancelinvoicepayment-00014-bav` |
| `rlCheckAvailability` | `rlcheckavailability-00006-bek` |
| `rlClaimPortalLink` | `rlclaimportallink-00002-fam` |
| `rlCleanupCompanyOnboardingDrafts` | `rlcleanupcompanyonboardingdrafts-00002-pog` |
| `rlCleanupLocations` | `rlcleanuplocations-00015-fuz` |
| `rlCompanyLogo` | `rlcompanylogo-00003-fac` |
| `rlCompanyRegistration` | `rlcompanyregistration-00001-red` |
| `rlCompanySetupReview` | `rlcompanysetupreview-00002-baf` |
| `rlCompanyUsage` | `rlcompanyusage-00002-tej` |
| `rlCompleteAccountDeletion` | `rlcompleteaccountdeletion-00006-xiy` |
| `rlCreateCompany` | `rlcreatecompany-00007-naj` |
| `rlCreateInvoicePayment` | `rlcreateinvoicepayment-00015-hez` |
| `rlCustomerReviews` | `rlcustomerreviews-00005-huw` |
| `rlDeleteAccount` | `rldeleteaccount-00005-wuj` |
| `rlDeliverCustomerSms` | `rldelivercustomersms-00008-bik` |
| `rlDeliverEmail` | `rldeliveremail-00023-zam` |
| `rlDeliverNativePush` | `rldelivernativepush-00008-xam` |
| `rlDisconnectPortalLink` | `rldisconnectportallink-00002-kof` |
| `rlEstimate` | `rlestimate-00021-wez` |
| `rlEstimateApproval` | `rlestimateapproval-00011-nep` |
| `rlFinancialReport` | `rlfinancialreport-00003-ven` |
| `rlGenerateInvoiceDrafts` | `rlgenerateinvoicedrafts-00002-koy` |
| `rlGenerateManagementReports` | `rlgeneratemanagementreports-00002-paq` |
| `rlGenerateRecurringJobs` | `rlgeneraterecurringjobs-00020-qur` |
| `rlGetCompanyOnboardingDraft` | `rlgetcompanyonboardingdraft-00004-gin` |
| `rlGetCustomerPortalFile` | `rlgetcustomerportalfile-00005-vos` |
| `rlGetDailyRoute` | `rlgetdailyroute-00016-gif` |
| `rlGetInvoicePaymentHistory` | `rlgetinvoicepaymenthistory-00006-hud` |
| `rlGetInvoicePaymentStatus` | `rlgetinvoicepaymentstatus-00015-pir` |
| `rlGetLocationHistory` | `rlgetlocationhistory-00004-cib` |
| `rlGetLocationHistoryMembers` | `rlgetlocationhistorymembers-00003-peg` |
| `rlGetPaymentReadiness` | `rlgetpaymentreadiness-00005-qaj` |
| `rlGetRoutingTeam` | `rlgetroutingteam-00015-huq` |
| `rlGetTeamLocations` | `rlgetteamlocations-00016-bil` |
| `rlInvoiceLedger` | `rlinvoiceledger-00002-yiv` |
| `rlInvoicePdf` | `rlinvoicepdf-00003-xeh` |
| `rlJobException` | `rljobexception-00003-fah` |
| `rlJobPhoto` | `rljobphoto-00008-jox` |
| `rlJobVisit` | `rljobvisit-00010-yow` |
| `rlManageCustomer` | `rlmanagecustomer-00005-han` |
| `rlManageInquiry` | `rlmanageinquiry-00003-jus` |
| `rlManageInvoice` | `rlmanageinvoice-00006-luq` |
| `rlManageJob` | `rlmanagejob-00019-haz` |
| `rlManagePortalLink` | `rlmanageportallink-00002-tuh` |
| `rlManageServicePlan` | `rlmanageserviceplan-00012-lif` |
| `rlManageStaffAvailability` | `rlmanagestaffavailability-00004-rap` |
| `rlNativePush` | `rlnativepush-00006-cig` |
| `rlNativePushMemberDeleted` | `rlnativepushmemberdeleted-00005-qez` |
| `rlNativePushMemberUpdated` | `rlnativepushmemberupdated-00005-tug` |
| `rlNotifyJobStatus` | `rlnotifyjobstatus-00015-taj` |
| `rlNotifyNewJobAssigned` | `rlnotifynewjobassigned-00015-yat` |
| `rlPlatformCms` | `rlplatformcms-00004-tuj` |
| `rlPlatformContentImage` | `rlplatformcontentimage-00004-xew` |
| `rlPlatformSubscriptions` | `rlplatformsubscriptions-00002-ras` |
| `rlProviderReviews` | `rlproviderreviews-00004-pey` |
| `rlPublicContent` | `rlpubliccontent-00004-qut` |
| `rlPublicContentImage` | `rlpubliccontentimage-00004-noc` |
| `rlQueueCustomerSms` | `rlqueuecustomersms-00008-cox` |
| `rlQueueInvoiceReminders` | `rlqueueinvoicereminders-00020-wab` |
| `rlQueueNativeJobCreated` | `rlqueuenativejobcreated-00006-neb` |
| `rlQueueNativeJobUpdated` | `rlqueuenativejobupdated-00007-zob` |
| `rlQueueSmsJobCreated` | `rlqueuesmsjobcreated-00007-luv` |
| `rlQueueSmsJobUpdated` | `rlqueuesmsjobupdated-00007-tey` |
| `rlQuickBooksAdopt` | `rlquickbooksadopt-00015-xej` |
| `rlQuickBooksConnect` | `rlquickbooksconnect-00014-cis` |
| `rlQuickBooksDisconnect` | `rlquickbooksdisconnect-00015-wez` |
| `rlQuickBooksOAuthCallback` | `rlquickbooksoauthcallback-00015-poj` |
| `rlQuickBooksOptions` | `rlquickbooksoptions-00004-yar` |
| `rlQuickBooksPreview` | `rlquickbookspreview-00016-yox` |
| `rlQuickBooksProcessEvents` | `rlquickbooksprocessevents-00016-gir` |
| `rlQuickBooksReconcile` | `rlquickbooksreconcile-00015-voq` |
| `rlQuickBooksSettings` | `rlquickbookssettings-00015-puc` |
| `rlQuickBooksStatus` | `rlquickbooksstatus-00016-rem` |
| `rlQuickBooksSync` | `rlquickbookssync-00016-kal` |
| `rlQuickBooksWebhook` | `rlquickbookswebhook-00016-per` |
| `rlReadPublicContent` | `rlreadpubliccontent-00004-nes` |
| `rlReadWorkspace` | `rlreadworkspace-00017-tac` |
| `rlRecordApplication` | `rlrecordapplication-00008-zug` |
| `rlRequestCustomerOTP` | `rlrequestcustomerotp-00017-hub` |
| `rlRequestStaffOTP` | `rlrequeststaffotp-00009-vox` |
| `rlReviewInvitation` | `rlreviewinvitation-00004-yiw` |
| `rlReviewInvitationSettings` | `rlreviewinvitationsettings-00004-juw` |
| `rlReviewJobCreated` | `rlreviewjobcreated-00004-nax` |
| `rlReviewJobDeleted` | `rlreviewjobdeleted-00004-huc` |
| `rlReviewJobUpdated` | `rlreviewjobupdated-00005-wav` |
| `rlSaveCompanyOnboardingDraft` | `rlsavecompanyonboardingdraft-00004-jiq` |
| `rlSaveDailyRoute` | `rlsavedailyroute-00014-dub` |
| `rlScheduleCustomerSms` | `rlschedulecustomersms-00007-mim` |
| `rlScheduleMemberDeleted` | `rlschedulememberdeleted-00006-fig` |
| `rlScheduleMemberUpdated` | `rlschedulememberupdated-00006-xod` |
| `rlScheduleReviewInvitations` | `rlschedulereviewinvitations-00005-nef` |
| `rlSendPaymentConfirmation` | `rlsendpaymentconfirmation-00005-ruh` |
| `rlServiceAreas` | `rlserviceareas-00009-vek` |
| `rlServiceForms` | `rlserviceforms-00005-han` |
| `rlSetLocationPolicy` | `rlsetlocationpolicy-00007-pok` |
| `rlSetLocationRetention` | `rlsetlocationretention-00015-noy` |
| `rlSmsConfig` | `rlsmsconfig-00007-zod` |
| `rlSmsCustomerConsent` | `rlsmscustomerconsent-00007-vul` |
| `rlSmsInbound` | `rlsmsinbound-00009-kim` |
| `rlSmsProviderEvents` | `rlsmsproviderevents-00004-puv` |
| `rlSmsStatus` | `rlsmsstatus-00007-zoc` |
| `rlStripeWebhook` | `rlstripewebhook-00014-vig` |
| `rlUpdateWorkLocation` | `rlupdateworklocation-00018-new` |
| `rlVerifyCustomerOTP` | `rlverifycustomerotp-00016-woz` |
| `rlVerifyStaffOTP` | `rlverifystaffotp-00008-qin` |
| `rlWorkShift` | `rlworkshift-00008-now` |
| `sendTeamInviteEmail` | `sendteaminviteemail-00015-kas` |
| `stamp_appointments` | `stamp-appointments-00018-saj` |
| `stamp_customers` | `stamp-customers-00018-zuh` |
| `stamp_estimates` | `stamp-estimates-00018-yuc` |
| `stamp_estimateTemplates` | `stamp-estimatetemplates-00018-sas` |
| `stamp_invoices` | `stamp-invoices-00015-luy` |
| `stamp_jobs` | `stamp-jobs-00018-miw` |
| `stamp_photos` | `stamp-photos-00018-ceh` |
| `stamp_serviceLogs` | `stamp-servicelogs-00015-xuq` |
| `stamp_servicePlans` | `stamp-serviceplans-00015-rej` |
| `syncClaims` | `syncclaims-00019-zup` |
| `transferCompanyOwnership` | `transfercompanyownership-00015-bup` |
