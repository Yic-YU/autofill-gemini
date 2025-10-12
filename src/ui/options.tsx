import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

interface OptionsFormState {
  apiKey: string;
  model: string;
  activeProfile: string;
  minConfidence: number;
  maxSummaryChars: number;
  phoneFormat: string;
  enableSiteMemory: boolean;
}

const DEFAULT_STATE: OptionsFormState = {
  apiKey: "",
  model: "gemini-1.5-flash-latest",
  activeProfile: "profile.default.json",
  minConfidence: 0.6,
  maxSummaryChars: 500,
  phoneFormat: "+86-000-0000-0000",
  enableSiteMemory: true
};

function OptionsPage(): JSX.Element {
  const [state, setState] = useState<OptionsFormState>(DEFAULT_STATE);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await storageGet<Partial<OptionsFormState>>("options");
        if (stored) {
          setState((current) => ({ ...current, ...stored }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  function updateField<K extends keyof OptionsFormState>(field: K, value: OptionsFormState[K]): void {
    setState((current) => ({ ...current, [field]: value }));
    setStatus("idle");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      await storageSet("options", state);
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="options">
      <header>
        <h1>Resume Autofill Settings</h1>
        <p>Configure Gemini Flash access, profile selection, and confidence thresholds.</p>
      </header>
      <form onSubmit={handleSubmit}>
        <section>
          <h2>Gemini Flash</h2>
          <label>
            API Key
            <input
              type="password"
              value={state.apiKey}
              onChange={(event) => updateField("apiKey", event.target.value)}
              placeholder="Enter your Gemini API key"
              autoComplete="off"
            />
          </label>
          <label>
            Model Name
            <input
              type="text"
              value={state.model}
              onChange={(event) => updateField("model", event.target.value)}
            />
          </label>
        </section>

        <section>
          <h2>Profile &amp; Thresholds</h2>
          <label>
            Active Profile File
            <input
              type="text"
              value={state.activeProfile}
              onChange={(event) => updateField("activeProfile", event.target.value)}
              placeholder="profile.default.json"
            />
          </label>
          <label>
            Minimum Confidence
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
            Max Summary Characters
            <input
              type="number"
              min={0}
              value={state.maxSummaryChars}
              onChange={(event) => updateField("maxSummaryChars", Number(event.target.value))}
            />
          </label>
          <label>
            Phone Format
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
            Enable site memory hints
          </label>
        </section>

        <div className="actions">
          <button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Save Settings"}
          </button>
          {status === "saved" && <span className="status ok">Saved!</span>}
          {status === "error" && <span className="status error">{error}</span>}
        </div>
      </form>
    </main>
  );
}

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result[key] as T | undefined);
    });
  });
}

function storageSet<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
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
