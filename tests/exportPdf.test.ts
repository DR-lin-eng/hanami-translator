import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { PageItem, PageStatus } from "../src/types";
import { buildPdfBytes, completedPagesInQueueOrder } from "../src/lib/exportPdf";

const icon32 = pngDataUrl(readFileSync(new URL("../src-tauri/icons/32x32.png", import.meta.url)));
const icon128 = pngDataUrl(readFileSync(new URL("../src-tauri/icons/128x128.png", import.meta.url)));

describe("PDF export", () => {
  it("keeps completed pages in queue order", () => {
    const pages = [page("first"), page("pending", "ready"), page("second")];
    expect(completedPagesInQueueOrder(pages).map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("writes PDF pages sequentially in the supplied order", async () => {
    const pages = [page("small"), page("large")];
    const images = new Map([["small", icon32], ["large", icon128]]);
    const bytes = await buildPdfBytes(pages, async (item) => images.get(item.id)!);
    const document = await PDFDocument.load(bytes);
    const [first, second] = document.getPages();

    expect(document.getPageCount()).toBe(2);
    expect(first.getWidth()).toBeCloseTo(24);
    expect(first.getHeight()).toBeCloseTo(24);
    expect(second.getWidth()).toBeCloseTo(96);
    expect(second.getHeight()).toBeCloseTo(96);

    const verificationOutput = process.env.HANAMI_PDF_TEST_OUTPUT;
    if (verificationOutput) {
      const outputPath = resolve(verificationOutput);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, bytes);
    }
  });
});

function page(id: string, status: PageStatus = "completed"): PageItem {
  return {
    id,
    name: `${id}.png`,
    sourceKind: "image",
    path: "",
    dataUrl: "",
    width: 1,
    height: 1,
    status,
    regions: [],
  };
}

function pngDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}
