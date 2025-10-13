import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_OPTIONS, ExtensionOptions, getOptions, saveOptions } from "../lib/storage";

function OptionsPage(): JSX.Element {
  const [state, setState] = useState<ExtensionOptions>(DEFAULT_OPTIONS);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await getOptions();
        setState(stored);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  function updateField<K extends keyof ExtensionOptions>(field: K, value: ExtensionOptions[K]): void {
    setState((current) => ({ ...current, [field]: value }));
    setStatus("idle");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      await saveOptions(state);
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="options">
      <header>
        <h1>简历自动填充设置</h1>
        <p>配置 Gemini Flash 访问、档案选择以及置信度阈值。</p>
      </header>
      <form onSubmit={handleSubmit}>
        <section>
          <h2>Gemini Flash 配置</h2>
          <label>
            API Key
            <input
              type="password"
              value={state.apiKey}
              onChange={(event) => updateField("apiKey", event.target.value)}
              placeholder="请输入 Gemini API Key"
              autoComplete="off"
            />
          </label>
          <label>
            模型名称
            <input
              type="text"
              value={state.model}
              onChange={(event) => updateField("model", event.target.value)}
            />
          </label>
        </section>

        <section>
          <h2>档案与阈值</h2>
          <label>
            当前档案文件
            <input
              type="text"
              value={state.activeProfile}
              onChange={(event) => updateField("activeProfile", event.target.value)}
              placeholder="profile.default.json"
            />
          </label>
          <label>
            最低置信度
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={state.minConfidence}
              onChange={(event) => updateField("minConfidence", Number(event.target.value))}
            />
          </label>
          <label>
            概述字段最大字符数
            <input
              type="number"
              min={0}
              value={state.maxSummaryChars}
              onChange={(event) => updateField("maxSummaryChars", Number(event.target.value))}
            />
          </label>
          <label>
            电话号码格式
            <input
              type="text"
              value={state.phoneFormat}
              onChange={(event) => updateField("phoneFormat", event.target.value)}
              placeholder="+86-000-0000-0000"
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={state.enableSiteMemory}
              onChange={(event) => updateField("enableSiteMemory", event.target.checked)}
            />
            启用站点记忆提示
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={state.skipPrefilledFields}
              onChange={(event) => updateField("skipPrefilledFields", event.target.checked)}
            />
            跳过已填写的表单字段
          </label>
        </section>

        <div className="actions">
          <button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "保存中…" : "保存设置"}
          </button>
          {status === "saved" && <span className="status ok">已保存！</span>}
          {status === "error" && <span className="status error">{error}</span>}
        </div>
      </form>
    </main>
  );
}

const optionsRoot = document.getElementById("root");

if (!optionsRoot) {
  throw new Error("Options root element not found");
}

createRoot(optionsRoot).render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>
);
