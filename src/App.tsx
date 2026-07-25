import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useRef, useState } from "react";
import { CanvasWorkbench } from "./components/CanvasWorkbench";
import { Inspector } from "./components/Inspector";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { TopToolbar } from "./components/TopToolbar";
import { renderPageToPng } from "./lib/exportImage";
import { buildPdfBytes, completedPagesInQueueOrder, downloadPdf, pdfBytesToDataUrl } from "./lib/exportPdf";
import {
  apiKeyConfigured,
  cancelNativeProcessing,
  chooseFolder,
  chooseImages,
  chooseOutputFile,
  chooseOutputFolder,
  chooseOutputPdf,
  choosePdf,
  finishNativeProcessing,
  importNativePaths,
  isNative,
  loadNativeDemo,
  processNativePage,
  startNativeProcessing,
  writeOutput,
} from "./lib/native";
import { runConcurrent } from "./lib/pipeline";
import { ProcessingTracker } from "./lib/processingTracker";
import { loadApiSettings, saveApiSettings } from "./lib/settings";
import type { AppSettings, MaskKind, NormalizedRect, PageItem, ProcessPageRequest, SourceAsset } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  sourceLanguage: "Japanese",
  targetLanguage: "Simplified Chinese",
  pageType: "manga page",
  additionalInstructions: "",
  concurrency: 2,
  apiBase: "https://api.openai.com/v1",
  imageModel: "gpt-image-2",
  quality: "medium",
};

export default function App() {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedRegionId, setSelectedRegionId] = useState<string>();
  const [drawingKind, setDrawingKind] = useState<MaskKind>();
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...loadApiSettings() }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; kind: "success" | "error" }>();
  const [dragging, setDragging] = useState(false);
  const browserInput = useRef<HTMLInputElement>(null);
  const demoLoaded = useRef(false);
  const processingTracker = useRef(new ProcessingTracker());
  const activeBatchJob = useRef<string | undefined>(undefined);
  const cancelledJobs = useRef(new Set<string>());
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [stopping, setStopping] = useState(false);

  const selectedPage = pages.find((page) => page.id === selectedId) ?? pages[0];
  const processing = activeJobCount > 0;
  const completedCount = pages.filter((page) => page.status === "completed").length;

  useEffect(() => {
    if (demoLoaded.current) return;
    demoLoaded.current = true;
    let disposed = false;
    const loadDemo = async () => {
      try {
        const asset = isNative() ? await loadNativeDemo() : browserDemoAsset();
        if (!disposed) addAssets([asset], true);
      } catch (error) {
        showNotice(String(error), "error");
      }
    };
    loadDemo();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    saveApiSettings({
      apiBase: settings.apiBase,
      imageModel: settings.imageModel,
      quality: settings.quality,
    });
  }, [settings.apiBase, settings.imageModel, settings.quality]);

  useEffect(() => {
    if (!isNative()) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") setDragging(true);
      if (event.payload.type === "leave") setDragging(false);
      if (event.payload.type === "drop") {
        setDragging(false);
        void importPaths(event.payload.paths);
      }
    }).then((value) => { unlisten = value; });
    return () => unlisten?.();
  }, []);

  const title = selectedPage?.pageNumber ? `第 ${selectedPage.pageNumber} 页` : selectedPage?.name ?? "未命名项目";
  const subtitle = stopping
    ? "正在中断 Images API 请求"
    : processing
      ? "Images API 正在处理"
      : completedCount
        ? `${completedCount} 页可导出`
        : `${pages.length} 页待处理`;

  const addAssets = (assets: SourceAsset[], replaceDemo = false) => {
    const incoming = assets.map((asset) => ({ ...asset, status: "ready" as const, regions: [] }));
    setPages((current) => {
      const base = replaceDemo ? current : current.filter((page) => page.sourceKind !== "demo");
      const knownIds = new Set(base.map((page) => page.id));
      return [...base, ...incoming.filter((page) => !knownIds.has(page.id))];
    });
    if (incoming[0]) setSelectedId(incoming[0].id);
  };

  const importPaths = async (paths: string[]) => {
    if (!paths.length) return;
    try {
      addAssets(await importNativePaths(paths));
      showNotice("素材已加入处理队列", "success");
    } catch (error) {
      showNotice(String(error), "error");
    }
  };

  const chooseAndImport = async (kind: "images" | "folder" | "pdf") => {
    if (!isNative()) {
      browserInput.current?.click();
      return;
    }
    const paths = kind === "images" ? await chooseImages() : kind === "folder" ? await chooseFolder() : await choosePdf();
    await importPaths(paths);
  };

  const importBrowserFiles = async (files: FileList | null) => {
    if (!files) return;
    const assets: SourceAsset[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await readFile(file);
      const dimensions = await imageDimensions(dataUrl);
      assets.push({ id: crypto.randomUUID(), name: file.name, sourceKind: "image", path: "", dataUrl, ...dimensions });
    }
    addAssets(assets);
  };

  const processingAvailable = async () => {
    if (!isNative()) {
      showNotice("请启动编译后的桌面版以调用 Images API", "error");
      return false;
    }
    if (!(await apiKeyConfigured())) {
      setSettingsOpen(true);
      showNotice("请先配置 OpenAI API Key", "error");
      return false;
    }
    return true;
  };

  const requestForPage = (page: PageItem): ProcessPageRequest => ({
    path: page.path,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    pageType: settings.pageType,
    additionalInstructions: settings.additionalInstructions,
    regions: page.regions,
    apiBase: settings.apiBase,
    imageModel: settings.imageModel,
    quality: settings.quality,
  });

  const syncProcessingCount = () => {
    setActiveJobCount(processingTracker.current.jobCount);
  };

  const processSelectedPage = async () => {
    const page = selectedPage;
    if (!page || !(await processingAvailable())) return;
    const jobId = crypto.randomUUID();
    if (!processingTracker.current.tryClaimPage(page.id, jobId)) {
      showNotice("当前页已经在处理中", "error");
      return;
    }
    processingTracker.current.startJob(jobId);
    syncProcessingCount();
    updatePage(page.id, { status: "processing", error: undefined });
    try {
      await startNativeProcessing(jobId);
      const result = await processNativePage(jobId, requestForPage(page));
      updatePage(page.id, { status: "completed", result });
      showNotice(`${page.name} 处理完成`, "success");
    } catch (error) {
      const cancelled = cancelledJobs.current.has(jobId) || String(error).includes("任务已中断");
      updatePage(page.id, cancelled
        ? { status: "ready", error: undefined }
        : { status: "error", error: String(error) });
      if (!cancelled) showNotice(String(error), "error");
    } finally {
      await finishNativeProcessing(jobId).catch(() => undefined);
      processingTracker.current.releasePage(page.id, jobId);
      processingTracker.current.finishJob(jobId);
      cancelledJobs.current.delete(jobId);
      syncProcessingCount();
    }
  };

  const processAllPages = async () => {
    if (!pages.length || activeBatchJob.current) return;
    if (!(await processingAvailable()) || activeBatchJob.current) return;
    const targets = pages.filter((page) => page.status === "ready" || page.status === "error");
    if (!targets.length) return;
    const jobId = crypto.randomUUID();
    activeBatchJob.current = jobId;
    processingTracker.current.startJob(jobId);
    syncProcessingCount();
    try {
      await startNativeProcessing(jobId);
      await runConcurrent(targets, settings.concurrency, async (page) => {
        if (!processingTracker.current.tryClaimPage(page.id, jobId)) return;
        updatePage(page.id, { status: "processing", error: undefined });
        try {
          const result = await processNativePage(jobId, requestForPage(page));
          updatePage(page.id, { status: "completed", result });
        } catch (error) {
          const cancelled = cancelledJobs.current.has(jobId) || String(error).includes("任务已中断");
          updatePage(page.id, cancelled
            ? { status: "ready", error: undefined }
            : { status: "error", error: String(error) });
        } finally {
          processingTracker.current.releasePage(page.id, jobId);
        }
      }, () => cancelledJobs.current.has(jobId));
      showNotice(cancelledJobs.current.has(jobId) ? "任务已中断，未完成页面已保留" : "队列处理完成", "success");
    } catch (error) {
      showNotice(String(error), "error");
    } finally {
      await finishNativeProcessing(jobId).catch(() => undefined);
      if (activeBatchJob.current === jobId) activeBatchJob.current = undefined;
      processingTracker.current.finishJob(jobId);
      cancelledJobs.current.delete(jobId);
      syncProcessingCount();
    }
  };

  const stopProcessing = async () => {
    const jobIds = processingTracker.current.activeJobIds();
    if (!jobIds.length || stopping) return;
    for (const jobId of jobIds) cancelledJobs.current.add(jobId);
    setStopping(true);
    try {
      const results = await Promise.allSettled(jobIds.map(cancelNativeProcessing));
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        showNotice(`部分请求无法取消：${String(failure.reason)}`, "error");
      }
    } finally {
      setStopping(false);
    }
  };

  const exportPngResults = async () => {
    const completed = completedPagesInQueueOrder(pages);
    if (!completed.length) return;
    try {
      if (isNative() && completed.length > 1) {
        const folder = await chooseOutputFolder();
        if (!folder) return;
        await Promise.all(completed.map(async (page, index) => {
          const output = await renderPageToPng(page);
          await writeOutput(`${folder}/hanami-${String(index + 1).padStart(3, "0")}.png`, output);
        }));
      } else {
        const page = selectedPage?.status === "completed" ? selectedPage : completed[0];
        const output = await renderPageToPng(page);
        if (isNative()) {
          const path = await chooseOutputFile(`${page.name.replace(/\.[^.]+$/, "")}-translated.png`);
          if (!path) return;
          await writeOutput(path, output);
        } else {
          const anchor = document.createElement("a");
          anchor.href = output;
          anchor.download = "hanami-translated.png";
          anchor.click();
        }
      }
      showNotice("已导出 PNG", "success");
    } catch (error) {
      showNotice(String(error), "error");
    }
  };

  const exportPdfResults = async () => {
    const completed = completedPagesInQueueOrder(pages);
    if (!completed.length) return;
    try {
      const output = await buildPdfBytes(completed);
      const defaultName = completed.length === 1
        ? `${completed[0].name.replace(/\.[^.]+$/, "")}-translated.pdf`
        : "hanami-translated.pdf";
      if (isNative()) {
        const path = await chooseOutputPdf(defaultName);
        if (!path) return;
        await writeOutput(path, pdfBytesToDataUrl(output));
      } else {
        downloadPdf(output, defaultName);
      }
      showNotice(`已按页面顺序导出 ${completed.length} 页 PDF`, "success");
    } catch (error) {
      showNotice(String(error), "error");
    }
  };

  const addRegion = (kind: MaskKind, rect: NormalizedRect) => {
    if (!selectedPage) return;
    const region = { id: crypto.randomUUID(), kind, rect };
    updatePage(selectedPage.id, { regions: [...selectedPage.regions, region], status: "ready", result: undefined });
    setSelectedRegionId(region.id);
  };

  const deleteRegion = (id: string) => {
    if (!selectedPage) return;
    updatePage(selectedPage.id, { regions: selectedPage.regions.filter((region) => region.id !== id), status: "ready", result: undefined });
    if (selectedRegionId === id) setSelectedRegionId(undefined);
  };

  const updateRegion = (id: string, rect: NormalizedRect) => {
    const pageId = selectedPage?.id;
    if (!pageId) return;
    setPages((current) => current.map((page) => page.id === pageId ? {
      ...page,
      regions: page.regions.map((region) => region.id === id ? { ...region, rect } : region),
      status: "ready",
      result: undefined,
      error: undefined,
    } : page));
  };

  const updatePage = (id: string, patch: Partial<PageItem>) => {
    setPages((current) => current.map((page) => page.id === id ? { ...page, ...patch } : page));
  };

  const showNotice = (message: string, kind: "success" | "error" = "success") => setNotice({ message, kind });

  return (
    <div className={`app-shell ${dragging ? "dragging" : ""}`}>
      <input ref={browserInput} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event) => void importBrowserFiles(event.target.files)} />
      <Sidebar pages={pages} selectedId={selectedPage?.id} onSelect={(id) => { setSelectedId(id); setSelectedRegionId(undefined); }} onImages={() => void chooseAndImport("images")} onFolder={() => void chooseAndImport("folder")} onPdf={() => void chooseAndImport("pdf")} />
      <div className="main-column">
        <TopToolbar
          title={title}
          subtitle={subtitle}
          processing={processing}
          stopping={stopping}
          canExport={completedCount > 0}
          onProcess={() => void processAllPages()}
          onStop={() => void stopProcessing()}
          onExportPng={() => void exportPngResults()}
          onExportPdf={() => void exportPdfResults()}
          onSettings={() => setSettingsOpen(true)}
        />
        <div className="work-area">
          <CanvasWorkbench page={selectedPage} selectedRegionId={selectedRegionId} drawingKind={drawingKind} onSelectRegion={setSelectedRegionId} onDrawingKindChange={setDrawingKind} onAddRegion={addRegion} onUpdateRegion={updateRegion} />
          <Inspector page={selectedPage} settings={settings} selectedRegionId={selectedRegionId} onSettingsChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} onSelectRegion={setSelectedRegionId} onDeleteRegion={deleteRegion} onDrawRegion={setDrawingKind} onRetryPage={() => void processSelectedPage()} />
        </div>
      </div>
      {dragging && <div className="drop-overlay"><strong>释放以加入队列</strong></div>}
      {notice && <div className={`toast ${notice.kind}`} role="status">{notice.message}</div>}
      <SettingsModal open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onSettingsChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} onNotice={showNotice} />
    </div>
  );
}

function browserDemoAsset(): SourceAsset {
  return { id: "demo-page", name: "演示漫画页", sourceKind: "demo", path: "", dataUrl: "/demo-manga.png", width: 1400, height: 1900, pageNumber: 1 };
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function imageDimensions(source: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = source;
  });
}
