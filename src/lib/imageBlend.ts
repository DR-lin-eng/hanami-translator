import type { NormalizedRect } from "../types";
import { expandNormalizedRect } from "./regions";

export function blendTextRegion(
  destination: Uint8ClampedArray,
  generated: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  rect: NormalizedRect,
): void {
  const outer = pixelBounds(rect, imageWidth, imageHeight);
  const regionWidth = outer.x1 - outer.x0;
  const regionHeight = outer.y1 - outer.y0;
  const feather = Math.max(1, Math.min(12, Math.floor(Math.min(regionWidth, regionHeight) / 4)));
  const core = insetBounds(outer, feather);
  healBlendRegion(destination, generated, imageWidth, imageHeight, core, outer);
}

export function blendPrivacyRegion(
  destination: Uint8ClampedArray,
  source: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  rect: NormalizedRect,
  restorePadding: number,
): void {
  const core = pixelBounds(rect, imageWidth, imageHeight);
  const outer = pixelBounds(expandNormalizedRect(rect, restorePadding), imageWidth, imageHeight);
  healBlendRegion(destination, source, imageWidth, imageHeight, core, outer);
}

interface PixelBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function healBlendRegion(
  destination: Uint8ClampedArray,
  layer: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  core: PixelBounds,
  outer: PixelBounds,
): void {
  const localWidth = outer.x1 - outer.x0;
  const localHeight = outer.y1 - outer.y0;
  if (localWidth <= 0 || localHeight <= 0) return;

  // Initialize the core and transition ring in place. This avoids allocating
  // full-region float buffers when a user protects a large portion of a page.
  for (let y = outer.y0; y < outer.y1; y += 1) {
    for (let x = outer.x0; x < outer.x1; x += 1) {
      const globalOffset = (y * imageWidth + x) * 4;
      const alpha = isInside(x, y, core)
        ? 1
        : smoothstep(1 - Math.max(
          outsideProgress(x, core.x0, core.x1, outer.x0, outer.x1),
          outsideProgress(y, core.y0, core.y1, outer.y0, outer.y1),
        ));
      for (let channel = 0; channel < 4; channel += 1) {
        destination[globalOffset + channel] = Math.round(
          destination[globalOffset + channel] * (1 - alpha) + layer[globalOffset + channel] * alpha,
        );
      }
    }
  }

  const ring = ringRanges(core, outer);
  // Gauss-Seidel iterations solve the source-gradient Poisson equation only in the
  // transition ring. The core and the outer boundary remain fixed constraints.
  for (let iteration = 0; iteration < 18; iteration += 1) {
    for (const range of ring) {
      for (let y = range.y0; y < range.y1; y += 1) {
        for (let x = range.x0; x < range.x1; x += 1) {
          if (isOuterBoundary(x, y, outer)) continue;
          const globalOffset = (y * imageWidth + x) * 4;
          for (let channel = 0; channel < 3; channel += 1) {
            let neighbors = 0;
            let neighborSum = 0;
            let guidance = 0;
            for (const [neighborX, neighborY] of [
              [x - 1, y],
              [x + 1, y],
              [x, y - 1],
              [x, y + 1],
            ]) {
              if (neighborX < 0 || neighborY < 0 || neighborX >= imageWidth || neighborY >= imageHeight) continue;
              const neighborGlobalOffset = (neighborY * imageWidth + neighborX) * 4;
              neighborSum += destination[neighborGlobalOffset + channel];
              guidance += layer[globalOffset + channel] - layer[neighborGlobalOffset + channel];
              neighbors += 1;
            }
            destination[globalOffset + channel] = Math.round(
              clampByte((neighborSum + guidance) / Math.max(1, neighbors)),
            );
          }
        }
      }
    }
  }
}

function ringRanges(core: PixelBounds, outer: PixelBounds): PixelBounds[] {
  return [
    { x0: outer.x0, y0: outer.y0, x1: outer.x1, y1: core.y0 },
    { x0: outer.x0, y0: core.y1, x1: outer.x1, y1: outer.y1 },
    { x0: outer.x0, y0: core.y0, x1: core.x0, y1: core.y1 },
    { x0: core.x1, y0: core.y0, x1: outer.x1, y1: core.y1 },
  ].filter((range) => range.x1 > range.x0 && range.y1 > range.y0);
}

function outsideProgress(value: number, coreStart: number, coreEnd: number, outerStart: number, outerEnd: number): number {
  if (value < coreStart) return (coreStart - value) / Math.max(1, coreStart - outerStart);
  if (value >= coreEnd) return (value - coreEnd + 1) / Math.max(1, outerEnd - coreEnd);
  return 0;
}

function insetBounds(bounds: PixelBounds, amount: number): PixelBounds {
  const horizontal = Math.min(amount, Math.max(0, Math.floor((bounds.x1 - bounds.x0 - 1) / 2)));
  const vertical = Math.min(amount, Math.max(0, Math.floor((bounds.y1 - bounds.y0 - 1) / 2)));
  return {
    x0: bounds.x0 + horizontal,
    y0: bounds.y0 + vertical,
    x1: bounds.x1 - horizontal,
    y1: bounds.y1 - vertical,
  };
}

function isInside(x: number, y: number, bounds: PixelBounds): boolean {
  return x >= bounds.x0 && x < bounds.x1 && y >= bounds.y0 && y < bounds.y1;
}

function isOuterBoundary(x: number, y: number, bounds: PixelBounds): boolean {
  return x === bounds.x0 || x === bounds.x1 - 1 || y === bounds.y0 || y === bounds.y1 - 1;
}

function smoothstep(value: number): number {
  const amount = Math.max(0, Math.min(1, value));
  return amount * amount * (3 - 2 * amount);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function pixelBounds(rect: NormalizedRect, width: number, height: number): PixelBounds {
  const x0 = Math.max(0, Math.floor(rect.x * width));
  const y0 = Math.max(0, Math.floor(rect.y * height));
  const x1 = Math.min(width, Math.ceil((rect.x + rect.width) * width));
  const y1 = Math.min(height, Math.ceil((rect.y + rect.height) * height));
  return { x0, y0, x1, y1 };
}
