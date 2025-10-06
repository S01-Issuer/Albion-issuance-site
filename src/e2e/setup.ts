import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock SVGPathElement methods that aren't available in jsdom
// This prevents "getTotalLength is not a function" errors in tests

// First, ensure the methods exist on the prototype
const createDomPoint = (): DOMPoint => ({
  x: 0,
  y: 0,
  z: 0,
  w: 1,
  matrixTransform: () => createDomPoint(),
  toJSON: () => ({ x: 0, y: 0, z: 0, w: 1 }),
});

if (typeof SVGPathElement !== "undefined") {
  if (!SVGPathElement.prototype.getTotalLength) {
    SVGPathElement.prototype.getTotalLength = vi.fn(() => 100);
  }

  if (!SVGPathElement.prototype.getPointAtLength) {
    SVGPathElement.prototype.getPointAtLength = vi.fn(() => createDomPoint());
  }
}

// Also patch Element.prototype since querySelector might return a generic Element
const originalQuerySelector = Element.prototype.querySelector;
Element.prototype.querySelector = function (selector: string) {
  const element = originalQuerySelector.call(this, selector) as Element | null;

  if (!element) {
    return element;
  }

  const isPathSelector =
    selector.includes("path") || selector.includes(".line-path");

  if (isPathSelector && !(element instanceof SVGPathElement)) {
    const pathCandidate = element as SVGPathElement & {
      getTotalLength?: () => number;
      getPointAtLength?: () => { x: number; y: number };
    };
    if (!pathCandidate.getTotalLength) {
      pathCandidate.getTotalLength = () => 100;
    }
    if (!pathCandidate.getPointAtLength) {
      pathCandidate.getPointAtLength = () => createDomPoint();
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
