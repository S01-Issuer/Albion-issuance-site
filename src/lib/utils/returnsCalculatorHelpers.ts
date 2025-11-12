/**
 * Returns calculator helper functions for monthly cashflow, NPV, IRR, and payback period calculations
 */

import type { TokenMetadata, ReceiptsData } from '$lib/types/MetaboardTypes';

/**
 * Get current date as YYYY-MM string
 */
function getCurrentYearMonth(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	return `${year}-${month}`;
}

/**
 * Get the number of days in a month
 */
function getDaysInMonth(yearMonth: string): number {
	const [year, month] = yearMonth.split('-').map(Number);
	return new Date(year, month, 0).getDate();
}

/**
 * Get the current day of the month
 */
function getCurrentDayOfMonth(): number {
	return new Date().getDate();
}

/**
 * Calculate the pro-ration factor for the current month
 * Returns the fraction of the month that has passed
 */
function getCurrentMonthProration(): number {
	const currentDay = getCurrentDayOfMonth();
	const currentYearMonth = getCurrentYearMonth();
	const daysInMonth = getDaysInMonth(currentYearMonth);
	const daysRemainingInMonth = daysInMonth - currentDay + 1;
	return daysRemainingInMonth / daysInMonth;
}

/**
 * Add months to a date string (YYYY-MM format)
 */
function addMonths(dateStr: string, months: number): string {
	const [year, month] = dateStr.split('-').map(Number);
	const date = new Date(year, month - 1, 1);
	date.setMonth(date.getMonth() + months);
	const newYear = date.getFullYear();
	const newMonth = String(date.getMonth() + 1).padStart(2, '0');
	return `${newYear}-${newMonth}`;
}

/**
 * Check if a date string is before another date string (YYYY-MM format)
 */
function isDateBefore(dateA: string, dateB: string): boolean {
	return dateA < dateB;
}

/**
 * Calculate monthly token cashflows based on the specified algorithm
 * @param token Token metadata with asset data
 * @param oilPrice Oil price assumption in USD per barrel
 * @param mintedSupply Number of tokens minted (for normalizing per-token cashflows)
 * @returns Array of monthly cashflows starting from today
 */
export function calculateMonthlyTokenCashflows(
	token: TokenMetadata,
	oilPrice: number,
	mintedSupply: number = 1
): Array<{ month: string; cashflow: number }> {
	if (!token.asset?.plannedProduction?.projections || token.asset.plannedProduction.projections.length === 0) {
		return [];
	}

	const asset = token.asset;
	const { projections } = asset.plannedProduction;
	const cashflowStartDate = asset.cashflowStartDate || projections[0]?.month;
	const receiptsData = asset.receiptsData || [];

	// Step 3: Sum netIncome from receipts data for months before cashflowStartDate (pending distributions)
	let pendingDistributionsTotal = 0;
	for (const receipt of receiptsData) {
		if (isDateBefore(receipt.month, cashflowStartDate)) {
			pendingDistributionsTotal += receipt.assetData.netIncome || 0;
		}
	}

	// Step 4: Divide pending distributions total by 12 to get monthly pending distribution amount
	const monthlyPendingDistribution = pendingDistributionsTotal / 12;

	// Build monthly cashflows starting from first projection
	const monthlyDataMap = new Map<string, number>();

	// Calculate the 12-month pending distributions period (from cashflowStartDate)
	const pendingDistributionsEndDate = addMonths(cashflowStartDate, 12);

	for (const projection of projections) {
		// Step 1 & 2: Production * oil price to get cash flow
		let monthlyCashflow = projection.production * oilPrice;

		// Step 4: Add pending distributions for the first 12 months from cashflowStartDate
		// These will be sliced later to only include remaining months
		if (!isDateBefore(projection.month, cashflowStartDate) && isDateBefore(projection.month, pendingDistributionsEndDate)) {
			monthlyCashflow += monthlyPendingDistribution;
		}

		monthlyDataMap.set(projection.month, monthlyCashflow);
	}

	// Step 5 & 6: Slice off months before current month and pro-rate current month
	// This naturally limits pending distributions to remaining months in the 12-month period
	// Example: if 4 months have passed since cashflowStartDate, only 8 months of pending distributions remain
	const currentYearMonth = getCurrentYearMonth();
	const resultMonths: Array<{ month: string; cashflow: number }> = [];
	const proration = getCurrentMonthProration();

	for (const [month, cashflow] of monthlyDataMap.entries()) {
		if (month === currentYearMonth) {
			// Pro-rate current month
			resultMonths.push({ month, cashflow: cashflow * proration });
		} else if (month > currentYearMonth) {
			// Include future months (with pending distributions only if still within 12-month period)
			resultMonths.push({ month, cashflow });
		}
	}

	if (resultMonths.length === 0) {
		return [];
	}

	// Step 7: Divide entire array by current token supply and apply share percentage
	// First apply the token's share percentage, then divide by number of tokens minted
	const sharePercentage = token.sharePercentage || 100; // Default to 100% if not specified
	const shareMultiplier = sharePercentage / 100;
	const normalizer = mintedSupply > 0 ? mintedSupply : 1;

	const finalCashflows: Array<{ month: string; cashflow: number }> = resultMonths.map((item) => ({
		month: item.month,
		cashflow: (item.cashflow * shareMultiplier) / normalizer,
	}));

	// Step 8: Prepend -$1 cost to the beginning
	finalCashflows.unshift({ month: currentYearMonth, cashflow: -1 });

	return finalCashflows;
}

/**
 * Calculate NPV (Net Present Value) given a discount rate
 * @param cashflows Array of cashflows where index 0 is the initial investment
 * @param discountRate Monthly discount rate as decimal (e.g., 0.01 for 1%)
 * @returns NPV value
 */
export function calculateNPV(cashflows: number[], discountRate: number): number {
	if (cashflows.length === 0) return 0;

	let npv = 0;
	for (let i = 0; i < cashflows.length; i++) {
		const discountFactor = Math.pow(1 + discountRate, i);
		npv += cashflows[i] / discountFactor;
	}

	return npv;
}

/**
 * Calculate IRR (Internal Rate of Return) using Newton's method
 * @param cashflows Array of cashflows where index 0 is the initial investment
 * @returns IRR as a decimal (e.g., 0.05 for 5% monthly)
 */
export function calculateIRR(cashflows: number[]): number {
	const maxIterations = 100;
	const tolerance = 1e-7;
	let rate = 0.1; // Initial guess of 10%

	// Check if the investment can ever be recovered
	const totalInflows = cashflows.slice(1).reduce((sum, cf) => sum + cf, 0);
	const initialOutflow = Math.abs(cashflows[0]);

	if (totalInflows < initialOutflow * 0.01) {
		// Total inflows are less than 1% of initial investment - essentially a total loss
		return -0.99;
	}

	for (let i = 0; i < maxIterations; i++) {
		let npv = 0;
		let dnpv = 0;

		for (let j = 0; j < cashflows.length; j++) {
			const factor = Math.pow(1 + rate, j);
			npv += cashflows[j] / factor;
			dnpv -= (j * cashflows[j]) / Math.pow(1 + rate, j + 1);
		}

		// Protect against division by zero or infinity
		if (!isFinite(dnpv) || Math.abs(dnpv) < 1e-10) {
			return -0.99;
		}

		const newRate = rate - npv / dnpv;

		// Bound the rate to prevent divergence
		if (!isFinite(newRate) || newRate < -0.99) {
			return -0.99;
		}
		if (newRate > 100) {
			return 100;
		}

		if (Math.abs(newRate - rate) < tolerance) {
			return newRate;
		}

		rate = newRate;
	}

	return rate;
}

/**
 * Calculate payback period in months
 * @param cashflows Array of cashflows starting with initial investment (-$1)
 * @returns Number of months to recover the initial $1 investment (break even at cumulative = 0)
 */
export function calculatePaybackPeriod(cashflows: number[]): number {
	if (cashflows.length === 0) return Infinity;

	let cumulativeCashflow = 0;

	for (let i = 0; i < cashflows.length; i++) {
		cumulativeCashflow += cashflows[i];
		if (cumulativeCashflow >= 0) {
			// Found the month where cumulative reaches break-even ($0)
			if (i === 0) return 0;

			// Linear interpolation for fractional months
			const previousCumulative = cumulativeCashflow - cashflows[i];
			const monthsIntoCurrentPeriod = (0 - previousCumulative) / cashflows[i];
			return i - 1 + monthsIntoCurrentPeriod;
		}
	}

	// Never reaches break-even
	return Infinity;
}

/**
 * Get a standardized month key from a date string
 */
export function getMonthKey(dateStr: string): string {
	return dateStr;
}

/**
 * Calculate monthly asset cashflows for asset mode
 * Shows projected vs actual revenue side-by-side
 * @param token Token metadata with asset data
 * @param oilPrice Oil price assumption in USD per barrel
 * @returns Array of monthly data with projected and actual values
 */
export function calculateMonthlyAssetCashflows(
	token: TokenMetadata,
	oilPrice: number
): Array<{
	month: string;
	projected: number;
	actual: number;
}> {
	if (!token.asset?.plannedProduction?.projections) {
		return [];
	}

	const { projections } = token.asset.plannedProduction;
	const receiptsData = token.asset.receiptsData || [];

	// Create a map of receipts data by month for easy lookup
	const receiptsMap = new Map<string, number>();
	for (const receipt of receiptsData) {
		if (receipt.assetData?.revenue !== undefined) {
			receiptsMap.set(receipt.month, receipt.assetData.revenue);
		}
	}

	// Build monthly data with both projected and actual
	const monthlyData: Array<{ month: string; projected: number; actual: number }> = [];

	for (const projection of projections) {
		const projected = projection.production * oilPrice;
		const actual = receiptsMap.get(projection.month) || 0;

		monthlyData.push({
			month: projection.month,
			projected,
			actual,
		});
	}

	// Slice off months before current month and pro-rate current month
	const currentYearMonth = getCurrentYearMonth();
	const proration = getCurrentMonthProration();
	const result: Array<{ month: string; projected: number; actual: number }> = [];

	for (const item of monthlyData) {
		if (item.month === currentYearMonth) {
			// Pro-rate current month
			result.push({
				month: item.month,
				projected: item.projected * proration,
				actual: item.actual * proration,
			});
		} else if (item.month > currentYearMonth) {
			// Include future months
			result.push(item);
		}
	}

	return result;
}
