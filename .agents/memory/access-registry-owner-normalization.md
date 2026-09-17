---
name: Access registry owner normalization
description: Compatibility rule for assigning canonical page or hub-tab owners to persisted access-control keys.
---

Filter and column entries must resolve to one canonical page or `hub:tab` owner. Do not derive persisted filter keys or column storage slugs from that owner when a legacy identity is already in use; ownership and storage identity are separate concerns.

**Why:** Saved role and user visibility rules reference existing filter keys and column page slugs. Renaming either identity while normalizing its owner silently disconnects those policies and may expose hidden fields.

**How to apply:** When moving a legacy control under a canonical hub tab, retain its runtime storage identity and change only its owner metadata. Test the storage identity against the consuming hook. Treat declared page redirects as the explicit supported-alias list; do not silently accept undeclared aliases.