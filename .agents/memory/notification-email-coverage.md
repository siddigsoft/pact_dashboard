---
name: Notification email coverage gotcha
description: How to check whether a notification call site actually sends email, not just in-app
---

Some notification call sites insert directly into the notifications table (e.g. via a
`insertNotificationsToDb`-style helper) with a custom `event_type` that has no template
in the `dispatch-notification` edge function's event map. These are in-app only —
`email_sent` is hardcoded false and no email is ever sent, even though it looks like a
normal notification flow.

**Why:** The edge function (`supabase/functions/dispatch-notification/index.ts`) is the
only place that knows how to render/send email (via its `eventTemplates` and
`EVENT_TYPE_PREF_MAP`). Direct DB inserts bypass it entirely.

**How to apply:** When asked to "add email to X notification", first check whether the
call site uses `dispatchNotification()` (from `src/lib/notify.ts`) / invokes the
`dispatch-notification` edge function, or does a raw DB insert. If raw insert, either
switch to `dispatchNotification` with an event key that already exists in the edge
function's `eventTemplates` map (reuse an existing close-match event rather than
inventing a new unmapped one), or add a new template+pref-mapping to the edge function
if a truly new event type is needed.
