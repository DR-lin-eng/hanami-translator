import { CheckCircle2, KeyRound, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiKeyConfigured, deleteApiKey, isNative, saveApiKey, testApiConnection } from "../lib/native";
import type { AppSettings } from "../types";

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSettingsChange: (patch: Partial<AppSettings>) => void;
  onNotice: (message: string, kind?: "success" | "error") => void;
}

export function SettingsModal({ open, settings, onClose, onSettingsChange, onNotice }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && isNative()) apiKeyConfigured().then(setConfigured).catch(() => setConfigured(false));
  }, [open]);

  if (!open) return null;

  const saveKey = async () => {
    if (!isNative()) return onNotice("API Key 仅在桌面版保存到本机", "error");
    setBusy(true);
    try {
      await saveApiKey(apiKey);
      setApiKey("");
      setConfigured(true);
      onNotice("API Key 已保存，重启后会自动读取", "success");
    } catch (error) {
      onNotice(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setBusy(true);
    try {
      await deleteApiKey();
      setConfigured(false);
      onNotice("API Key 已移除", "success");
    } catch (error) {
      onNotice(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    try {
      await testApiConnection(settings);
      onNotice("连接正常，所选模型可访问；绘图能力以实际处理为准", "success");
    } catch (error) {
      onNotice(String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <div><h2 id="settings-title">API 与模型</h2><p>{settings.apiMode === "responses" ? "Responses API · 图像编辑" : "Images Edit API"}</p></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭设置" title="关闭"><X size={18} /></button>
        </header>

        <div className="settings-content">
          <div className="settings-group">
            <div className="settings-group-title"><KeyRound size={17} /><span>OpenAI API Key</span>{configured && <span className="configured"><CheckCircle2 size={14} />已配置</span>}</div>
            <div className="key-entry">
              <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={configured ? "输入新 Key 以替换" : "sk-..."} autoComplete="off" />
              <button className="secondary-command" type="button" onClick={saveKey} disabled={busy || !apiKey.trim()}>保存到本机</button>
              {configured && <button className="icon-button destructive" type="button" onClick={removeKey} disabled={busy} aria-label="移除 API Key" title="移除 API Key"><Trash2 size={16} /></button>}
            </div>
          </div>

          <div className="settings-group">
            <span className="field-label" id="api-mode-label">绘图接口</span>
            <div className="segmented-control full api-mode-control" role="group" aria-labelledby="api-mode-label">
              {(["images", "responses"] as const).map((apiMode) => (
                <button type="button" key={apiMode} aria-pressed={settings.apiMode === apiMode} className={settings.apiMode === apiMode ? "active" : ""} onClick={() => onSettingsChange({ apiMode })}>
                  {apiMode === "images" ? "Images" : "Responses"}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-group two-column">
            <label><span>API 地址</span><input value={settings.apiBase} onChange={(event) => onSettingsChange({ apiBase: event.target.value })} spellCheck={false} /></label>
            <label><span>图像模型</span><input value={settings.imageModel} onChange={(event) => onSettingsChange({ imageModel: event.target.value })} spellCheck={false} /></label>
          </div>

          {settings.apiMode === "responses" && (
            <div className="settings-group">
              <label><span>Responses 主模型</span><input value={settings.responsesModel} onChange={(event) => onSettingsChange({ responsesModel: event.target.value })} placeholder="gpt-5" aria-describedby="responses-model-help" spellCheck={false} /></label>
              <p id="responses-model-help" className="settings-help">主模型需支持绘图工具；使用中转服务时填写其支持的路由模型。两项配置会自动保存。</p>
            </div>
          )}

          <div className="settings-group">
            <span className="field-label">生成质量</span>
            <div className="segmented-control full quality-control" aria-label="图像生成质量">
              {(["low", "medium", "high", "auto"] as const).map((quality) => (
                <button type="button" key={quality} className={settings.quality === quality ? "active" : ""} onClick={() => onSettingsChange({ quality })}>
                  {{ low: "快速", medium: "标准", high: "精细", auto: "自动" }[quality]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer>
          <button className="secondary-command" type="button" onClick={testConnection} disabled={!configured || busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}测试连接
          </button>
          <button className="primary-command" type="button" onClick={onClose}>完成</button>
        </footer>
      </section>
    </div>
  );
}
