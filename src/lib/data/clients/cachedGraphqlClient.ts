/**
 * Cached GraphQL client with request deduplication and memoization
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  promise?: Promise<T>;
}

class GraphQLCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  private getCacheKey(
    url: string,
    query: string,
    variables?: Record<string, unknown>,
  ): string {
    return JSON.stringify({ url, query, variables });
  }

  private isExpired(
    timestamp: number,
    ttl: number = this.DEFAULT_TTL,
  ): boolean {
    return Date.now() - timestamp > ttl;
  }

  async execute<T>(
    url: string,
    query: string,
    variables?: Record<string, unknown>,
    options?: { ttl?: number; skipCache?: boolean },
  ): Promise<T> {
    const cacheKey = this.getCacheKey(url, query, variables);

    // Skip cache if requested
    if (!options?.skipCache) {
      const cached = this.cache.get(cacheKey);

      // Return cached data if valid
      if (cached && !this.isExpired(cached.timestamp, options?.ttl)) {
        return cached.data;
      }

      // Return in-flight promise if exists (request deduplication)
      if (cached?.promise) {
        return cached.promise;
      }
    }

    // Create new request promise
    const promise = this.fetchGraphQL<T>(url, query, variables);

    // Store promise for deduplication
    this.cache.set(cacheKey, {
      data: null,
      timestamp: Date.now(),
      promise,
    });

    try {
      const data = await promise;

      // Update cache with actual data
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });

      return data;
    } catch (error) {
      // Remove failed request from cache
      this.cache.delete(cacheKey);
      throw error;
    }
  }

  private async fetchGraphQL<T>(
    url: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });

    const json = await response.json();

    if (!response.ok) {
      console.error(`[GraphQL] HTTP error! status: ${response.status}`, json);
      throw new Error(`GraphQL HTTP error! status: ${response.status}`);
    }

    if (json.errors) {
      console.error(`[GraphQL] Query errors:`, json.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    return json.data as T;
  }

  clearCache(): void {
    this.cache.clear();
  }

  invalidate(url?: string, query?: string): void {
    if (!url && !query) {
      this.clearCache();
      return;
    }

    for (const key of this.cache.keys()) {
      const parsed = JSON.parse(key);
      if (
        (!url || parsed.url === url) &&
        (!query || parsed.query.includes(query))
      ) {
        this.cache.delete(key);
      }
    }
  }
}

// Export singleton instance
export const graphQLCache = new GraphQLCache();

// Export convenience function for backwards compatibility
export async function executeGraphQL<T>(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return graphQLCache.execute<T>(url, query, variables);
}
