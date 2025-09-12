import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock SVGPathElement methods that aren't available in jsdom
// This prevents "getTotalLength is not a function" errors in tests

// First, ensure the methods exist on the prototype
if (typeof SVGPathElement !== "undefined") {
  if (!SVGPathElement.prototype.getTotalLength) {
    SVGPathElement.prototype.getTotalLength = vi.fn(() => 100);
  }

  if (!SVGPathElement.prototype.getPointAtLength) {
    SVGPathElement.prototype.getPointAtLength = vi.fn(() => ({ x: 0, y: 0 }));
  }
}

// Also patch Element.prototype since querySelector might return a generic Element
const originalQuerySelector = Element.prototype.querySelector;
Element.prototype.querySelector = function (selector: string) {
  const element = originalQuerySelector.call(this, selector);

  // If it's supposed to be an SVG path element, add the missing methods
  if (
    (element && selector.includes("path")) ||
    selector.includes(".line-path")
  ) {
    if (!element.getTotalLength) {
      (element as any).getTotalLength = () => 100;
    }
    if (!element.getPointAtLength) {
      (element as any).getPointAtLength = () => ({ x: 0, y: 0 });
    }
  }

  return element;
};

// Suppress uncaught errors from chart animations in tests
if (typeof window !== "undefined") {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    // Suppress specific SVG-related errors in tests
    if (
      args[0]?.toString?.().includes("getTotalLength") ||
      args[0]?.toString?.().includes("getPointAtLength")
    ) {
      return;
    }
    originalConsoleError(...args);
  };
}
