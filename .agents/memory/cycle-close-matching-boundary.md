---
name: Cycle Close matching boundary
description: Responsibility split between WFP row matching and uncovered MMP-site decisions.
---

Cycle Close Step 2 must give every uploaded WFP row one explicit disposition and block duplicate confirmed site links. MMP sites not confirmed by WFP are summarized there but receive their coverage reasons only in Step 3.

**Why:** Mixing both populations in one screen created contradictory gates, duplicate action queues, and cases where WFP anomalies or uncovered MMP sites could disappear between steps.

**How to apply:** Keep WFP submission matching, duplicates, and extra/rejected submissions in Step 2. Preserve the resulting unmatched MMP site IDs for Step 3, which is the sole owner of uncovered reasons and overrides.