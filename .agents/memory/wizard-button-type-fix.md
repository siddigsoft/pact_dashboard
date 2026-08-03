---
name: Wizard button type="button" fix pattern
description: sed-based type="button" injection misses multiline <Button> tags; how to catch them all.
---

## Rule
When adding `type="button"` to all Shadcn `<Button>` components in a file, `sed 's/<Button /<Button type="button" /g'` only patches single-line opening tags (`<Button variant=...`). Multiline tags like:

```tsx
<Button
  onClick={...}
>
```

…are NOT caught because the tag ends with a newline, not a space.

**Why:** The regex matches `<Button ` (Button + space). A newline-terminated `<Button\n` never matches.

**How to apply:**
After running the sed command, always follow up with:
```bash
grep -n "^[[:space:]]*<Button$" src/path/to/file.tsx
```
to find any missed multiline buttons, then add `type="button"` manually to each one.

The wizard (CycleCloseWizard + all Step*.tsx files) had exactly this problem: sed fixed single-line buttons but left "Start Guided Close →", "Export Cycle Summary", "Run Matching", and the close (×) button all missing `type="button"`, causing them to submit the MMP form silently.
