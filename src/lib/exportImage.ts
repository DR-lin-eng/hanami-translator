import type { PageItem } from "../types";
import { blendPrivacyRegion, blendTextRegion } from "./imageBlend";

export async function renderPageToPng(page: PageItem): Promise<string> {
  const source = await loadImage(page.dataUrl);
  const generated = page.result ? await loadImage(page.result.generatedImageDataUrl) : source;
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备无法创建图片画布");
  const sourcePixels = renderImagePixels(source, canvas.width, canvas.height);
  const generatedPixels = generated === source
    ? sourcePixels
    : renderImagePixels(generated, canvas.width, canvas.height);
  const textRegions = page.regions.filter((item) => item.kind === "textEdit");
  const output = new Uint8ClampedArray(
    textRegions.length ? sourcePixels.data : generatedPixels.data,
  );

  for (const region of textRegions) {
    blendTextRegion(output, generatedPixels.data, canvas.width, canvas.height, region.rect);
  }

  // The selected privacy core stays byte-for-byte identical to the source.
  // Only the already-redacted padding ring is feathered into the generated page.
  for (const region of page.regions.filter((item) => item.kind === "privacy")) {
    blendPrivacyRegion(
      output,
      sourcePixels.data,
      canvas.width,
      canvas.height,
      region.rect,
      page.result?.privacyRestorePadding ?? 0,
    );
  }
  const imageData = context.createImageData(canvas.width, canvas.height);
  imageData.data.set(output);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function renderImagePixels(image: HTMLImageElement, width: number, height: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备无法创建图片画布");
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片载入失败"));
    image.src = source;
  });
}
