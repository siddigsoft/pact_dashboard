---
name: Radix Select empty-value constraint
description: Radix UI Select forbids value="" on SelectItem; use a sentinel string instead.
---

# Radix Select empty-value constraint

## The rule
Never pass `value=""` to `<SelectItem>`. Radix UI reserves the empty string to mean "clear the selection and show the placeholder". Passing it throws:

> "A `<SelectItem />` must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder."

This error surfaces during **rendering** (not an event handler), so it bubbles to the nearest React ErrorBoundary.

**Why:** The thrown render error was matching the ErrorBoundary's `isHmrRace` pattern ("Cannot read properties of null" was one trigger, but the Radix error also propagated and triggered the boundary), causing a full page reload.

## How to apply
Whenever a Select needs a "none / not selected" option, use a sentinel string:

```tsx
// ✅ Correct
<Select
  value={localValue || '__none__'}
  onValueChange={v => setLocalValue(v === '__none__' ? '' : v)}
>
  <SelectItem value="__none__">— Not selected —</SelectItem>
  {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
</Select>

// ❌ Wrong — Radix throws
<Select value={localValue ?? ''}>
  <SelectItem value="">— Not selected —</SelectItem>
  ...
</Select>
```

This applies to all Radix-based Select components in the codebase (Shadcn `<Select>`, `<SelectItem>`, etc.).
