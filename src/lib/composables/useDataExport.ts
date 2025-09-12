/**
 * @fileoverview Data export composable
 * Handles CSV export functionality for various data types
 */

import type { Asset, Token } from "$lib/types/uiTypes";
import { withSyncErrorHandling } from "$lib/utils/errorHandling";
import { formatCurrency, formatNumber } from "$lib/utils/formatters";
import type { TokenMetadata } from "$lib/types/MetaboardTypes";

export interface ExportOptions {
  filename?: string;
  includeHeaders?: boolean;
}

/**
 * Composable for exporting data to CSV
 */
export function useDataExport() {
  /**
   * Generic CSV export function
   */
  function exportToCSV(
    data: any[][],
    headers: string[],
    filename: string,
  ): void {
    const csvContent = [headers, ...data]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  /**
   * Export asset production data
   */
  function exportProductionData(
    asset: Asset,
    options: ExportOptions = {},
  ): void {
    if (!asset?.monthlyReports?.length) {
      console.warn("No production data to export");
      return;
    }

    const headers = [
      "Month",
      "Production (bbl)",
      "Revenue (USD)",
      "Expenses (USD)",
      "Net Income (USD)",
      "Payout Per Token (USD)",
    ];

    const data = asset.monthlyReports.map((report) => [
      report.month,
      report.production.toString(),
      (report.revenue ?? 0).toString(),
      (report.expenses ?? 0).toString(),
      (report.netIncome ?? 0).toString(),
      (report.payoutPerToken ?? 0).toFixed(4),
    ]);

    const filename = options.filename || `${asset.id}-production-data.csv`;
    exportToCSV(data, headers, filename);
  }

  /**
   * Export token payment history
   */
  function exportPaymentHistory(
    tokens: TokenMetadata[],
    options: ExportOptions = {},
  ): void {
    const currentToken = tokens[0];

    if (!currentToken || !currentToken.payoutData) {
      return;
    }

    const headers = [
      "Month",
      "Date",
      "Total Payout (USD)",
      "Payout Per Token (USD)",
    ];

    const data = currentToken.payoutData.map((payout) => [
      payout.month,
      payout.tokenPayout.date,
      payout.tokenPayout.totalPayout.toFixed(2),
      payout.tokenPayout.payoutPerToken.toFixed(4),
    ]);

    const filename = `${currentToken.contractAddress}-payment-history.csv`;
    exportToCSV(data, headers, filename);
  }

  /**
   * Export asset summary data
   */
  function exportAssetSummary(asset: Asset, options: ExportOptions = {}): void {
    const headers = ["Field", "Value"];

    const data = [
      ["Asset Name", asset.name],
      ["Asset ID", asset.id],
      ["Location", `${asset.location.state}, ${asset.location.country}`],
      ["Operator", asset.operator.name],
      ["Status", asset.status],
      ["Depth", asset.geology?.depth || "N/A"],
      ["Type", asset.geology?.type || "N/A"],
      ["Interest Type", asset.terms?.interestType || "N/A"],
      ["Revenue Share", asset.terms?.amount || "N/A"],
      ["Payment Frequency", asset.terms?.paymentFrequency || "N/A"],
      ["Estimated Life", asset.geology?.estimatedLife || "N/A"],
      ["Water Depth", asset.location.waterDepth || "Onshore"],
    ];

    const filename = options.filename || `${asset.id}-summary.csv`;
    exportToCSV(data, headers, filename);
  }

  /**
   * Export performance metrics
   */
  function exportPerformanceMetrics(
    asset: Asset,
    metrics: {
      totalProduction?: number;
      totalRevenue?: number;
      avgMonthlyRevenue?: number;
      profitMargin?: number;
    },
    options: ExportOptions = {},
  ): void {
    const headers = ["Metric", "Value"];

    const data = [
      ["Asset Name", asset.name],
      [
        "Total Production (bbl)",
        metrics.totalProduction ? formatNumber(metrics.totalProduction) : "N/A",
      ],
      [
        "Total Revenue (USD)",
        metrics.totalRevenue
          ? formatCurrency(metrics.totalRevenue, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })
          : "N/A",
      ],
      [
        "Avg Monthly Revenue (USD)",
        metrics.avgMonthlyRevenue
          ? formatCurrency(metrics.avgMonthlyRevenue, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })
          : "N/A",
      ],
      [
        "Profit Margin (%)",
        metrics.profitMargin ? `${metrics.profitMargin.toFixed(2)}%` : "N/A",
      ],
      ["Report Count", asset.monthlyReports?.length.toString() || "0"],
    ];

    const filename = options.filename || `${asset.id}-performance-metrics.csv`;
    exportToCSV(data, headers, filename);
  }

  return {
    exportToCSV,
    exportProductionData,
    exportPaymentHistory,
    exportAssetSummary,
    exportPerformanceMetrics,
  };
}
