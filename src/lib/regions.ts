import type { NormalizedRect } from "../types";

export type RegionTransform = "move" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export const MIN_REGION_SIZE = 0.005;

export function expandNormalizedRect(rect: NormalizedRect, padding: number): NormalizedRect {
  const x = Math.max(0, rect.x - padding);
  const y = Math.max(0, rect.y - padding);
  const right = Math.min(1, rect.x + rect.width + padding);
  const bottom = Math.min(1, rect.y + rect.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}

export function transformNormalizedRect(
  rect: NormalizedRect,
  transform: RegionTransform,
  delta: { x: number; y: number },
  minimumSize = MIN_REGION_SIZE,
): NormalizedRect {
  if (transform === "move") {
    return {
      ...rect,
      x: clamp(rect.x + delta.x, 0, 1 - rect.width),
      y: clamp(rect.y + delta.y, 0, 1 - rect.height),
    };
  }

  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (transform.includes("w")) left = clamp(left + delta.x, 0, right - minimumSize);
  if (transform.includes("e")) right = clamp(right + delta.x, left + minimumSize, 1);
  if (transform.includes("n")) top = clamp(top + delta.y, 0, bottom - minimumSize);
  if (transform.includes("s")) bottom = clamp(bottom + delta.y, top + minimumSize, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
