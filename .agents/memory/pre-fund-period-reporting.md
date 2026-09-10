---
name: Pre-Fund period reporting
description: Authority and terminology for period-based Pre-Fund financial summaries.
---

Pre-Fund period reports must use verified events from the canonical event ledger and include funds referenced by those events even when the fund is no longer active or its scheduled dates do not overlap the reporting period.

**Why:** Filtering balances to active funds can show zero beside valid historical payments. Labeling received minus paid minus committed as “variance” falsely reports a deficit whenever payments use an opening balance.

**How to apply:** Present received, net paid, and committed as period movements; call their difference “Net Activity” and state that it excludes opening balance. Show current available balance separately, and never aggregate different currencies under one currency label.