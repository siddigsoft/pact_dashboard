---
name: Cycle Redirect correction safety
description: Safety rules for reversing and reopening an executed legacy source-site Redirect.
---

Automated correction of an executed legacy Redirect must fail closed unless the
source fee still matches the exact historical snapshot and its original posted
journal and bridge trace are intact. Reverse the journal, retain the executed
action, and create a new pending action rather than deleting or unexecuting
history.

Preserve the original successful bridge row and link it to the reversal. Any
fee-posting or reconciliation guard must treat a bridge as active only while its
journal remains posted and has no reversal link.

The outer correction RPC and the inner reversal-posting RPC must use the same
case-safe financial-role aliases and role sources. Passing the outer permission
check does not bypass authorization inside a nested SECURITY DEFINER function.

**Why:** Clearing inferred fee state can erase later cash activity, while keeping
a reversed bridge success as an active sentinel can suppress a future legitimate
fee journal. Competing reversal calls can also create orphan duplicate journals
unless reversal inserts serialize on the original entry. Divergent nested
authorizers can approve a correction and then fail only when its GL reversal is
posted.

**How to apply:** For any future correction flow, lock the advance, source fee,
action, and original journal; require an exact snapshot; serialize reversals on
the original journal; retain immutable audit links; and exclude corrected
actions from active allocation/offset calculations. Verify authorization at
every nested accounting boundary with the same normalized role contract.