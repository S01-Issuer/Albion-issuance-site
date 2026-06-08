import { writable, get } from "svelte/store";
import type { ClaimsResult } from "$lib/services/ClaimsService";

interface CacheEntry {
  data: ClaimsResult;
  timestamp: number;
  address: string;
}

const MEMORY_TTL = 5 * 60 * 1000; // 5 minutes — in-memory fast path
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes — sessionStorage persistence
const STORAGE_KEY = "albion-claims-cache";

function readSessionEntry(address: string): CacheEntry | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.address !== address) return null;
    if (Date.now() - entry.timestamp > SESSION_TTL) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeSessionEntry(entry: CacheEntry) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Quota exceeded or private browsing — in-memory cache still works
  }
}

function createClaimsCache() {
  const store = writable<CacheEntry | null>(null);

  return {
    subscribe: store.subscribe,

    get(address: string): ClaimsResult | null {
      const cache = get(store);
      if (cache && cache.address === address) {
        const age = Date.now() - cache.timestamp;
        if (age <= SESSION_TTL) return cache.data;
        store.set(null);
      }

      const sessionEntry = readSessionEntry(address);
      if (sessionEntry) {
        store.set(sessionEntry);
        return sessionEntry.data;
      }

      return null;
    },

    set(address: string, data: ClaimsResult) {
      const entry: CacheEntry = {
        data,
        address,
        timestamp: Date.now(),
      };
      store.set(entry);
      writeSessionEntry(entry);
    },

    clear() {
      store.set(null);
      if (typeof sessionStorage !== "undefined") {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    },

    /** True when cached data exists and is older than the in-memory TTL (stale-while-revalidate). */
    isStale(address: string): boolean {
      const cache = get(store);
      if (cache && cache.address === address) {
        return Date.now() - cache.timestamp >= MEMORY_TTL;
      }
      const sessionEntry = readSessionEntry(address);
      if (sessionEntry) {
        return Date.now() - sessionEntry.timestamp >= MEMORY_TTL;
      }
      return false;
    },

    isValid(address: string): boolean {
      const cache = get(store);
      if (cache && cache.address === address) {
        return Date.now() - cache.timestamp < MEMORY_TTL;
      }
      return readSessionEntry(address) !== null;
    },
  };
}

export const claimsCache = createClaimsCache();
