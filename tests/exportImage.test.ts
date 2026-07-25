import { describe, expect, it } from "vitest";
import { blendPrivacyRegion, blendTextRegion } from "../src/lib/imageBlend";

describe("image region export", () => {
  it("heals a generated text patch without changing pixels outside the selection", () => {
    const destination = solidPixels(20, 20, 0);
    const generated = solidPixels(20, 20, 255);
    blendTextRegion(destination, generated, 20, 20, { x: 0.1, y: 0.1, width: 0.8, height: 0.8 });

    expect(pixel(destination, 20, 0, 0)).toBe(0);
    expect(pixel(destination, 20, 10, 10)).toBe(255);
    expect(pixel(destination, 20, 4, 10)).toBeGreaterThan(0);
    expect(pixel(destination, 20, 4, 10)).toBeLessThan(255);
  });

  it("keeps the privacy core exact and feathers only through the restore padding", () => {
    const destination = solidPixels(20, 20, 0);
    const source = solidPixels(20, 20, 255);
    blendPrivacyRegion(destination, source, 20, 20, { x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, 0.2);

    expect(pixel(destination, 20, 10, 10)).toBe(255);
    expect(pixel(destination, 20, 0, 0)).toBe(0);
    expect(pixel(destination, 20, 6, 10)).toBeGreaterThan(0);
    expect(pixel(destination, 20, 6, 10)).toBeLessThan(255);
  });
});

function solidPixels(width: number, height: number, value: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function pixel(pixels: Uint8ClampedArray, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4];
}
