import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { FieldCandidates, FillPlan, FillPlanEntry } from "../lib/schema";

type ViewStatus = "idle" | "scanning" | "planning" | "ready" | "applying" | "error";

const LOW_CONFIDENCE_THRESHOLD = 0.6;

function Popup(): JSX.Element {
  const [status, setStatus] = useState<ViewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FieldCandidates>([]);
  const [fillPlan, setFillPlan] = useState<FillPlan>([]);

  const hasPlan = fillPlan.length > 0;
  const lowConfidenceItems = useMemo(
    () => fillPlan.filter((entry) => entry.confidence < LOW_CONFIDENCE_THRESHOLD),
    [fillPlan]
  );

  async function handleScan(): Promise<void> {
    setStatus("scanning");
    setError(null);
    try {
      const response = await runtimeRequest<{ ok: boolean; candidates?: FieldCandidates; error?: string }>({
        type: "popup-scan-active-tab"
      });
      if (!response.ok || !response.candidates) {
        throw new Error(response.error ?? "Scan failed");
      }
      setCandidates(response.candidates);
      setFillPlan([]);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePlan(): Promise<void> {
    if (!candidates.length) {
      setError("Scan the page before requesting a fill plan.");
      return;
    }

    setStatus("planning");
    setError(null);
    try {
      const response = await runtimeRequest<{ ok: boolean; plan?: FillPlan; error?: string }>({
        type: "popup-request-plan",
        candidates
      });
      if (!response.ok || !response.plan) {
        throw new Error(response.error ?? "Plan generation failed");
      }
      setFillPlan(response.plan);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
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
        throw new Error(response.error ?? "Apply failed");
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
        throw new Error(response.error ?? "Rollback failed");
      }
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="popup">
      <header>
        <h1>Resume Autofill (Flash)</h1>
        <p className="subtitle">Scan the active tab, preview the plan, then execute or rollback.</p>
      </header>

      <div className="controls">
        <button onClick={handleScan} disabled={status === "scanning" || status === "planning"}>
          {status === "scanning" ? "Scanning…" : "Scan Page"}
        </button>
        <button onClick={handlePlan} disabled={status !== "ready" && status !== "idle"}>
          {status === "planning" ? "Planning…" : "Call Flash"}
        </button>
        <button onClick={handleApply} disabled={!hasPlan || status === "applying"}>
          Apply Fill Plan
        </button>
        <button onClick={handleRollback} disabled={status === "applying"}>
          Rollback
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <section className="field-section">
        <h2>Detected Fields</h2>
        <p className="hint">{candidates.length ? `${candidates.length} fields detected.` : "Run scan to populate."}</p>
        <div className="list">
          {candidates.map((candidate) => (
            <div className="list-item" key={candidate.elKey}>
              <div className="item-header">
                <span className="role">{candidate.role}</span>
                <span className="el-key">{candidate.elKey}</span>
              </div>
              <div className="item-body">
                <small>{candidate.hints.label ?? candidate.hints.placeholder ?? "No primary hint"}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="field-section">
        <h2>
          Fill Plan {hasPlan && <span className="minor">({fillPlan.length} items)</span>}
        </h2>
        {lowConfidenceItems.length > 0 && (
          <div className="warning">
            {lowConfidenceItems.length} item{lowConfidenceItems.length === 1 ? "" : "s"} below{" "}
            {LOW_CONFIDENCE_THRESHOLD * 100}% confidence.
          </div>
        )}
        <div className="plan-table">
          <div className="plan-row header">
            <span>Element</span>
            <span>Target</span>
            <span>Value</span>
            <span>Confidence</span>
          </div>
          {fillPlan.map((entry) => (
            <PlanRow key={entry.elKey} entry={entry} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanRow({ entry }: { entry: FillPlanEntry }): JSX.Element {
  const isLowConfidence = entry.confidence < LOW_CONFIDENCE_THRESHOLD;
  return (
    <div className={`plan-row${isLowConfidence ? " low-confidence" : ""}`}>
      <span>{entry.elKey}</span>
      <span>{entry.targetKey}</span>
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

const container = document.getElementById("root");

if (!container) {
  throw new Error("Popup root element not found");
}

createRoot(container).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
