import { writable, get } from "svelte/store";
import type { ClaimsResult } from "$lib/services/ClaimsService";

interface CacheEntry {
  data: ClaimsResult;
  timestamp: number;
  address: string;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function createClaimsCache() {
  const store = writable<CacheEntry | null>(null);

  return {
    subscribe: store.subscribe,

    get(address: string): ClaimsResult | null {
      const cache = get(store);
      if (!cache || cache.address !== address) return null;

      const age = Date.now() - cache.timestamp;
      if (age > CACHE_DURATION) {
        store.set(null);
        return null;
      }

      return cache.data;
    },

    set(address: string, data: ClaimsResult) {
      store.set({
        data,
        address,
        timestamp: Date.now(),
      });
    },

    clear() {
      store.set(null);
    },

    isValid(address: string): boolean {
      const cache = get(store);
      if (!cache || cache.address !== address) return false;
      return Date.now() - cache.timestamp < CACHE_DURATION;
    },
  };
}

export const claimsCache = createClaimsCache();
