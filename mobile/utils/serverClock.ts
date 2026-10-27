import { buildApiHeaders, getApiBaseUrl } from "../api/axios";

const RESYNC_AFTER_MS = 60000;
const REQUEST_TIMEOUT_MS = 10000;
let anchor: { serverMs: number; monotonicMs: number } | null = null;
let pendingSync: Promise<boolean> | null = null;
let version = 0;
const listeners = new Set<() => void>();

export const hasServerTime = () => anchor !== null;
export const getServerClockVersion = () => version;
export const subscribeServerClock = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function getServerTimeMs(): number | null {
  if (!anchor) return null;
  // Changing the phone's date/time cannot move this clock after synchronization.
  return anchor.serverMs + Math.max(0, performance.now() - anchor.monotonicMs);
}

export function getServerNow(): Date {
  const now = getServerTimeMs();
  if (now === null) throw new Error("Connect to the server to synchronize the time first.");
  return new Date(now);
}

// Calendar controls use local Date objects; derive their date from Manila,
// rather than allowing the phone's timezone to change the current day/year.
export function getServerCalendarDate(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(getServerNow());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(value("year"), value("month") - 1, value("day"));
}

export function syncServerClock(force = false): Promise<boolean> {
  if (pendingSync) return pendingSync;
  if (!force && anchor && performance.now() - anchor.monotonicMs < RESYNC_AFTER_MS) {
    return Promise.resolve(true);
  }

  pendingSync = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = performance.now();
    try {
      const response = await fetch(`${getApiBaseUrl()}/server-time?request=${startedAt}`, {
        headers: buildApiHeaders(), signal: controller.signal,
      });
      if (!response.ok) return false;
      const data = await response.json();
      const receivedAt = performance.now();
      if (typeof data?.timestamp_ms !== "number" || !Number.isFinite(data.timestamp_ms)
        || data.timestamp_ms <= 0 || !Number.isFinite(new Date(data.timestamp_ms).getTime())) {
        return false;
      }
      anchor = {
        serverMs: data.timestamp_ms + Math.max(0, receivedAt - startedAt) / 2,
        monotonicMs: receivedAt,
      };
      version += 1;
      listeners.forEach((listener) => listener());
      return true;
    } catch {
      // Keep advancing the last server time while offline. Do not fall back
      // to the phone's wall clock or replace an existing anchor on failure.
      return false;
    } finally {
      clearTimeout(timeout);
    }
  })().finally(() => { pendingSync = null; });
  return pendingSync;
}
