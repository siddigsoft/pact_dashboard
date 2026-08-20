---
name: Automatic Redirect recall authority
description: The amount source and safety boundary for automatic reprocessed Redirect payment recall.
---

Automatic legacy Redirect recall must derive the reversal amount from the original balanced posted journal and the original paid advance. It must not require an operator to reconcile mutable fee fields, including later-edited amounts, paid timestamps, users, methods, notes, or offset metadata.

**Why:** Fee records can change after the original Redirect while the immutable payment and journal remain correct. Treating a mutable fee as the amount authority blocks legitimate recall and incorrectly sends users to manual review.

**How to apply:** Preserve authorization, current fiscal-period, original journal/advance equality, original bridge provenance, later-payment, wallet, and idempotency guards. Treat the original bridge—not mutable fee fields—as the fee-side proof, then reset paid fee state as part of the atomic reversal.