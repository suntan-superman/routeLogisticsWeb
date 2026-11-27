# Repository agent instructions

When encountering IAM or external permission blockers, complete all independent authorized work first. Consolidate missing permissions into a single request containing the exact role ID, principal, resource scope, purpose, and whether the permission is temporary. Do not repeatedly interrupt the owner for individual permissions unless continuing would create a security risk or irreversible change.

## Mobile visit workflow UX

Keep the five visit stages focused and compact. Use one bounded vertical scroll area per stage with measured scroll targets; preserve drafts and a sensible position when returning from child views. Keep headers and primary actions accessible without covering focused inputs. Present acknowledged hazards as active warnings, while new critical alerts remain prominent. Reuse theme tokens and shared controls, avoid nested cards and repeated instructions, and provide accessible touch targets and layouts at narrow widths and large text sizes. Verify both iOS and Android layouts; automated tests do not replace physical scrolling and keyboard acceptance.

## Mobile design standards

Prioritize clear visual hierarchy, compact informational presentation, and minimal unnecessary scrolling. Use the shared density tokens for typography, spacing, cards, icons, and controls; support Compact, Comfortable, and Large without disabling operating-system text scaling. Keep interactive targets at least 44 points on iOS and 48 dp on Android. Use responsive layouts and progressively disclose secondary details while keeping active safety warnings prominent. Show accurate saved-on-device, syncing, and server-confirmed states. Review field workflows at narrow widths, with long labels, large text, and the keyboard open before release.

## Appointment creation design

Keep appointment forms compact and task-focused. Choose the customer, service, and saved property once; show the saved address without a second entry field. Make a different job address an explicit action and never overwrite the saved property by default. Derive a coverage category only from an exact configured service match; otherwise retain the category control. Group schedule and review details into directly accessible sections, preserve edits across sections, and keep validation beside the relevant choice. Keep secondary configuration explanations out of the ordinary booking path while preserving server-side scheduling and authorization checks.
