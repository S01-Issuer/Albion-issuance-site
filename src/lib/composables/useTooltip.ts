/**
 * @fileoverview Tooltip composable
 * Manages tooltip state and interactions
 */

import { writable, type Writable } from "svelte/store";

export interface TooltipState {
  visible: string; // ID of currently visible tooltip
  timer: number | null;
}

/**
 * Composable for managing tooltip visibility
 */
export function useTooltip() {
  const state: Writable<TooltipState> = writable({
    visible: "",
    timer: null,
  });

  const showTooltip = writable("");

  let currentTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Show tooltip with optional delay
   */
  function show(tooltipId: string, delay: number = 200): void {
    // Clear any existing timer
    if (currentTimer) {
      clearTimeout(currentTimer);
      currentTimer = null;
    }

    // Set new timer
    currentTimer = setTimeout(() => {
      state.update((s) => ({
        ...s,
        visible: tooltipId,
      }));
      showTooltip.set(tooltipId);
      currentTimer = null;
    }, delay);
  }

  /**
   * Hide tooltip immediately
   */
  function hide(): void {
    // Clear timer if exists
    if (currentTimer) {
      clearTimeout(currentTimer);
      currentTimer = null;
    }

    // Hide tooltip
    state.update((s) => ({
      ...s,
      visible: "",
    }));
    showTooltip.set("");
  }

  /**
   * Check if a specific tooltip is visible
   */
  function isVisible(tooltipId: string): boolean {
    let visible = false;
    const unsubscribe = state.subscribe((s) => {
      visible = s.visible === tooltipId;
    });
    unsubscribe();
    return visible;
  }

  /**
   * Toggle tooltip visibility
   */
  function toggle(tooltipId: string, delay: number = 200): void {
    if (isVisible(tooltipId)) {
      hide();
    } else {
      show(tooltipId, delay);
    }
  }

  /**
   * Show tooltip with delay (convenience function)
   */
  function showTooltipWithDelay(tooltipId: string, delay: number = 500): void {
    show(tooltipId, delay);
  }

  /**
   * Hide tooltip (convenience function)
   */
  function hideTooltip(): void {
    hide();
  }

  return {
    state: { subscribe: state.subscribe },
    showTooltip,
    show,
    hide,
    toggle,
    isVisible,
    showTooltipWithDelay,
    hideTooltip,
  };
}
