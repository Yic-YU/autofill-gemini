import React, { useEffect, useMemo, useState } from "react";
import { FieldCandidate, FieldCandidates, FillPlan, FillPlanEntry } from "../lib/schema";
import { ExtensionOptions, getOptions, saveOptions } from "../lib/storage";

type ViewStatus = "idle" | "scanning" | "planning" | "ready" | "applying" | "error";

const LOW_CONFIDENCE_THRESHOLD = 0.6;
const STATUS_LABELS: Record<ViewStatus, string> = {
  idle: "空闲",
  scanning: "扫描中",
  planning: "生成计划中",
  ready: "已准备",
  applying: "执行操作中",
  error: "出错"
};

export default function PanelApp(): JSX.Element {
  const [status, setStatus] = useState<ViewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FieldCandidates>([]);
  const [fillPlan, setFillPlan] = useState<FillPlan>([]);
  const [options, setOptions] = useState<ExtensionOptions | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  const hasPlan = fillPlan.length > 0;
  const lowConfidenceItems = useMemo(
    () => fillPlan.filter((entry) => entry.confidence < LOW_CONFIDENCE_THRESHOLD),
    [fillPlan]
  );
  const candidateLookup = useMemo(() => {
    const map = new Map<string, FieldCandidate>();
    candidates.forEach((candidate) => map.set(candidate.elKey, candidate));
    return map;
  }, [candidates]);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await getOptions();
        setOptions(stored);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  async function handleToggleSkipPrefilled(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    if (!options) {
      return;
    }
    const next = { ...options, skipPrefilledFields: event.target.checked };
    setOptions(next);
    try {
      await saveOptions(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleScan(): Promise<void> {
    setStatus("scanning");
    setError(null);
    try {
      const response = await runtimeRequest<{ ok: boolean; candidates?: FieldCandidates; error?: string }>({
        type: "popup-scan-active-tab"
      });
      if (!response.ok || !response.candidates) {
        throw new Error(response.error ?? "扫描失败");
      }
      setCandidates(response.candidates);
      setFillPlan([]);
      setLastPrompt(null);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePlan(): Promise<void> {
    if (!candidates.length) {
      setError("请先扫描页面，再生成填充计划。");
      return;
    }

    setStatus("planning");
    setError(null);
    setLastPrompt(null);
    try {
      const response = await runtimeRequest<{ ok: boolean; plan?: FillPlan; prompt?: string; error?: string }>({
        type: "popup-request-plan",
        candidates
      });
      if (!response.ok || !response.plan) {
        throw new Error(response.error ?? "生成填充计划失败");
      }
      setFillPlan(response.plan);
      setLastPrompt(response.prompt ?? null);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setLastPrompt(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleApply(): Promise<void> {
    if (!fillPlan.length) {
      return;
    }

    setStatus("applying");
    setError(null);
    try {
      const response = await runtimeRequest<{ ok: boolean; error?: string }>({
        type: "popup-apply-plan",
        plan: fillPlan
      });
      if (!response.ok) {
        throw new Error(response.error ?? "执行填充计划失败");
      }
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRollback(): Promise<void> {
    setStatus("applying");
    setError(null);
    try {
      const response = await runtimeRequest<{ ok: boolean; error?: string }>({
        type: "popup-rollback-plan"
      });
      if (!response.ok) {
        throw new Error(response.error ?? "撤销失败");
      }
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCopyPrompt(): Promise<void> {
    if (!lastPrompt) {
      return;
    }
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      setError("当前环境不支持复制到剪贴板。");
      return;
    }
    try {
      await navigator.clipboard.writeText(lastPrompt);
    } catch (err) {
      setError(err instanceof Error ? `复制 Prompt 失败：${err.message}` : "复制 Prompt 失败");
    }
  }

  return (
    <div className="popup">
      <header>
        <h1>简历自动填充（Flash）</h1>
        <p className="subtitle">扫描当前标签页，预览自动填充方案，然后执行或撤销。</p>
      </header>

      <div className="preferences">
        <label>
          <input
            type="checkbox"
            checked={options?.skipPrefilledFields ?? false}
            onChange={handleToggleSkipPrefilled}
            disabled={!options}
          />
          跳过已填写的表单字段
        </label>
      </div>

      <div className="controls">
        <button onClick={handleScan} disabled={status === "scanning" || status === "planning"}>
          {status === "scanning" ? "扫描中…" : "扫描页面"}
        </button>
        <button onClick={handlePlan} disabled={status !== "ready" && status !== "idle"}>
          {status === "planning" ? "生成中…" : "生成填充计划"}
        </button>
        <button onClick={handleApply} disabled={!hasPlan || status === "applying"}>
          {status === "applying" ? "执行操作中…" : "执行填充计划"}
        </button>
        <button onClick={handleRollback} disabled={status === "applying"}>
          {status === "applying" ? "执行操作中…" : "撤销"}
        </button>
        <button onClick={handleCopyPrompt} disabled={!lastPrompt}>
          复制 Prompt
        </button>
      </div>

      <p className="status-text">当前状态：{STATUS_LABELS[status]}</p>

      {error && <div className="error-banner">{error}</div>}

      <section className="field-section">
        <h2>识别出的字段</h2>
        <p className="hint">{candidates.length ? `已识别 ${candidates.length} 个字段。` : "请先执行页面扫描。"}</p>
        <div className="list">
          {candidates.map((candidate) => (
            <div className="list-item" key={candidate.elKey}>
              <div className="item-header">
                <span className="role">{candidate.role}</span>
                <span className="el-key">{candidate.elKey}</span>
              </div>
              <div className="item-body">
                <strong>{resolvePrimaryHint(candidate)}</strong>
                {resolveSupplementalHints(candidate).map((hint, index) => (
                  <small key={index}>{hint}</small>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="field-section">
        <h2>
          填充计划 {hasPlan && <span className="minor">（{fillPlan.length} 条）</span>}
        </h2>
        {lowConfidenceItems.length > 0 && (
          <div className="warning">
            {lowConfidenceItems.length} 条记录低于 {LOW_CONFIDENCE_THRESHOLD * 100}% 置信度，请人工确认。
          </div>
        )}
        <div className="plan-table">
          <div className="plan-row header">
            <span>元素</span>
            <span>目标键</span>
            <span>填充值</span>
            <span>置信度</span>
          </div>
          {fillPlan.map((entry) => (
            <PlanRow key={entry.elKey} entry={entry} candidate={candidateLookup.get(entry.elKey)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanRow({ entry, candidate }: { entry: FillPlanEntry; candidate?: FieldCandidate }): JSX.Element {
  const isLowConfidence = entry.confidence < LOW_CONFIDENCE_THRESHOLD;
  const primaryLabel = candidate ? resolvePrimaryHint(candidate) : undefined;
  return (
    <div className={`plan-row${isLowConfidence ? " low-confidence" : ""}`}>
      <span>
        {primaryLabel && <span className="plan-label">{primaryLabel}</span>}
        <small className="plan-el-key">{entry.elKey}</small>
      </span>
      <span>
        {entry.targetKey}
        {entry.reason && <small className="plan-reason">{entry.reason}</small>}
      </span>
      <span>{Array.isArray(entry.value) ? entry.value.join(", ") : entry.value}</span>
      <span>{Math.round(entry.confidence * 100)}%</span>
    </div>
  );
}

function runtimeRequest<T>(payload: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function resolvePrimaryHint(candidate: FieldCandidate): string {
  const { hints } = candidate;
  return (
    hints.label ??
    hints.neighborText ??
    hints.groupTitle ??
    hints.placeholder ??
    hints.nameOrId ??
    "未识别名称"
  );
}

function resolveSupplementalHints(candidate: FieldCandidate): string[] {
  const lines: string[] = [];
  const { hints, constraints } = candidate;
  const primary = resolvePrimaryHint(candidate);

  if (hints.label && hints.label !== primary) {
    lines.push(`标签：${hints.label}`);
  }
  if (hints.placeholder && hints.placeholder !== primary) {
    lines.push(`占位符：${hints.placeholder}`);
  }
  if (hints.nameOrId) {
    lines.push(`name/id：${hints.nameOrId}`);
  }
  if (hints.groupTitle) {
    lines.push(`分组：${hints.groupTitle}`);
  }
  if (hints.neighborText) {
    lines.push(`邻近文本：${truncateHint(hints.neighborText)}`);
  }
  if (hints.aria) {
    lines.push(`ARIA：${truncateHint(hints.aria)}`);
  }
  if (constraints.required) {
    lines.push("约束：必填");
  }

  return Array.from(new Set(lines));
}

function truncateHint(text: string, maxLength = 60): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}
