---
name: Access workspace inventory boundary
description: Design and security boundary for the hybrid Security & Access Management workspace.
---

Use the hybrid workspace structure: security overview, effective access by person, role and policy baselines, role comparison, and registry review. Registry counts and mappings are configuration metadata only; never label them as verified enforcement.

**Why:** The workspace must help administrators manage every registered target without implying that UI registration proves RLS, RPC, route-guard, or backend export enforcement.

**How to apply:** Keep effective-access explanations explicit about inheritance and overrides, normalize every Super Admin role alias before allowing edits, and describe backend enforcement conservatively until its actual data boundary has been verified.