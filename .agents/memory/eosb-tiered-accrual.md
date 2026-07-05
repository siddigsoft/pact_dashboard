---
name: EOSB tiered accrual rule
description: Correct calculation shape for Sudan Labour Law end-of-service benefit accrual.
---

EOSB (end-of-service benefit) accrual must blend two tiers of day-rate by year
of service, not apply a single flat rate across the whole tenure:

- Years 1 through the tier1 threshold (default 5 years): tier1 days/year (default 21).
- Years beyond the threshold: tier2 days/year (default 30).

**Why:** an earlier implementation picked one flat rate for the entire
service period based on total years, which over/under-accrues for anyone
whose tenure spans both tiers.

**How to apply:** these thresholds/rates should come from a settings table
(not hardcoded) so HR can tune them without a code change; fall back to the
Sudan Labour Law defaults above if settings are missing. Applies to any EOSB
calculation entry point (manual calc, batch run, payslip preview, etc.) —
make sure all of them pull from the same settings source rather than each
reimplementing the blend.
