import {
  FlashRequestPayload,
  FieldCandidates,
  FillPlan,
  FillPlanEntry,
  ProfileData,
  SiteMemory
} from "../lib/schema";
import { GeminiConfig, callGeminiFlash, repairJsonIfNeeded } from "../lib/gemini";
import { ExtensionOptions, getOptions } from "../lib/storage";
import { log } from "../lib/logger";

type PopupScanMessage = { type: "popup-scan-active-tab" };
type PopupRequestPlanMessage = { type: "popup-request-plan"; candidates: FieldCandidates };
type PopupApplyPlanMessage = { type: "popup-apply-plan"; plan: FillPlan };
type PopupRollbackMessage = { type: "popup-rollback-plan" };

type RuntimeCommand = PopupScanMessage | PopupRequestPlanMessage | PopupApplyPlanMessage | PopupRollbackMessage;

const FILL_PLAN_SCHEMA_DESCRIPTION = `
FillPlan[] => Array<FillPlanEntry>
FillPlanEntry => {
  elKey: string;
  targetKey: string | "unknown";
  value: string | string[];
  optionMatch?: { mode: "exact" | "contains" | "index"; index?: number; expectText?: string };
  confidence: number; // 0-1
  reason?: string;
}
`.trim();

class ResumeAutofillBackground {
  private optionsCache?: ExtensionOptions;
  private profileCache?: { path: string; profile: ProfileData };
  private siteMemoryCache = new Map<string, SiteMemory>();

  async initialize(): Promise<void> {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void this.dispatchMessage(message, sender)
        .then((result) => {
          sendResponse(result);
        })
        .catch((error: unknown) => {
          const messageText = error instanceof Error ? error.message : String(error);
          log("error", "Runtime message error", { message: messageText, original: error });
          sendResponse({ ok: false, error: messageText });
        });
      return true;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.options) {
        this.optionsCache = undefined;
        this.profileCache = undefined;
      }
    });
  }

  private async dispatchMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
    void sender;
    if (!isRuntimeCommand(message)) {
      return { ok: false, error: "Unknown command" };
    }

    switch (message.type) {
      case "popup-scan-active-tab":
        return this.handleScanRequest();
      case "popup-request-plan":
        return this.handlePlanRequest(message.candidates);
      case "popup-apply-plan":
        return this.handleApplyRequest(message.plan);
      case "popup-rollback-plan":
        return this.handleRollbackRequest();
      default:
        return { ok: false, error: "Unsupported command" };
    }
  }

  private async handleScanRequest(): Promise<unknown> {
    const tab = await this.requireActiveTab();
    const candidates = await this.collectFieldCandidates(tab.id!);
    return { ok: true, candidates };
  }

  private async handlePlanRequest(candidates: FieldCandidates): Promise<unknown> {
    if (!candidates || candidates.length === 0) {
      return { ok: false, error: "字段列表为空，请先扫描页面" };
    }

    const tab = await this.requireActiveTab();
    const payload = await this.prepareFlashPayload(candidates, tab);
    const plan = await this.invokeFlash(payload);
    return { ok: true, plan };
  }

  private async handleApplyRequest(plan: FillPlan): Promise<unknown> {
    if (!plan || plan.length === 0) {
      return { ok: false, error: "填充计划为空" };
    }
    const tab = await this.requireActiveTab();
    await this.sendMessageToTab(tab.id!, { type: "apply-fill-plan", plan });
    return { ok: true };
  }

  private async handleRollbackRequest(): Promise<unknown> {
    const tab = await this.requireActiveTab();
    await this.sendMessageToTab(tab.id!, { type: "rollback-fill-plan" });
    return { ok: true };
  }

  private async requireActiveTab(): Promise<chrome.tabs.Tab> {
    const tabs = await queryTabs({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || tab.id === undefined) {
      throw new Error("未找到活动的浏览器标签页");
    }
    return tab;
  }

  private async collectFieldCandidates(tabId: number): Promise<FieldCandidates> {
    try {
      const options = await this.getOptions();
      const response = await this.sendMessageToTab<{ ok: boolean; candidates?: FieldCandidates; error?: string }>(
        tabId,
        { type: "collect-field-candidates", skipPrefilled: options.skipPrefilledFields }
      );
      if (!response.ok || !response.candidates) {
        throw new Error(response.error ?? "采集字段失败");
      }
      return response.candidates;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`采集字段失败：${message}`);
    }
  }

  private async prepareFlashPayload(candidates: FieldCandidates, tab: chrome.tabs.Tab): Promise<FlashRequestPayload> {
    const [profile, options] = await Promise.all([this.readActiveProfile(), this.getOptions()]);
    const siteMemory = await this.resolveSiteMemory(tab, options);
    const instructions = this.composeInstructionText(options, tab.url ?? "", siteMemory);

    return {
      profile,
      fieldCandidates: candidates,
      siteMemory,
      instructions
    };
  }

  private composeInstructionText(options: ExtensionOptions, tabUrl: string, siteMemory?: SiteMemory): string {
    const host = safeHostFromUrl(tabUrl) ?? "未知站点";

    const memoryHint = siteMemory
      ? "已提供 siteMemory 作为 few-shot 提示，可优先考虑历史确认的映射。"
      : "当前没有可用的 siteMemory。";

    return [
      `你是一名表单自动填充助手。请根据提供的 profileData 与 fieldCandidates，返回可直接用于执行的 FillPlan JSON 数组。`,
      `目标站点：${host}`,
      memoryHint,
      `规则：`,
      `1. 只能使用 profileData.fields 中的值；不能擅自生成、联想或改写真实数据。`,
      `2. 如果无法确定映射，设置 targetKey="unknown"，value=""，confidence 应低于 ${options.minConfidence.toFixed(2)}。`,
      `3. 文本字段若需要压缩，请控制在 ${options.maxSummaryChars} 个字符以内。`,
      `4. 日期统一使用 YYYY-MM-DD。`,
      `5. 电话号码必须符合格式：${options.phoneFormat}。`,
      `6. 枚举字段（select/radio/checkbox）必须根据 candidates.options 给出 optionMatch，匹配优先级：exact → contains → index。`,
      `7. 返回严格的 JSON 数组，不得附加解释、Markdown 或额外文本。`,
      `8. confidence 必须是 0 到 1 的数字，reason 可选但建议说明决策依据。`,
      `FillPlan JSON 结构如下：\n${FILL_PLAN_SCHEMA_DESCRIPTION}`
    ].join("\n");
  }

  private async invokeFlash(payload: FlashRequestPayload): Promise<FillPlan> {
    const options = await this.getOptions();
    if (!options.apiKey) {
      throw new Error("尚未配置 Gemini API Key，请在 Options 页面填写后重试。");
    }

    const config: GeminiConfig = {
      apiKey: options.apiKey,
      model: options.model
    };

    const result = await callGeminiFlash(payload, config);
    let plan = this.tryParseFillPlan(result.rawText);

    if (!plan) {
      const repaired = await repairJsonIfNeeded(result.rawText, FILL_PLAN_SCHEMA_DESCRIPTION, config);
      plan = this.tryParseFillPlan(repaired);
      if (!plan) {
        throw new Error("Gemini 返回内容无法解析为 FillPlan JSON。");
      }
    }

    return plan;
  }

  private tryParseFillPlan(raw: string): FillPlan | undefined {
    try {
      const parsed = JSON.parse(sanitizeJson(raw));
      if (!Array.isArray(parsed)) {
        return undefined;
      }
      const sanitized: FillPlan = [];
      for (const entry of parsed) {
        const normalized = this.normalizePlanEntry(entry);
        if (normalized) {
          sanitized.push(normalized);
        }
      }
      return sanitized;
    } catch (error) {
      log("warn", "Failed to parse FillPlan JSON", { error, raw });
      return undefined;
    }
  }

  private normalizePlanEntry(entry: unknown): FillPlanEntry | null {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const candidate = entry as Partial<FillPlanEntry>;
    if (typeof candidate.elKey !== "string" || candidate.elKey.length === 0) {
      return null;
    }
    if (
      typeof candidate.targetKey !== "string" ||
      (candidate.targetKey !== "unknown" && candidate.targetKey.trim().length === 0)
    ) {
      return null;
    }

    const value = normalizeValue(candidate.value);
    const confidence = clampNumber(candidate.confidence, 0, 1);
    const optionMatch = normalizeOptionMatch(candidate.optionMatch);

    return {
      elKey: candidate.elKey,
      targetKey: candidate.targetKey,
      value,
      confidence,
      optionMatch,
      reason: typeof candidate.reason === "string" ? candidate.reason : undefined
    };
  }

  private async getOptions(): Promise<ExtensionOptions> {
    if (!this.optionsCache) {
      this.optionsCache = await getOptions();
    }
    return this.optionsCache;
  }

  private async readActiveProfile(): Promise<ProfileData> {
    const options = await this.getOptions();
    const profilePath = options.activeProfile;

    if (this.profileCache && this.profileCache.path === profilePath) {
      return this.profileCache.profile;
    }

    const url = chrome.runtime.getURL(`data/${profilePath}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`无法加载 profile 数据：${profilePath}`);
    }
    const profile = (await response.json()) as ProfileData;
    this.profileCache = { path: profilePath, profile };
    return profile;
  }

  private async resolveSiteMemory(tab: chrome.tabs.Tab, options: ExtensionOptions): Promise<SiteMemory | undefined> {
    if (!options.enableSiteMemory || !tab.url) {
      return undefined;
    }
    const host = safeHostFromUrl(tab.url);
    if (!host) {
      return undefined;
    }
    return this.siteMemoryCache.get(host);
  }

  private async sendMessageToTab<T>(tabId: number, message: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response: T) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }
}

function isRuntimeCommand(message: unknown): message is RuntimeCommand {
  return Boolean(message && typeof message === "object" && "type" in (message as Record<string, unknown>));
}

function sanitizeJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "");
    return withoutFence.trim();
  }
  return trimmed;
}

function normalizeValue(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function clampNumber(value: unknown, min: number, max: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) {
    return min;
  }
  return Math.min(Math.max(num, min), max);
}

function normalizeOptionMatch(match: FillPlanEntry["optionMatch"]): FillPlanEntry["optionMatch"] | undefined {
  if (!match) {
    return undefined;
  }
  if (typeof match !== "object") {
    return undefined;
  }
  if (match.mode !== "exact" && match.mode !== "contains" && match.mode !== "index") {
    return undefined;
  }
  const normalized: FillPlanEntry["optionMatch"] = { mode: match.mode };
  if (match.mode === "index" && typeof match.index === "number") {
    normalized.index = match.index;
  }
  if (match.expectText !== undefined) {
    normalized.expectText = String(match.expectText);
  }
  return normalized;
}

function safeHostFromUrl(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function queryTabs(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => {
    chrome.tabs.query(query, (tabs) => resolve(tabs));
  });
}

const background = new ResumeAutofillBackground();
void background.initialize();
