---
name: Safe legacy date rendering
description: Protect UI date formatting from incomplete historical database records.
---

Use a safe ISO-date formatter for historical or externally sourced values before passing them to date-fns `parseISO`. Missing or malformed values must render as a neutral placeholder rather than throwing.

**Why:** `parseISO(undefined)` surfaces as a generic “Cannot read properties of undefined (reading 'split')” runtime error, which obscures the actual bad date and can crash an otherwise usable page.

**How to apply:** Use this protection in lists, filters, dialogs, exports, and reports whenever a database date may predate current constraints or come from a nullable source.