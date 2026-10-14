import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import type { PageItem, PageStatus } from "../src/types";
import {
  buildPdfBytes,
  completedPagesInQueueOrder,
  decodePngDataUrl,
} from "../src/lib/exportPdf";

const icon32Bytes = readFileSync(new URL("../src-tauri/icons/32x32.png", import.meta.url));
const icon32 = pngDataUrl(icon32Bytes);
const icon128 = pngDataUrl(readFileSync(new URL("../src-tauri/icons/128x128.png", import.meta.url)));
const exportInputDirectory = process.env.HANAMI_PDF_EXPORT_INPUT_DIR;

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

  it("reports preparation, page rendering, and finalization progress in order", async () => {
    const progress: Array<{ phase: string; current: number; total: number }> = [];
    await buildPdfBytes(
      [page("first"), page("second")],
      async (item) => item.id === "first" ? icon32 : icon128,
      (update) => progress.push(update),
    );

    expect(progress[0]).toEqual({ phase: "preparing", current: 0, total: 2 });
    expect(progress.filter((item) => item.phase === "rendering").map((item) => item.current)).toEqual([0, 1, 1, 2]);
    expect(progress.at(-2)).toEqual({ phase: "finalizing", current: 2, total: 2 });
    expect(progress.at(-1)).toEqual({ phase: "completed", current: 2, total: 2 });
  });

  it("decodes PNG data without WebView fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Load failed")));
    try {
      expect(decodePngDataUrl(icon32)).toEqual(new Uint8Array(icon32Bytes));
      const bytes = await buildPdfBytes([page("single")], async () => icon32);
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.runIf(Boolean(exportInputDirectory))(
    "exports a real PNG folder in filename order",
    async () => {
      const inputDirectory = resolve(exportInputDirectory!);
      const filenames = readdirSync(inputDirectory)
        .filter((name) => name.toLowerCase().endsWith(".png"))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
      const pages = filenames.map((name) => ({ ...page(name), name }));
      const bytes = await buildPdfBytes(pages, async (item) => (
        pngDataUrl(readFileSync(join(inputDirectory, item.name)))
      ));
      const document = await PDFDocument.load(bytes);

      expect(filenames.length).toBeGreaterThan(0);
      expect(document.getPageCount()).toBe(filenames.length);

      const outputPath = process.env.HANAMI_PDF_TEST_OUTPUT;
      if (outputPath) {
        const resolvedOutput = resolve(outputPath);
        mkdirSync(dirname(resolvedOutput), { recursive: true });
        writeFileSync(resolvedOutput, bytes);
      }
    },
    60_000,
  );
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
