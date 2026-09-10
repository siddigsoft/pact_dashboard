---
name: Month-end reporting basis
description: Recognition and disclosure rules for the Month-End Financial Summary.
---

Assign each finalized payroll run to the calendar month containing its period end date. Do not count the full run in every month it overlaps.

**Why:** Overlap-based inclusion duplicates a cross-month payroll run across multiple monthly reports. The period-end rule gives each finalized run one deterministic reporting month.

**How to apply:** Use date-only period-end bounds in both queries and aggregation. Export the run's actual start and end dates so Finance can audit its assignment.

Receivables due in a selected month and current active subscription estimates are current-state planning inputs, not historical month-end snapshots.

**Why:** The current tables do not preserve enough recognition, settlement, activation, and termination history to reconstruct an authoritative prior-month as-of balance.

**How to apply:** Keep the limitation visible and identical on screen, PDF, and Excel. Do not relabel these figures as historical closing balances unless authoritative snapshots or event history are introduced.