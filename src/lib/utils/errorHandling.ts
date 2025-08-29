/**
 * @fileoverview Centralized Error Handling System
 * Provides consistent error types, reporting, and handling patterns
 */

export enum ErrorCode {
  // Data related errors
  ASSET_NOT_FOUND = "ASSET_NOT_FOUND",
  TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND",
  DATA_LOAD_FAILED = "DATA_LOAD_FAILED",
  INVALID_DATA_FORMAT = "INVALID_DATA_FORMAT",

  // Service related errors
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  CACHE_ERROR = "CACHE_ERROR",
  TRANSFORM_ERROR = "TRANSFORM_ERROR",

  // Business logic errors
  INVALID_CALCULATION = "INVALID_CALCULATION",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
  BUSINESS_RULE_VIOLATION = "BUSINESS_RULE_VIOLATION",

  // Network related errors
  NETWORK_ERROR = "NETWORK_ERROR",
  API_ERROR = "API_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",

  // User related errors
  INVALID_INPUT = "INVALID_INPUT",
  UNAUTHORIZED = "UNAUTHORIZED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
}

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    public context?: Record<string, any>,
    public cause?: Error,
  ) {
    super(message);
    this.name = "AppError";

    // Maintain stack trace (in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      context: this.context,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }
}

export interface ErrorReporter {
  report(error: AppError): void;
  handle(error: AppError): void;
}

class ErrorReporterImpl implements ErrorReporter {
  report(error: AppError): void {
    // Log to console in development
    if (import.meta.env.DEV) {
      console.error("AppError:", error.toJSON());
    }

    // In production, send to telemetry service
    if (import.meta.env.PROD && error.severity === ErrorSeverity.CRITICAL) {
      // TODO: Implement telemetry reporting
      console.error("Critical error:", error.toJSON());
    }
  }

  handle(error: AppError): void {
    this.report(error);

    // Show user-friendly notifications based on severity
    switch (error.severity) {
      case ErrorSeverity.LOW:
        // Silent handling, maybe log only
        break;
      case ErrorSeverity.MEDIUM:
        // Show non-blocking notification
        console.warn(error.message);
        break;
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        // Show blocking notification or redirect
        console.error(error.message);
        // TODO: Implement user notification system
        break;
    }
  }
}

export const errorReporter: ErrorReporter = new ErrorReporterImpl();

// Utility functions for common error patterns
export const createDataError = (
  message: string,
  context?: Record<string, any>,
  cause?: Error,
) =>
  new AppError(
    message,
    ErrorCode.DATA_LOAD_FAILED,
    ErrorSeverity.MEDIUM,
    context,
    cause,
  );

export const createNotFoundError = (resource: string, id: string) =>
  new AppError(
    `${resource} not found`,
    resource.toLowerCase().includes("asset")
      ? ErrorCode.ASSET_NOT_FOUND
      : ErrorCode.TOKEN_NOT_FOUND,
    ErrorSeverity.LOW,
    { resource, id },
  );

export const createValidationError = (
  message: string,
  context?: Record<string, any>,
) =>
  new AppError(message, ErrorCode.INVALID_INPUT, ErrorSeverity.MEDIUM, context);

export const createServiceError = (
  service: string,
  operation: string,
  cause?: Error,
) =>
  new AppError(
    `${service} service error during ${operation}`,
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorSeverity.HIGH,
    { service, operation },
    cause,
  );

// Error boundary helpers for async operations
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorContext: { service: string; operation: string },
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const appError = createServiceError(
      errorContext.service,
      errorContext.operation,
      error instanceof Error ? error : new Error(String(error)),
    );
    errorReporter.handle(appError);
    return null;
  }
}

export function withSyncErrorHandling<T>(
  operation: () => T,
  errorContext: { service: string; operation: string },
): T | null {
  try {
    return operation();
  } catch (error) {
    const appError = createServiceError(
      errorContext.service,
      errorContext.operation,
      error instanceof Error ? error : new Error(String(error)),
    );
    errorReporter.handle(appError);
    return null;
  }
}
