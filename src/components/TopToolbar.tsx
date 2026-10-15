import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Images, Play, Settings2, Square } from "lucide-react";

interface TopToolbarProps {
  title: string;
  subtitle: string;
  processing: boolean;
  stopping: boolean;
  exporting: boolean;
  canExport: boolean;
  onProcess: () => void;
  onStop: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onSettings: () => void;
}

export function TopToolbar({ title, subtitle, processing, stopping, exporting, canExport, onProcess, onStop, onExportPng, onExportPdf, onSettings }: TopToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (!exportMenu.current?.contains(event.target as Node)) setExportOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExportOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [exportOpen]);

  const runExport = (action: () => void) => {
    setExportOpen(false);
    action();
  };

  return (
    <header className="top-toolbar" data-tauri-drag-region>
      <div className="document-title" data-tauri-drag-region>
        <strong data-tauri-drag-region>{title}</strong>
        <span data-tauri-drag-region>{subtitle}</span>
      </div>
      <div className="toolbar-actions">
        <button className="icon-button" onClick={onSettings} type="button" aria-label="API 与模型设置" title="API 与模型设置">
          <Settings2 size={18} />
        </button>
        <div className="export-menu" ref={exportMenu}>
          <button
            className="secondary-command"
            onClick={() => setExportOpen((open) => !open)}
            type="button"
            disabled={!canExport || exporting}
            aria-busy={exporting}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
          >
            <Download size={17} />{exporting ? "导出中" : "导出"}<ChevronDown size={14} />
          </button>
          {exportOpen && (
            <div className="export-popover" role="menu" aria-label="导出格式">
              <button type="button" role="menuitem" onClick={() => runExport(onExportPng)}>
                <Images size={17} /><span>PNG 图片</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runExport(onExportPdf)}>
                <FileText size={17} /><span>PDF 文档</span>
              </button>
            </div>
          )}
        </div>
        {processing ? (
          <button className="stop-command" onClick={onStop} type="button" disabled={stopping} aria-label="中断当前处理任务">
            <Square size={14} fill="currentColor" />
            {stopping ? "正在中断" : "中断任务"}
          </button>
        ) : (
          <button className="primary-command" onClick={onProcess} type="button">
            <Play size={17} fill="currentColor" />开始处理
          </button>
        )}
      </div>
    </header>
  );
}
