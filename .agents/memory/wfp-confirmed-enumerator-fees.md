---
name: WFP-confirmed enumerator fees
description: Authority and workflow boundary for ordinary site-fee wallet credits and payments.
---

Ordinary enumerator and transport fees may be credited to a wallet or recorded as paid only after the site status is canonically WFP confirmed. Completed, submitted, approved, or costed states are not payable states. Incentive bonuses remain a separate system.

**Why:** Completion-time client credits and permissive wallet writes can pay before external confirmation or create duplicate financial evidence. The database must own credit creation and reject direct ordinary-earning mutations.

**How to apply:** Keep web, offline, and Flutter completion flows non-financial. Let the trusted WFP-confirmation database path create one idempotent site earning. Direct covered-fee payments must use the receipt-backed Field Payments Centre workflow.