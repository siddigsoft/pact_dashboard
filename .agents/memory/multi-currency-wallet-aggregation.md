---
name: Multi-currency wallet balance aggregation
description: How wallet balances are stored and the pitfall of summing only one currency key.
---

`wallets.balances` is a jsonb map keyed by currency code (e.g. `{ "SDG": 1200,
"USD": 40 }`), not a single number. Any code that aggregates wallet balances
into a single total (dashboards, consolidated financial statements, exports)
must iterate all keys in the map, not just read `balances.SDG`.

**Why:** reading only `balances.SDG` silently drops any USD (or other
currency) balance from totals — the number looks plausible so the bug is easy
to miss until someone reconciles against actuals.

**How to apply:** convert non-base currencies to the reporting currency using
the live exchange rate before summing. If no rate is available for a given
currency, don't silently drop it or add its face value to the total — either
surface it in a separate "unconverted" bucket with a warning, or block the
aggregation until a rate is available. Same principle applies to
`formatCurrency`-style helpers: don't hardcode a currency code, accept the
record's own `currency` field.
