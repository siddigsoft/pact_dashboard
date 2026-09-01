# PACT database evaluation

Evaluated read-only through Supabase MCP on 2026-08-31. Project `pactdb` (`abznugnirnlrqnnfkein`), PostgreSQL 17.6, region `eu-north-1`.

## Executive assessment

The database is operationally healthy today, with excellent cache efficiency and no live blocking. It is not connection-starved. Its main risks are query-shape amplification, RLS/policy fan-out, excessive schema breadth, and security exposure. These will become more visible as data and concurrency grow.

Overall performance grade: **B- today / C at materially higher load**.

The most important performance finding is `get_monitoring_actions`: it scans a wide ten-branch `UNION ALL` view, converts every source row to JSONB, applies optional filters outside that view, and performs a global sort. Its observed calls average about 506 ms and have generated roughly 2.1 million temporary blocks (approximately 16 GiB at PostgreSQL's usual 8 KiB block size). This is the clearest disk-spill and latency bottleneck.

## Evidence snapshot

- Database: 969 MiB total; public relations account for approximately 539 MiB.
- Connections: 50 of 90 occupied at capture time. Thirty-one belonged to idle PostgREST sessions; eleven more were idle Realtime/Storage sessions. Only normal replication and the diagnostic request were active.
- Cache: 100.00% database-level cumulative hit rate, 99.96% table hit rate, 99.92% index hit rate.
- Cumulative stress: 17 deadlocks, 17 GiB temporary writes, 97,855 rollbacks against 2,072,868 commits. Statistics had no reset timestamp, so these span an unknown long period.
- Schema: 412 public tables. Only 31 had positive exact/estimated rows through the compact table API; PostgreSQL planner estimates regarded 92 as non-empty. Either measure indicates unusually broad schema relative to active data.
- Advisors: 2,318 performance findings and 827 security findings.

## Connection path and bottlenecks

1. Client requests enter Supabase PostgREST. Thirty-one pooled PostgREST sessions were idle, so pool occupancy is not currently a throughput constraint.
2. PostgREST invokes tables/RPCs under `authenticator`. Complex requests evaluate RLS policies. Supabase found 472 non-init-plan auth expressions and 899 overlapping permissive-policy cases, increasing repeated authorization work.
3. `get_monitoring_actions` reads `dashboard_actions`, a union of `mmp_files`, `mmp_site_entries`, `site_visits`, `site_visit_cost_submissions`, `operational_cost_submissions`, `down_payment_requests`, `wallet_transactions`, `feedback`, and `approval_requests`, with repeated joins to `profiles` and `hubs`.
4. Every branch emits `to_jsonb(row.*)`. Several source rows are wide. The global result is then filtered and sorted, creating memory pressure and temporary-file spills.
5. `mmp_site_entries` is itself heavily indexed and policy-protected. It has roughly 5,640 rows but many indexes, so writes carry disproportionate index maintenance cost.

## Highest observed SQL costs

The values below are cumulative `pg_stat_statements` observations, not a controlled benchmark.

| Workload | Calls | Mean | Maximum | Total time | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| Realtime change feed | 793,787 | 13.21 ms | 3,309 ms | 10,484 s | High volume platform work; acceptable mean |
| `mmp_site_entries` PostgREST read | 15,604 | 111.27 ms | 667 ms | 1,736 s | Main repeated application read cost |
| `reopen_down_payment_after_reversal_rpc` | 264 | 781.03 ms | 2,885 ms | 206 s | Slow transactional RPC; lock and loop heavy |
| `get_monitoring_actions` | 271 | 505.64 ms | 934 ms | 137 s | Largest temp spill; highest optimization priority |
| `get_advance_coverage_data` | 1,386 | 67.64 ms | 578 ms | 94 s | Lateral latest-payment lookup per site |
| Payment-recording RPC | 215 | 420.23 ms | 4,188 ms | 90 s | Transactional path with high outlier latency |

## Root-cause evaluation

### Monitoring query

`dashboard_actions` is convenient but structurally expensive. The outer function's `p_type`, date, and sender filters cannot reliably prevent work in unrelated union branches. `to_jsonb(source.*)` materializes wide records before the caller knows which details it needs. Sorting all branches by `created_at` without a limit compounds memory usage. The function's declared `ROWS 1000` and generic `COST 100` provide little planning guidance because it is seen as a function scan from outside.

Recommended redesign:

1. Push `p_type`, `p_from`, and `p_to` into each applicable branch.
2. Replace the monolithic view with a parameterized SQL function or a compact normalized activity table populated by triggers/jobs.
3. Return summary columns first; load `details` only for a selected action.
4. Add keyset pagination (`created_at`, `action_id`) and a hard page limit.
5. Avoid `ILIKE '%sender%'` as the default search path; use normalized sender IDs or a trigram index only if free-text search is required.
6. Benchmark with representative parameters using `EXPLAIN (ANALYZE, BUFFERS, WAL)` on a development branch.

### RLS overhead

RLS is both a security layer and part of every query plan. The advisor found 472 policies that repeatedly evaluate authentication helpers and 899 overlapping permissive-policy combinations. The most policy-heavy tables include `wallet_transactions` (12 policies), `profiles` (11), and `wallets` (9).

Recommended redesign:

- Replace row-by-row calls such as `auth.uid()` with `(select auth.uid())` where semantically valid.
- Merge policies that grant the same operation to the same role.
- Keep ownership predicates; `TO authenticated` alone is authentication, not authorization.
- For updates, retain both `USING` and `WITH CHECK`.
- Benchmark policy changes as authenticated users, not as the database owner.

### Index portfolio

Supabase reported 608 foreign keys without a suitable covering index, 331 unused-index signals, and seven identical index pairs. These findings point in both directions: important joins need indexes, while excess indexes slow writes and consume cache/disk.

Action order:

1. Remove only the seven confirmed identical pairs after checking which names are referenced by migrations or tooling.
2. Add FK indexes only on populated/high-traffic tables and only when plans demonstrate joins, cascades, or filters need them.
3. Review the unusually large index portfolio on `mmp_site_entries` before adding more.
4. Never drop a primary-key, unique-constraint, or infrequently used operational index solely because `idx_scan = 0`.

### Maintenance and storage

`auth.refresh_tokens` and `storage.objects` showed about 50% dead tuples; `mmp_site_entries` and `acct_journal_entries` were around 14%. Public tables should be checked for update churn and autovacuum cadence. Supabase-managed `auth` and `storage` schema configuration should not be altered without platform guidance.

## Security gate before performance rollout

Thirteen public tables had RLS disabled, including payroll, employee salary configuration, project documents, access overrides, and pre-fund audit data. Supabase also reported 16 security-definer views, 158 functions with mutable search paths, and more than 300 executable security-definer function grants per API role.

Treat this as a release blocker. Create and test policies first, then enable RLS. Do not bulk-enable RLS without policies. Audit every public `SECURITY DEFINER` function for an internal authorization check and revoke `PUBLIC`/API execution when it is not an intentional endpoint.

## Prioritized remediation program

### Phase 0 — establish safe measurement (1 day)

- Run the accompanying diagnostic SQL and preserve its results.
- Create a Supabase development branch.
- Capture representative dashboard, MMP, payment, and auth workflows.
- Define targets: p95 read latency under 250 ms, p95 RPC latency under 500 ms, no blocked sessions, cache hit above 99%, and no critical security advisors.

### Phase 1 — security containment (2–5 days)

- Design and test policies for the 13 RLS-disabled tables.
- Audit privileged functions/views and execution grants.
- Replace authorization that reads editable user metadata.
- Rerun security advisors and application authorization tests.

### Phase 2 — monitoring-path redesign (2–4 days)

- Add pagination and remove eager JSONB details.
- Push filters into individual source queries.
- Compare the refactored plan and temp-block usage against the current function.
- Deploy only after authenticated regression tests.

Expected improvement: 60–90% lower monitoring latency and near-elimination of its temp spill, depending on selected date ranges and page size.

### Phase 3 — high-value query tuning (2–4 days)

- Tune the repeated `mmp_site_entries` query.
- Review the lateral lookup in `get_advance_coverage_data`; an index beginning with `(mmp_site_entry_id, created_at desc)` is a candidate only after plan verification.
- Review `reopen_down_payment_after_reversal_rpc` for loop count, nested RPC cost, JSONB predicates, and lock duration.
- Profile the payment-recording RPC's 4.2-second maximum.

### Phase 4 — policy and index consolidation (3–7 days)

- Consolidate overlapping policies and use init-plan-safe auth expressions.
- Remove verified duplicate indexes.
- Add a small set of plan-proven FK indexes on active tables.
- Recheck write latency after each index batch.

### Phase 5 — schema lifecycle (ongoing)

- Classify the hundreds of empty tables as active, planned, superseded, or removable.
- Archive/remove only through reviewed migrations.
- Establish migration ownership and a quarterly advisor/index review.

## Definition of done

- No critical Supabase security findings.
- Monitoring query p95 below 250 ms with negligible temp writes.
- Connection usage remains below 70% under peak load, with no sustained active waits.
- Duplicate indexes removed; every new index justified by a captured plan.
- RLS performance warnings materially reduced without changing authorization semantics.
- A seven-day post-deployment `pg_stat_statements` window confirms lower total and mean execution time.

