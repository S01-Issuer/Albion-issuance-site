/**
 * @fileoverview Market Data Service
 * Handles real-time market data from AlphaVantage API
 *
 * Responsibilities:
 * - Fetch commodity prices (WTI, Brent, Natural Gas/Henry Hub)
 * - Calculate daily price changes
 * - Transform API data for UI consumption
 */

const ALPHA_VANTAGE_API_KEY = "SYWN0KX7LZB9Y0JX";
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

interface CommodityData {
  date: string;
  value: string;
}

interface AlphaVantageResponse {
  name?: string;
  interval?: string;
  unit?: string;
  data: CommodityData[];
}

interface MarketIndicator {
  price: number;
  change: number;
  currency: string;
  unit: string;
  lastUpdated: string;
}

interface MarketData {
  oilPrices: {
    wti: MarketIndicator;
    brent: MarketIndicator;
    naturalGas: MarketIndicator;
  };
  dataSource: string;
  attribution: string;
}

class MarketDataService {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

  /**
   * Fetch commodity data from AlphaVantage API
   */
  private async fetchCommodityData(
    commodity: "WTI" | "BRENT" | "NATURAL_GAS",
  ): Promise<AlphaVantageResponse | null> {
    const cacheKey = `commodity_${commodity}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const url = `${ALPHA_VANTAGE_BASE_URL}?function=${commodity}&interval=daily&apikey=${ALPHA_VANTAGE_API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Check if API returned an error
      if (data["Error Message"] || data["Note"]) {
        console.error(
          "AlphaVantage API Error:",
          data["Error Message"] || data["Note"],
        );
        return null;
      }

      // Cache the successful response
      this.cache.set(cacheKey, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      console.error(`Error fetching ${commodity} data:`, error);
      return null;
    }
  }

  /**
   * Parse AlphaVantage commodity response and extract latest price with change
   */
  private parseCommodity(data: any, unit: string): MarketIndicator | null {
    if (
      !data ||
      !data.data ||
      !Array.isArray(data.data) ||
      data.data.length < 2
    ) {
      return null;
    }

    // Debug logging
    console.log(`Parsing ${data.name || "commodity"} data:`, {
      todayDate: new Date().toISOString().split("T")[0],
      latestDataDate: data.data[0]?.date,
      dataPoints: data.data.length,
    });

    const sortedData = data.data.sort(
      (a: CommodityData, b: CommodityData) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const latest = sortedData[0];
    const previous = sortedData[1];

    if (!latest || !previous) {
      return null;
    }

    const currentPrice = parseFloat(latest.value);
    const previousPrice = parseFloat(previous.value);

    if (isNaN(currentPrice) || isNaN(previousPrice)) {
      return null;
    }

    const change = ((currentPrice - previousPrice) / previousPrice) * 100;

    return {
      price: currentPrice,
      change: parseFloat(change.toFixed(2)),
      currency: "USD",
      unit,
      lastUpdated: latest.date,
    };
  }

  /**
   * Get all market data with fallback to "N/A" if API fails
   */
  async getMarketData(): Promise<MarketData> {
    try {
      const [wtiData, brentData, naturalGasData] = await Promise.all([
        this.fetchCommodityData("WTI"),
        this.fetchCommodityData("BRENT"),
        this.fetchCommodityData("NATURAL_GAS"),
      ]);

      const wti = wtiData ? this.parseCommodity(wtiData, "barrel") : null;
      const brent = brentData ? this.parseCommodity(brentData, "barrel") : null;
      const naturalGas = naturalGasData
        ? this.parseCommodity(naturalGasData, "MMBtu")
        : null;

      return {
        oilPrices: {
          wti: wti || {
            price: 0,
            change: 0,
            currency: "USD",
            unit: "barrel",
            lastUpdated: "N/A",
          },
          brent: brent || {
            price: 0,
            change: 0,
            currency: "USD",
            unit: "barrel",
            lastUpdated: "N/A",
          },
          naturalGas: naturalGas || {
            price: 0,
            change: 0,
            currency: "USD",
            unit: "MMBtu",
            lastUpdated: "N/A",
          },
        },
        dataSource: "Alpha Vantage",
        attribution: "Powered by Alpha Vantage",
      };
    } catch (error) {
      console.error("Error getting market data:", error);

      // Return "N/A" fallback data
      return {
        oilPrices: {
          wti: {
            price: 0,
            change: 0,
            currency: "USD",
            unit: "barrel",
            lastUpdated: "N/A",
          },
          brent: {
            price: 0,
            change: 0,
            currency: "USD",
            unit: "barrel",
            lastUpdated: "N/A",
          },
          naturalGas: {
            price: 0,
            change: 0,
            currency: "USD",
            unit: "MMBtu",
            lastUpdated: "N/A",
          },
        },
        dataSource: "Alpha Vantage",
        attribution: "Powered by Alpha Vantage",
      };
    }
  }

  /**
   * Format price for display
   */
  formatPrice(price: number): string {
    if (price === 0) {
      return "N/A";
    }
    return price.toFixed(2);
  }

  /**
   * Format change percentage for display
   */
  formatChange(change: number): string {
    const sign = change >= 0 ? "+" : "";
    return `${sign}${change.toFixed(2)}%`;
  }
}

export const marketDataService = new MarketDataService();
export type { MarketData, MarketIndicator };
