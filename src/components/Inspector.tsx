import { Minus, Plus, ScanText, ShieldOff, Trash2 } from "lucide-react";
import type { AppSettings, MaskKind, PageItem } from "../types";

interface InspectorProps {
  page?: PageItem;
  settings: AppSettings;
  selectedRegionId?: string;
  onSettingsChange: (patch: Partial<AppSettings>) => void;
  onSelectRegion: (id: string) => void;
  onDeleteRegion: (id: string) => void;
  onDrawRegion: (kind: MaskKind) => void;
  onRetryPage: () => void;
}

export function Inspector({ page, settings, selectedRegionId, onSettingsChange, onSelectRegion, onDeleteRegion, onDrawRegion, onRetryPage }: InspectorProps) {
  const regions = page?.regions ?? [];

  return (
    <aside className="inspector" aria-label="图像编辑设置">
      {page?.error && (
        <section className="page-error" role="alert">
          <strong>当前页处理失败</strong>
          <p>{page.error}</p>
        </section>
      )}
      <section className="inspector-section">
        <h2>图像翻译</h2>
        <label className="field-label" htmlFor="page-type">页面类型</label>
        <select id="page-type" value={settings.pageType} onChange={(event) => onSettingsChange({ pageType: event.target.value })}>
          <option value="manga page">漫画</option>
          <option value="poster">海报</option>
          <option value="document page">文档</option>
          <option value="illustration">插图</option>
        </select>

        <div className="language-grid">
          <label>
            <span className="field-label">原始语言</span>
            <select value={settings.sourceLanguage} onChange={(event) => onSettingsChange({ sourceLanguage: event.target.value })}>
              <option value="Japanese">日语</option><option value="English">英语</option><option value="Korean">韩语</option><option value="Chinese">中文</option><option value="Auto-detect">自动识别</option>
            </select>
          </label>
          <label>
            <span className="field-label">目标语言</span>
            <select value={settings.targetLanguage} onChange={(event) => onSettingsChange({ targetLanguage: event.target.value })}>
              <option value="Simplified Chinese">简体中文</option><option value="Traditional Chinese">繁体中文</option><option value="English">英语</option><option value="Japanese">日语</option><option value="Korean">韩语</option>
            </select>
          </label>
        </div>

        <label className="field-label" htmlFor="additional-instructions">附加要求</label>
        <textarea
          id="additional-instructions"
          className="instructions-input"
          rows={3}
          value={settings.additionalInstructions}
          placeholder="例如：保留拟声词，不翻译角色名"
          onChange={(event) => onSettingsChange({ additionalInstructions: event.target.value })}
        />

        <div className="setting-row">
          <span><strong>并发页数</strong><small>同时调用 {settings.apiMode === "responses" ? "Responses" : "Images"} API</small></span>
          <div className="stepper">
            <button type="button" onClick={() => onSettingsChange({ concurrency: Math.max(1, settings.concurrency - 1) })} aria-label="减少并发"><Minus size={14} /></button>
            <output>{settings.concurrency}</output>
            <button type="button" onClick={() => onSettingsChange({ concurrency: Math.min(8, settings.concurrency + 1) })} aria-label="增加并发"><Plus size={14} /></button>
          </div>
        </div>
        <button className="secondary-command" type="button" onClick={onRetryPage} disabled={page?.status === "processing"}>
          {page?.status === "processing" ? "正在处理" : page?.error ? "重试当前页" : "处理当前页"}
        </button>
      </section>

      <section className="inspector-section region-section">
        <div className="section-heading"><h2>页面范围</h2></div>
        <div className="region-action-row">
          <button type="button" onClick={() => onDrawRegion("textEdit")}><ScanText size={16} /><span><strong>文字范围</strong><small>仅上传并修改框内内容</small></span></button>
          <button className="privacy" type="button" onClick={() => onDrawRegion("privacy")}><ShieldOff size={16} /><span><strong>隐私遮挡</strong><small>上传前移除，导出时回填</small></span></button>
        </div>
        {!regions.length ? (
          <div className="region-empty">未限定范围，将处理整页图片</div>
        ) : (
          <div className="mask-list">
            {regions.map((region, index) => (
              <div
                className={`mask-row ${region.kind === "privacy" ? "privacy" : ""} ${selectedRegionId === region.id ? "selected" : ""}`}
                key={region.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectRegion(region.id)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectRegion(region.id); }}
              >
                {region.kind === "privacy" ? <ShieldOff size={15} /> : <ScanText size={15} />}
                <span>{region.kind === "privacy" ? "隐私遮挡" : "文字范围"} {index + 1}</span>
                <span
                  className="delete-mask"
                  role="button"
                  tabIndex={0}
                  aria-label="删除范围"
                  onClick={(event) => { event.stopPropagation(); onDeleteRegion(region.id); }}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onDeleteRegion(region.id); }}
                ><Trash2 size={14} /></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
