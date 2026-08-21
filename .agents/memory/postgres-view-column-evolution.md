---
name: PostgreSQL view column evolution
description: Safely evolve deployed PostgreSQL views without breaking CREATE OR REPLACE VIEW.
---

When a deployed view needs additional output fields, preserve every established
column's ordinal position, name, and type. Append the new fields at the end of
the projection instead of inserting or reordering them.

**Why:** PostgreSQL matches existing view columns by ordinal position during
`CREATE OR REPLACE VIEW`. Moving a field makes it interpret the change as a
rename or type change and rejects the migration; dropping a view can also
silently remove dependent views and functions.

**How to apply:** Before changing a view used by prior migrations, inspect its
existing output order. Keep that projection intact, append fields, and add a
regression case that starts from the older view definition. Use an explicit,
fully planned rebuild only when a breaking change is genuinely unavoidable.