/**
 * @fileoverview Email notification composable
 * Manages email subscription functionality
 */

import { writable, type Writable } from "svelte/store";

export interface EmailNotificationState {
  showPopup: boolean;
  email: string;
  isSubmitting: boolean;
  isSubmitted: boolean;
  error: string | null;
}

export interface EmailSubscriptionData {
  email: string;
  assetId?: string;
  notificationType:
    | "asset-updates"
    | "general-updates"
    | "payment-notifications";
}

/**
 * Composable for managing email notifications
 */
export function useEmailNotification() {
  const state: Writable<EmailNotificationState> = writable({
    showPopup: false,
    email: "",
    isSubmitting: false,
    isSubmitted: false,
    error: null,
  });

  /**
   * Show email popup
   */
  function showPopup(): void {
    state.update((s) => ({
      ...s,
      showPopup: true,
      isSubmitted: false,
      error: null,
    }));
  }

  /**
   * Hide email popup
   */
  function hidePopup(): void {
    state.update((s) => ({
      ...s,
      showPopup: false,
      email: "",
      error: null,
    }));
  }

  /**
   * Update email value
   */
  function setEmail(email: string): void {
    state.update((s) => ({
      ...s,
      email,
      error: null,
    }));
  }

  /**
   * Validate email format
   */
  function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Submit email subscription
   */
  async function submitEmail(data: EmailSubscriptionData): Promise<boolean> {
    // Validate email
    if (!validateEmail(data.email)) {
      state.update((s) => ({
        ...s,
        error: "Please enter a valid email address",
      }));
      return false;
    }

    state.update((s) => ({
      ...s,
      isSubmitting: true,
      error: null,
    }));

    try {
      // TODO: Replace with actual API call
      await simulateApiCall(data);

      state.update((s) => ({
        ...s,
        isSubmitting: false,
        isSubmitted: true,
        email: "",
      }));

      // Auto-hide after success
      setTimeout(() => {
        hidePopup();
      }, 3000);

      return true;
    } catch (error) {
      state.update((s) => ({
        ...s,
        isSubmitting: false,
        error: error instanceof Error ? error.message : "Failed to subscribe",
      }));
      return false;
    }
  }

  /**
   * Simulate API call (replace with actual implementation)
   */
  async function simulateApiCall(_data: EmailSubscriptionData): Promise<void> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulate random failure for demo
    if (Math.random() < 0.1) {
      throw new Error("Network error. Please try again.");
    }

    // Log subscription data (replace with actual API call)
    // Email subscription successful
  }

  /**
   * Reset state
   */
  function reset(): void {
    state.set({
      showPopup: false,
      email: "",
      isSubmitting: false,
      isSubmitted: false,
      error: null,
    });
  }

  return {
    state: { subscribe: state.subscribe },
    showPopup,
    hidePopup,
    setEmail,
    submitEmail,
    reset,
  };
}

/**
 * Email templates for different notification types
 */
export const emailTemplates = {
  assetUpdates: {
    subject: "Updates for {assetName}",
    body: "You will receive notifications about production updates, payments, and important announcements for this asset.",
  },
  generalUpdates: {
    subject: "Albion Platform Updates",
    body: "Stay informed about new assets, platform features, and market insights.",
  },
  paymentNotifications: {
    subject: "Payment Notifications",
    body: "Receive alerts when payments are distributed to your wallet.",
  },
};
