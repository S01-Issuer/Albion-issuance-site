/**
 * Cached GraphQL client with request deduplication and memoization
 */

interface CacheEntry<T> {
  data?: T;
  timestamp: number;
  promise?: Promise<T>;
}

interface ExecuteOptions {
  ttl?: number;
  skipCache?: boolean;
  fallbackUrls?: string[];
  retries?: number;
  timeoutMs?: number;
}

/**
 * Simple request throttler to prevent rate limiting
 * Limits concurrent requests and adds delay between them
 */
class RequestThrottler {
  private queue: Array<() => void> = [];
  private activeRequests = 0;
  private readonly maxConcurrent: number;
  private readonly delayBetweenRequests: number;
  private lastRequestTime = 0;

  constructor(maxConcurrent = 3, delayBetweenRequests = 100) {
    this.maxConcurrent = maxConcurrent;
    this.delayBetweenRequests = delayBetweenRequests;
  }

  async acquire(): Promise<void> {
    // Wait for minimum delay since last request
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.delayBetweenRequests) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.delayBetweenRequests - timeSinceLastRequest),
      );
    }

    // If at capacity, wait in queue
    if (this.activeRequests >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.activeRequests += 1;
    this.lastRequestTime = Date.now();
  }

  release(): void {
    this.activeRequests -= 1;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

class GraphQLCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private throttler = new RequestThrottler(3, 150); // Max 3 concurrent, 150ms between requests

  private getCacheKey(
    url: string,
    query: string,
    variables?: Record<string, unknown>,
    fallbackUrls?: string[],
  ): string {
    return JSON.stringify({ url, query, variables, fallbackUrls });
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
    options?: ExecuteOptions,
  ): Promise<T> {
    const fallbackUrls = options?.fallbackUrls?.filter(Boolean) ?? [];
    const cacheKey = this.getCacheKey(url, query, variables, fallbackUrls);

    // Skip cache if requested
    if (!options?.skipCache) {
      const cached = this.cache.get(cacheKey) as CacheEntry<T> | undefined;

      // Return cached data if valid
      if (
        cached &&
        cached.data !== undefined &&
        !this.isExpired(cached.timestamp, options?.ttl)
      ) {
        return cached.data;
      }

      // Return in-flight promise if exists (request deduplication)
      if (cached?.promise) {
        return cached.promise;
      }
    }

    // Create new request promise
    const promise = this.fetchWithFallback<T>(url, query, variables, {
      retries: options?.retries,
      timeoutMs: options?.timeoutMs,
      fallbackUrls,
    });

    // Store promise for deduplication
    this.cache.set(cacheKey, {
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

  private async fetchWithFallback<T>(
    url: string,
    query: string,
    variables: Record<string, unknown> | undefined,
    options?: Pick<ExecuteOptions, "fallbackUrls" | "retries" | "timeoutMs">,
  ): Promise<T> {
    const urlsToTry = [url, ...(options?.fallbackUrls ?? [])].filter(Boolean);
    let lastError: unknown;

    for (const candidate of urlsToTry) {
      try {
        return await this.fetchWithRetries<T>(
          candidate,
          query,
          variables,
          options,
        );
      } catch (error) {
        lastError = error;
        if (import.meta.env?.DEV) {
          console.warn(`[GraphQL] Failed against ${candidate}:`, error);
        }
      }
    }

    throw lastError ?? new Error("GraphQL request failed");
  }

  private async fetchWithRetries<T>(
    url: string,
    query: string,
    variables: Record<string, unknown> | undefined,
    options?: Pick<ExecuteOptions, "retries" | "timeoutMs">,
  ): Promise<T> {
    const maxAttempts = (options?.retries ?? 2) + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.fetchGraphQL<T>(
          url,
          query,
          variables,
          options?.timeoutMs,
        );
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          // Use longer delays to handle rate limiting (500ms base, exponential backoff)
          const delayMs = 500 * 2 ** (attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError ?? new Error("GraphQL request failed");
  }

  private async fetchGraphQL<T>(
    url: string,
    query: string,
    variables?: Record<string, unknown>,
    timeoutMs = 15_000,
  ): Promise<T> {
    const isDev = import.meta.env?.DEV ?? false;
    if (isDev) {
      console.warn(`[GraphQL] Fetching from: ${url}`);
      console.warn(`[GraphQL] Query:`, `${query.substring(0, 200)}...`);
      console.warn(`[GraphQL] Variables:`, variables);
    }

    // Acquire throttle slot before making request
    await this.throttler.acquire();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      this.throttler.release();
      // Check if error might be rate limiting (CORS errors from rate-limited responses)
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
        throw new Error("Request failed - possible rate limiting");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    // Release throttle slot after response received
    this.throttler.release();

    const json = await response.json();

    if (!response.ok) {
      console.error(`[GraphQL] HTTP error! status: ${response.status}`, json);
      // Provide more context for rate limiting
      if (response.status === 429) {
        throw new Error("Rate limited by API - please wait and try again");
      }
      throw new Error(`GraphQL HTTP error! status: ${response.status}`);
    }

    if (json.errors) {
      console.error(`[GraphQL] Query errors:`, json.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    if (isDev) {
      console.warn(
        `[GraphQL] Response data keys:`,
        Object.keys(json.data || {}),
      );
      console.warn(`[GraphQL] Response data:`, json.data);
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
  options?: ExecuteOptions,
): Promise<T> {
  return graphQLCache.execute<T>(url, query, variables, options);
}
