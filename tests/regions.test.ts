import { describe, expect, it } from "vitest";
import { expandNormalizedRect, transformNormalizedRect } from "../src/lib/regions";

describe("region compositing", () => {
  it("expands privacy restoration within page bounds", () => {
    const expanded = expandNormalizedRect({ x: 0.01, y: 0.2, width: 0.2, height: 0.3 }, 0.015);
    expect(expanded.x).toBe(0);
    expect(expanded.y).toBeCloseTo(0.185);
    expect(expanded.width).toBeCloseTo(0.225);
    expect(expanded.height).toBeCloseTo(0.33);
  });

  it("moves a region without letting it leave the page", () => {
    const moved = transformNormalizedRect(
      { x: 0.7, y: 0.1, width: 0.2, height: 0.3 },
      "move",
      { x: 0.4, y: -0.3 },
    );
    expect(moved.x).toBeCloseTo(0.8);
    expect(moved.y).toBe(0);
    expect(moved.width).toBe(0.2);
    expect(moved.height).toBe(0.3);
  });

  it("resizes from corners and preserves a usable minimum size", () => {
    const expanded = transformNormalizedRect(
      { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
      "nw",
      { x: -0.1, y: -0.2 },
    );
    expect(expanded.x).toBeCloseTo(0.2);
    expect(expanded.y).toBeCloseTo(0.1);
    expect(expanded.width).toBeCloseTo(0.3);
    expect(expanded.height).toBeCloseTo(0.4);

    const minimum = transformNormalizedRect(expanded, "se", { x: -1, y: -1 });
    expect(minimum.width).toBeCloseTo(0.005);
    expect(minimum.height).toBeCloseTo(0.005);
  });
});
