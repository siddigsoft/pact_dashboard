// Temporary shims for modules that the editor may report as missing until the TS
// server reloads. These are safe fallbacks and will be picked up by the app
// tsconfig because it includes `src`.

declare module '@/services/NotificationService';

// You can add other shims here if the editor reports transient module-not-found
// diagnostics for alias imports. Prefer implementing the real module instead of
// relying on shims long-term.
