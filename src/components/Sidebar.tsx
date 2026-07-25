import { FileImage, FileText, FolderOpen, ImagePlus, Layers3, LoaderCircle, TriangleAlert } from "lucide-react";
import type { PageItem } from "../types";

interface SidebarProps {
  pages: PageItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onImages: () => void;
  onFolder: () => void;
  onPdf: () => void;
}

export function Sidebar({ pages, selectedId, onSelect, onImages, onFolder, onPdf }: SidebarProps) {
  const completeCount = pages.filter((page) => page.status === "completed").length;

  return (
    <aside className="sidebar" aria-label="项目页面">
      <div className="brand" data-tauri-drag-region>
        <div className="brand-mark" aria-hidden="true">文</div>
        <div>
          <strong>花见翻译</strong>
          <span>{pages.length ? `${completeCount}/${pages.length} 已完成` : "新项目"}</span>
        </div>
      </div>

      <div className="import-actions" role="group" aria-label="导入素材">
        <button className="import-button" onClick={onImages} type="button">
          <ImagePlus size={17} />图片
        </button>
        <button className="import-button" onClick={onFolder} type="button">
          <FolderOpen size={17} />文件夹
        </button>
        <button className="import-button" onClick={onPdf} type="button">
          <FileText size={17} />PDF
        </button>
      </div>

      <div className="sidebar-section-title">
        <span>页面</span>
        <span>{pages.length}</span>
      </div>

      <div className="page-list" role="list">
        {pages.map((page, index) => (
          <button
            key={page.id}
            className={`page-row ${selectedId === page.id ? "selected" : ""}`}
            onClick={() => onSelect(page.id)}
            type="button"
            role="listitem"
            aria-current={selectedId === page.id ? "page" : undefined}
          >
            <img src={page.dataUrl} alt="" />
            <span className="page-row-copy">
              <strong>{page.pageNumber ? `第 ${page.pageNumber} 页` : page.name}</strong>
              <small>{page.sourceKind === "pdfPage" ? "PDF" : page.sourceKind === "demo" ? "演示" : `图片 ${index + 1}`}</small>
            </span>
            <StatusIcon status={page.status} />
          </button>
        ))}
      </div>

      <div className="drop-hint">
        <Layers3 size={16} />
        <span>可将图片、文件夹或 PDF 拖到窗口</span>
      </div>
    </aside>
  );
}

function StatusIcon({ status }: { status: PageItem["status"] }) {
  if (status === "processing") return <LoaderCircle className="spin status-processing" size={16} aria-label="处理中" />;
  if (status === "completed") return <span className="status-dot status-complete" aria-label="已完成" />;
  if (status === "error") return <TriangleAlert className="status-error" size={16} aria-label="失败" />;
  return <FileImage className="status-ready" size={15} aria-label="待处理" />;
}
