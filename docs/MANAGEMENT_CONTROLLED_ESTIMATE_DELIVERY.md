# Management-Controlled Estimate Delivery

## Current workflow

1. An assigned technician opens an estimate visit in the mobile Field experience.
2. The technician records scope, notes and photos. Pricing lines are optional at this stage.
3. The draft is retained on-device while offline and shows its local, synchronizing or server-confirmed state.
4. After the saved version is confirmed by the server, the technician selects **Submit for Review** and may return to the originating work order.
5. The web **Estimates** page places **submitted-for-review** records at the top and shows the awaiting-review count and preparer.
6. An Owner, Admin or Manager inspects the field evidence and may edit scope, quantities, pricing, tax and customer-facing text. Saving creates a new immutable version and preserves the technician submission in version history.
7. Management selects **Preview customer PDF**, then approves the exact saved version for delivery or requests changes.
8. After approval, management verifies the prefilled delivery email. A correction applies only to this delivery and does not update the customer record.
9. **Email approved version** queues the versioned PDF through the existing `rlMail` worker. The web UI reports queue/provider status separately from customer approval.
10. The version-bound customer link supports approve, decline and revision request. Post-delivery edits require another version and approval.

## Authorization and integrity

- Technicians can save and submit only estimates tied to their current assigned estimate visit.
- Technicians cannot generate the formal PDF, approve delivery or queue the customer email. These restrictions are enforced in `rlEstimate`, not only hidden in mobile UI.
- Management delivery requires a valid recipient, a priced line, exact-version approval and an active tenant-scoped session.
- The delivery mail ID is deterministic per estimate/version. A repeat cannot create a second delivery or change the recipient.
- Customer records are not modified by a one-time delivery-address correction.
- Delivered versions remain immutable; revision produces a new version and invalidates stale approval material.

## Local validation scope

The focused local validation covers offline/mobile draft retention and submission, server authorization, unpriced technician submissions, management versioning, PDF preview controls, one-time recipient correction, versioned mail idempotency and the existing customer decision/conversion path. Production deployment and real email acceptance require separate approval.
