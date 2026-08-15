import { useEffect, useRef } from 'react';
import { useUser } from '@/context/user/UserContext';

// How long to wait before refreshing GPS again (1 hour).
// Prevents hammering the browser geolocation API on every page navigation.
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

const storageKey = (userId: string) => `PACT__location_auto_${userId}`;

/**
 * Silently refreshes the current user's GPS coordinates once per session
 * (rate-limited to once per hour) if they have previously consented to
 * location sharing (location.isSharing === true).
 *
 * Does nothing for users who have never consented — those users see the
 * LocationPermissionPrompt dialog instead.
 *
 * Call this hook once in the Dashboard (or any top-level authenticated page).
 */
export function useAutoLocationRefresh() {
  const { currentUser, updateUserLocation } = useUser();
  const hasAttempted = useRef(false);

  useEffect(() => {
    // Guard: only run once per mount, only when user is loaded
    if (hasAttempted.current) return;
    if (!currentUser?.id) return;

    // Only auto-refresh for users who already consented to sharing
    if (!currentUser.location?.isSharing) return;

    // Browser must support geolocation
    if (!navigator.geolocation) return;

    // Rate-limit: skip if we refreshed less than REFRESH_INTERVAL_MS ago
    const key = storageKey(currentUser.id);
    let lastRun = 0;
    try {
      lastRun = parseInt(localStorage.getItem(key) || '0', 10);
    } catch { /* ignore */ }

    if (Date.now() - lastRun < REFRESH_INTERVAL_MS) return;

    // Mark attempt so we don't fire again during this mount cycle
    hasAttempted.current = true;

    // Store the timestamp immediately so concurrent renders don't double-fire
    try {
      localStorage.setItem(key, Date.now().toString());
    } catch { /* ignore */ }

    // Silent capture — low accuracy is fine for presence updates
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        try {
          await updateUserLocation(latitude, longitude, accuracy);
          console.debug('[AutoLocation] GPS refreshed silently on login/session start');
        } catch (e) {
          console.debug('[AutoLocation] updateUserLocation failed:', e);
        }
      },
      (err) => {
        // Non-fatal — the stored coords remain from the last successful update
        console.debug('[AutoLocation] Geolocation error:', err.message);
        // Roll back the timestamp so the next page load retries
        try {
          localStorage.setItem(key, '0');
        } catch { /* ignore */ }
      },
      {
        enableHighAccuracy: false, // fast fix; saves battery and reduces timeout risk
        timeout: 15_000,
        maximumAge: 5 * 60 * 1000, // accept a cached fix up to 5 minutes old
      }
    );
  }, [currentUser?.id, currentUser?.location?.isSharing, updateUserLocation]);
}
