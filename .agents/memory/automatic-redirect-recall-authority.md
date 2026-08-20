---
name: Automatic Redirect recall authority
description: The amount source and safety boundary for automatic reprocessed Redirect payment recall.
---

Automatic legacy Redirect recall must derive the reversal amount from the original balanced posted journal and the original paid advance. It must not require an operator to reconcile a later-edited fee amount.

**Why:** Fee records can change after the original Redirect while the immutable payment and journal remain correct. Treating a mutable fee as the amount authority blocks legitimate recall and incorrectly sends users to manual review.

**How to apply:** Preserve authorization, current fiscal-period, original journal/advance equality, bridge provenance, later-payment, wallet, and idempotency guards. Only remove the legacy fee-value equality gate; reset the paid fee marker as part of the atomic reversal.