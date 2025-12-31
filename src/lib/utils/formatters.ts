/**
 * @fileoverview Centralized formatting utilities
 *
 * This module provides consistent formatting functions used throughout the application.
 * Only complex or business-specific formatting logic should be centralized here.
 *
 * For simple cases, prefer native JavaScript methods:
 * - Use `value.toLocaleString()` for basic number formatting with commas
 * - Use `value.toFixed(n)` for simple decimal formatting
 *
 * This module focuses on:
 * - Currency: Complex USD formatting with options (minimumFractionDigits, compact notation)
 * - Business-specific dates: Converting "YYYY-MM" to "MMM YYYY" format
 * - Percentages: With special formatting options (sign display, decimal handling)
 * - Tokens: Blockchain-specific formatting with decimal precision
 * - Domain-specific: Depth formatting, dollar amounts without cents
 */

/**
 * Formats a number as USD currency
 * @param amount - The amount to format
 * @param options - Optional formatting options
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(
  amount: number,
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    compact?: boolean;
  } = {},
): string {
  const {
    minimumFractionDigits = amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits = 2,
    compact = false,
  } = options;

  if (compact && Math.abs(amount) >= 1000000) {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
    return formatted.replace("$", "US$");
  }

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);
  return formatted.replace("$", "US$");
}

/**
 * Formats a date string from "YYYY-MM" to "MMM YYYY"
 * @param dateStr - Date string in "YYYY-MM" format
 * @returns Formatted date string (e.g., "Jan 2024")
 */
export function formatEndDate(dateStr: string): string {
  if (!dateStr || dateStr === "undefined") return "TBD";

  const parts = dateStr.split("-");
  if (parts.length < 2) return "TBD";

  const [year, month] = parts;
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const monthIndex = parseInt(month) - 1;
  if (monthIndex < 0 || monthIndex >= 12) return "TBD";

  return `${monthNames[monthIndex]} ${year}`;
}

/**
 * Formats a date to a localized string
 * @param date - Date object or date string
 * @param format - Format style ('short', 'medium', 'long')
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | string,
  format: "short" | "medium" | "long" = "medium",
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return "Invalid Date";

  const options: Intl.DateTimeFormatOptions = {
    short: {
      month: "numeric" as const,
      day: "numeric" as const,
      year: "numeric" as const,
    },
    medium: {
      month: "short" as const,
      day: "numeric" as const,
      year: "numeric" as const,
    },
    long: {
      month: "long" as const,
      day: "numeric" as const,
      year: "numeric" as const,
    },
  }[format];

  return new Intl.DateTimeFormat("en-US", options).format(dateObj);
}

/**
 * Formats a number with thousand separators
 * @param value - Number to format
 * @param options - Formatting options
 * @returns Formatted number string (e.g., "1,234.56")
 */
export function formatNumber(
  value: number,
  options: {
    decimals?: number;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  } = {},
): string {
  const {
    decimals,
    minimumFractionDigits = decimals ?? 0,
    maximumFractionDigits = decimals ?? 0,
  } = options;

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

/**
 * Formats a percentage value
 * @param value - Percentage value (e.g., 0.1234 for 12.34%)
 * @param options - Formatting options
 * @returns Formatted percentage string
 */
export function formatPercentage(
  value: number,
  options: {
    decimals?: number;
    showSign?: boolean;
    isAlreadyPercentage?: boolean;
  } = {},
): string {
  const {
    decimals = 2,
    showSign = false,
    isAlreadyPercentage = false,
  } = options;

  // If value is already a percentage (e.g., 12.34 instead of 0.1234)
  const percentValue = isAlreadyPercentage ? value / 100 : value;

  if (showSign && value > 0) {
    return (
      "+" +
      new Intl.NumberFormat("en-US", {
        style: "percent",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(percentValue)
    );
  }

  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(percentValue);
}

/**
 * Simple percentage formatting for display values
 * @param value - Percentage value (already in percentage form, e.g., 12.5 for 12.5%)
 * @param decimals - Number of decimal places
 * @returns Formatted percentage string (e.g., "12.5%")
 */
export function formatSimplePercentage(
  value: number,
  decimals: number = 1,
): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Formats blockchain token amounts with proper decimal handling
 * @param amount - Raw token amount (as string for precision)
 * @param decimals - Token decimals (default: 18 for ETH)
 * @returns Formatted token amount
 */
export function formatTokenAmount(
  amount: string | number,
  decimals: number = 18,
): string {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  const adjustedValue = value / Math.pow(10, decimals);

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
    // Remove trailing zeros
    trailingZeroDisplay: "stripIfInteger",
  } as Intl.NumberFormatOptions).format(adjustedValue);
}

/**
 * Formats large numbers in compact notation
 * @param value - Number to format
 * @param decimals - Maximum decimal places in compact form
 * @returns Formatted string (e.g., "1.2M", "3.5K")
 */
export function formatCompactNumber(
  value: number,
  decimals: number = 1,
): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Smart number formatting for UI display
 * Automatically uses compact notation for large numbers to prevent overflow
 * @param value - Number to format
 * @param options - Formatting options
 * @returns Formatted string with appropriate suffix
 */
export function formatSmartNumber(
  value: number,
  options: {
    threshold?: number; // When to switch to compact (default: 10000)
    decimals?: number; // Decimal places for compact format (default: 1)
    forceCompact?: boolean; // Always use compact notation
    prefix?: string; // Prefix like $ for currency
    suffix?: string; // Suffix like % for percentage
  } = {},
): string {
  const {
    threshold = 10000,
    decimals = 1,
    forceCompact = false,
    prefix = "",
    suffix = "",
  } = options;

  if (forceCompact || Math.abs(value) >= threshold) {
    const formatted = formatCompactNumber(value, decimals);
    return `${prefix}${formatted}${suffix}`;
  }

  // For smaller numbers, use regular formatting with commas
  const formatted = formatNumber(value);
  return `${prefix}${formatted}${suffix}`;
}

/**
 * Format token supply amounts with smart abbreviation
 * @param value - Token amount (already adjusted for decimals)
 * @param options - Formatting options
 * @returns Formatted token amount
 */
export function formatTokenSupply(
  value: number | string,
  options: {
    decimals?: number;
    forceCompact?: boolean;
  } = {},
): string {
  const numValue = typeof value === "string" ? parseFloat(value) : value;

  // For very large token supplies, always use compact
  if (numValue >= 1000000) {
    return formatCompactNumber(numValue, options.decimals ?? 1);
  }

  // For medium amounts, use smart formatting
  return formatSmartNumber(numValue, {
    threshold: 10000,
    decimals: options.decimals ?? 1,
    forceCompact: options.forceCompact,
  });
}

/**
 * Formats a value with optional prefix and suffix
 * Useful for chart tooltips and custom displays
 * @param value - Value to format
 * @param prefix - String to prepend
 * @param suffix - String to append
 * @returns Formatted string
 */
export function formatWithAffixes(
  value: string | number,
  prefix: string = "",
  suffix: string = "",
): string {
  const formattedValue =
    typeof value === "number" ? value.toLocaleString("en-US") : value;

  return `${prefix}${formattedValue}${suffix}`;
}

/**
 * Formats a depth value in meters
 * @param depth - Depth in meters
 * @returns Formatted depth string (e.g., "3,200m")
 */
export function formatDepth(depth: number): string {
  return `${formatNumber(depth)}m`;
}

/**
 * Formats a dollar amount without cents
 * @param amount - Amount to format
 * @returns Formatted string (e.g., "$1,234")
 */
export function formatDollarAmount(amount: number): string {
  return `$${formatNumber(Math.round(amount))}`;
}

/**
 * Utility type guards for safe formatting
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value) && isFinite(value);
}

export function isValidDate(date: unknown): boolean {
  if (!date) return false;
  const dateObj = date instanceof Date ? date : new Date(date as string);
  return !isNaN(dateObj.getTime());
}

export function formatAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatHash(
  value: string,
  options: { start?: number; end?: number } = {},
): string {
  if (!value) {
    return "";
  }

  const { start = 6, end = 4 } = options;

  if (value.length <= start + end) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

/**
 * Smart return formatting that switches from % to x multiplier for large values
 * @param returnPercentage - Return value as percentage (e.g., 150 for 150%)
 * @param options - Formatting options
 * @returns Formatted return string
 */
/**
 * Formats a date string from "YYYY-MM" to "1st MMM YYYY"
 * @param dateStr - Date string in "YYYY-MM" format
 * @returns Formatted date string (e.g., "1st Nov 2025")
 */
export function formatAccrualStartDate(dateStr: string): string {
  if (!dateStr || dateStr === "undefined") return "TBD";

  const parts = dateStr.split("-");
  if (parts.length < 2) return "TBD";

  const [year, month] = parts;
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const monthIndex = parseInt(month) - 1;
  if (monthIndex < 0 || monthIndex >= 12) return "TBD";

  return `1st ${monthNames[monthIndex]} ${year}`;
}

/**
 * Calculates the estimated first payout date from a "YYYY-MM" date string
 * First payout is 2 months after the accrual start, on the first Monday of that month
 * @param dateStr - Date string in "YYYY-MM" format
 * @returns Formatted date string (e.g., "5th Jan 2026")
 */
export function formatEstFirstPayout(dateStr: string): string {
  if (!dateStr || dateStr === "undefined") return "TBD";

  const parts = dateStr.split("-");
  if (parts.length < 2) return "TBD";

  const [year, month] = parts;
  const monthIndex = parseInt(month) - 1;
  if (monthIndex < 0 || monthIndex >= 12) return "TBD";

  // Add 2 months
  let payoutMonth = monthIndex + 2;
  let payoutYear = parseInt(year);
  if (payoutMonth >= 12) {
    payoutMonth -= 12;
    payoutYear += 1;
  }

  // Find the first Monday of that month
  const firstOfMonth = new Date(payoutYear, payoutMonth, 1);
  const dayOfWeek = firstOfMonth.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Calculate days until first Monday
  // If day is Sunday (0), first Monday is day 2
  // If day is Monday (1), first Monday is day 1
  // If day is Tuesday (2), first Monday is day 7
  // etc.
  let firstMondayDay: number;
  if (dayOfWeek === 0) {
    firstMondayDay = 2; // Sunday -> Monday is next day + 1
  } else if (dayOfWeek === 1) {
    firstMondayDay = 1; // Already Monday
  } else {
    firstMondayDay = 1 + (8 - dayOfWeek); // Days until next Monday
  }

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // Format ordinal suffix
  const ordinalSuffix = (n: number): string => {
    if (n > 3 && n < 21) return "th";
    switch (n % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  };

  return `${firstMondayDay}${ordinalSuffix(firstMondayDay)} ${monthNames[payoutMonth]} ${payoutYear}`;
}

/**
 * Get the first Monday of a given month
 */
function getFirstMondayOfMonth(year: number, month: number): Date {
  const firstOfMonth = new Date(year, month, 1);
  const dayOfWeek = firstOfMonth.getDay();
  let firstMondayDay: number;
  if (dayOfWeek === 0) {
    firstMondayDay = 2; // Sunday -> Monday is next day
  } else if (dayOfWeek === 1) {
    firstMondayDay = 1; // Already Monday
  } else {
    firstMondayDay = 1 + (8 - dayOfWeek); // Days until next Monday
  }
  return new Date(year, month, firstMondayDay);
}

/**
 * Get the Monday on or after a given date
 */
function getMondayOnOrAfter(date: Date): Date {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 1) return new Date(date); // Already Monday
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const result = new Date(date);
  result.setDate(result.getDate() + daysUntilMonday);
  return result;
}

/**
 * Calculate the expected next payout date for a token
 * Returns the later of:
 * 1. First payout date (first Monday, 2 months after firstPaymentDate)
 * 2. Monday after the next revenue report due date
 *
 * @param firstPaymentDate - Token's first payment date in YYYY-MM format
 * @param latestRevenueMonth - Most recent revenue report month in YYYY-MM format
 * @param cashflowStartDate - Asset's cashflow start date in YYYY-MM format (fallback)
 * @returns Date object or null if unable to calculate
 */
export function calculateExpectedNextPayout(
  firstPaymentDate: string | undefined,
  latestRevenueMonth: string | undefined,
  cashflowStartDate: string | undefined,
): Date | null {
  const now = new Date();

  // Calculate first payout date (first Monday, 2 months after firstPaymentDate)
  let firstPayoutDate: Date | null = null;
  if (firstPaymentDate) {
    const parts = firstPaymentDate.split("-");
    if (parts.length >= 2) {
      const year = parseInt(parts[0]);
      const monthIndex = parseInt(parts[1]) - 1;
      if (!isNaN(year) && monthIndex >= 0 && monthIndex < 12) {
        let payoutMonth = monthIndex + 2;
        let payoutYear = year;
        if (payoutMonth >= 12) {
          payoutMonth -= 12;
          payoutYear += 1;
        }
        firstPayoutDate = getFirstMondayOfMonth(payoutYear, payoutMonth);
      }
    }
  }

  // Calculate next revenue report payout date
  // Use latest revenue month, or fall back to cashflowStartDate, or firstPaymentDate
  let nextReportPayoutDate: Date | null = null;
  const baseMonth = latestRevenueMonth || cashflowStartDate || firstPaymentDate;
  if (baseMonth) {
    const parts = baseMonth.split("-");
    if (parts.length >= 2) {
      const year = parseInt(parts[0]);
      const monthIndex = parseInt(parts[1]) - 1;
      if (!isNaN(year) && monthIndex >= 0 && monthIndex < 12) {
        // If we have a latest revenue month, add 2 months; otherwise add 1 month
        const offsetMonths = latestRevenueMonth ? 2 : 1;
        // Get end of target month (day 0 of month X gives last day of month X-1)
        // So month + offset + 0 days = last day of (month + offset - 1)
        const endOfTargetMonth = new Date(year, monthIndex + offsetMonths, 0);
        // Add 30 days to get past the report due date
        endOfTargetMonth.setDate(endOfTargetMonth.getDate() + 30);
        // Get the Monday on or after
        nextReportPayoutDate = getMondayOnOrAfter(endOfTargetMonth);
      }
    }
  }

  // Return the later of the two dates (but must be in the future)
  let result: Date | null = null;

  if (firstPayoutDate && nextReportPayoutDate) {
    result = firstPayoutDate > nextReportPayoutDate ? firstPayoutDate : nextReportPayoutDate;
  } else {
    result = firstPayoutDate || nextReportPayoutDate;
  }

  // If the calculated date is in the past, return null (or we could calculate the next one)
  if (result && result < now) {
    // The first payout has already happened, so next payout is based on revenue reports
    if (nextReportPayoutDate && nextReportPayoutDate >= now) {
      return nextReportPayoutDate;
    }
    return null;
  }

  return result;
}

/**
 * Format an expected next payout date
 * @param date - Date object or null
 * @returns Formatted string like "5th Jan 2026" or "TBD"
 */
export function formatExpectedNextPayout(date: Date | null): string {
  if (!date) return "TBD";

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  const ordinalSuffix = (n: number): string => {
    if (n > 3 && n < 21) return "th";
    switch (n % 10) {
      case 1: return "st";
      case 2: return "nd";
      case 3: return "rd";
      default: return "th";
    }
  };

  return `${day}${ordinalSuffix(day)} ${monthNames[month]} ${year}`;
}

export function formatSmartReturn(
  returnPercentage: number | undefined,
  options: {
    threshold?: number; // When to switch from % to x (default: 1000)
    showPlus?: boolean; // Show + sign for positive values
  } = {},
): string {
  if (returnPercentage === undefined || returnPercentage === null) {
    return "TBD";
  }

  const { threshold = 1000, showPlus = false } = options;

  // Handle negative returns
  if (returnPercentage < 0) {
    return "<0%"; // Display any negative return as <0%
  }

  // For values below threshold, show as percentage
  if (returnPercentage < threshold) {
    const formatted = `${Math.round(returnPercentage)}%`;
    return showPlus && returnPercentage > 0 ? `+${formatted}` : formatted;
  }

  // Convert percentage to multiplier (100% = 2x, 200% = 3x, etc.)
  const multiplier = returnPercentage / 100 + 1;

  // Cap display at >10x for any value 10x or greater
  if (multiplier >= 10) {
    return ">10x";
  }

  // For multipliers below 10x, show with one decimal if needed
  return `${multiplier.toFixed(1)}x`;
}
