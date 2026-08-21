---
name: Wallet payment idempotency identity
description: Rules for retry responses from wallet-backed Down Payment payment operations.
---

Wallet-backed payment retries must return the original immutable Pre-Fund transaction ID as well as the wallet transaction ID; an `idempotent: true` flag alone is insufficient for callers to reconcile the retry with its first response.

**Why:** Transport retries can arrive after a payment committed but before the client received its response. Returning only wallet evidence leaves payment callers unable to identify the already-posted ledger event.

**How to apply:** Whenever a wallet-backed wrapper accepts an operation/idempotency key, look up and return the original ledger event identity in its duplicate branch, and assert first/retry identity equality in the disposable PostgreSQL regression harness.