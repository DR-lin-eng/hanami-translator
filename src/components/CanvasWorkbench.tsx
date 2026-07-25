import { Eye, Languages, Minus, Plus, ScanText, ShieldOff } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { expandNormalizedRect, MIN_REGION_SIZE, transformNormalizedRect, type RegionTransform } from "../lib/regions";
import type { MaskKind, MaskRegion, NormalizedRect, PageItem } from "../types";

interface CanvasWorkbenchProps {
  page?: PageItem;
  selectedRegionId?: string;
  drawingKind?: MaskKind;
  onSelectRegion: (id?: string) => void;
  onDrawingKindChange: (kind?: MaskKind) => void;
  onAddRegion: (kind: MaskKind, rect: NormalizedRect) => void;
  onUpdateRegion: (id: string, rect: NormalizedRect) => void;
}

type ViewMode = "original" | "translated";
const RESIZE_HANDLES: Exclude<RegionTransform, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function CanvasWorkbench({
  page,
  selectedRegionId,
  drawingKind,
  onSelectRegion,
  onDrawingKindChange,
  onAddRegion,
  onUpdateRegion,
}: CanvasWorkbenchProps) {
  const [view, setView] = useState<ViewMode>("translated");
  const [zoom, setZoom] = useState(0.78);
  const [draft, setDraft] = useState<NormalizedRect>();
  const startRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const transformRef = useRef<{
    pointerId: number;
    region: MaskRegion;
    start: { x: number; y: number };
    transform: RegionTransform;
  } | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const aspectRatio = page ? page.width / page.height : 0.74;
  const zoomLabel = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);

  const pointerPosition = (event: React.PointerEvent) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!drawingKind) return;
    const point = pointerPosition(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = point;
    setDraft({ ...point, width: 0, height: 0 });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drawingKind || !startRef.current) return;
    const point = pointerPosition(event);
    if (point) setDraft(normalizeDrag(startRef.current, point));
  };

  const onPointerUp = () => {
    if (drawingKind && draft && draft.width >= MIN_REGION_SIZE && draft.height >= MIN_REGION_SIZE) {
      onAddRegion(drawingKind, draft);
    }
    startRef.current = undefined;
    setDraft(undefined);
  };

  const startRegionTransform = (
    event: React.PointerEvent<HTMLElement>,
    region: MaskRegion,
    transform: RegionTransform,
  ) => {
    const point = pointerPosition(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectRegion(region.id);
    transformRef.current = { pointerId: event.pointerId, region, start: point, transform };
  };

  const updateRegionTransform = (event: React.PointerEvent) => {
    const active = transformRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = pointerPosition(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    onUpdateRegion(active.region.id, transformNormalizedRect(active.region.rect, active.transform, {
      x: point.x - active.start.x,
      y: point.y - active.start.y,
    }));
  };

  const finishRegionTransform = (event: React.PointerEvent) => {
    if (transformRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    transformRef.current = undefined;
  };

  const nudgeRegion = (event: React.KeyboardEvent, region: MaskRegion) => {
    const directions: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 0.02 : 0.005;
    onUpdateRegion(region.id, transformNormalizedRect(region.rect, "move", {
      x: direction.x * step,
      y: direction.y * step,
    }));
  };

  const textRegions = page?.regions.filter((region) => region.kind === "textEdit") ?? [];
  const showingTranslated = view === "translated" && Boolean(page?.result);
  const previewSource = showingTranslated && !textRegions.length
    ? page?.result?.generatedImageDataUrl
    : page?.dataUrl;

  return (
    <section className="canvas-workbench" aria-label="页面画布">
      <div className="canvas-toolbar">
        <div className="segmented-control" aria-label="预览模式">
          <button type="button" className={view === "original" ? "active" : ""} onClick={() => setView("original")}>
            <Eye size={15} />原图
          </button>
          <button type="button" className={view === "translated" ? "active" : ""} onClick={() => setView("translated")}>
            <Languages size={15} />译图
          </button>
        </div>
        <div className="canvas-tool-group">
          <button
            className={`tool-button ${drawingKind === "textEdit" ? "active" : ""}`}
            type="button"
            onClick={() => onDrawingKindChange(drawingKind === "textEdit" ? undefined : "textEdit")}
            disabled={!page}
            title="仅上传并修改框内内容"
          >
            <ScanText size={16} />文字范围
          </button>
          <button
            className={`tool-button privacy ${drawingKind === "privacy" ? "active" : ""}`}
            type="button"
            onClick={() => onDrawingKindChange(drawingKind === "privacy" ? undefined : "privacy")}
            disabled={!page}
            title="上传前在本机遮挡，导出时回填"
          >
            <ShieldOff size={16} />隐私遮挡
          </button>
          <span className="toolbar-divider" />
          <button className="icon-button compact" type="button" onClick={() => setZoom((value) => Math.max(0.4, value - 0.1))} aria-label="缩小" title="缩小"><Minus size={16} /></button>
          <span className="zoom-label">{zoomLabel}</span>
          <button className="icon-button compact" type="button" onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} aria-label="放大" title="放大"><Plus size={16} /></button>
        </div>
      </div>

      <div className={`canvas-scroll ${drawingKind ? "drawing" : ""}`} onClick={() => !drawingKind && onSelectRegion(undefined)}>
        {page && previewSource ? (
          <div
            ref={stageRef}
            className="canvas-sheet"
            style={{ aspectRatio, width: `${Math.round(zoom * 72)}vh` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <img src={previewSource} alt={page.name} draggable={false} />
            {showingTranslated && page.result && textRegions.map((region) => (
              <ImageCrop key={`generated-${region.id}`} source={page.result!.generatedImageDataUrl} rect={region.rect} />
            ))}
            {showingTranslated && page.result && page.regions.filter((region) => region.kind === "privacy").map((region) => (
              <ImageCrop
                key={`restore-${region.id}`}
                source={page.dataUrl}
                rect={expandNormalizedRect(region.rect, page.result!.privacyRestorePadding)}
              />
            ))}
            {page.regions.map((region, index) => (
              <button
                className={`mask-region ${region.kind === "privacy" ? "privacy" : "text-edit"} ${selectedRegionId === region.id ? "selected" : ""}`}
                style={rectStyle(region.rect)}
                key={region.id}
                type="button"
                onPointerDown={(event) => startRegionTransform(event, region, "move")}
                onPointerMove={updateRegionTransform}
                onPointerUp={finishRegionTransform}
                onPointerCancel={finishRegionTransform}
                onClick={(event) => { event.stopPropagation(); onSelectRegion(region.id); }}
                onKeyDown={(event) => nudgeRegion(event, region)}
                aria-label={`${region.kind === "privacy" ? "隐私遮挡" : "文字范围"} ${index + 1}`}
                title="拖动移动；使用控制点调整大小"
              >
                <span className="region-index">{index + 1}</span>
                {selectedRegionId === region.id && RESIZE_HANDLES.map((handle) => (
                  <span
                    aria-hidden="true"
                    className={`resize-handle handle-${handle}`}
                    key={handle}
                    onPointerDown={(event) => startRegionTransform(event, region, handle)}
                  />
                ))}
              </button>
            ))}
            {draft && <div className={`draft-region ${drawingKind === "privacy" ? "privacy" : ""}`} style={rectStyle(draft)} />}
          </div>
        ) : (
          <div className="empty-canvas"><ScanText size={38} strokeWidth={1.4} /><strong>尚无页面</strong></div>
        )}
      </div>
    </section>
  );
}

function ImageCrop({ source, rect }: { source: string; rect: NormalizedRect }) {
  const cropStyle: React.CSSProperties = {
    left: `${-rect.x / rect.width * 100}%`,
    top: `${-rect.y / rect.height * 100}%`,
    width: `${100 / rect.width}%`,
    height: `${100 / rect.height}%`,
  };
  return <div className="source-crop" style={rectStyle(rect)}><img src={source} alt="" style={cropStyle} /></div>;
}

function rectStyle(rect: NormalizedRect): React.CSSProperties {
  return { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` };
}

function normalizeDrag(start: { x: number; y: number }, end: { x: number; y: number }): NormalizedRect {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}
