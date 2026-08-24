---
name: Pre-Fund country ID normalization
description: Compatibility rule for posting Pre-Fund events into UUID-scoped accounting tables.
---

**Rule:** Normalize a Pre-Fund record's `country_id` from its JSON/text representation to UUID before resolving country-scoped GL accounts or inserting accounting journal entries.

**Why:** Legacy Pre-Fund deployments can store the country identifier as text, but the accounting chart and journal schema use UUID. Passing the raw record value causes a runtime type error only after the receipt event has begun posting.

**How to apply:** For any new Pre-Fund-to-GL bridge or RPC, use a validated local UUID variable for country matching and journal insertion. Keep the conversion inside the database transaction so invalid legacy values fail before financial evidence is written.