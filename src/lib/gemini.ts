import { FlashRequestPayload } from "./schema";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  topP?: number;
}

export interface GeminiCallResult {
  rawText: string;
}

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export async function callGeminiFlash(payload: FlashRequestPayload, config: GeminiConfig): Promise<GeminiCallResult> {
  const prompt = buildPrimaryPrompt(payload);
  const rawText = await postPrompt(prompt, config);
  return { rawText };
}

export async function repairJsonIfNeeded(rawText: string, schemaDescription: string, config: GeminiConfig): Promise<string> {
  const prompt = [
    "以下文本应该是符合 FillPlan JSON 结构的有效 JSON，但当前无法解析。",
    "请根据给定的结构说明进行修复，仅返回有效 JSON。",
    "JSON 结构说明：",
    schemaDescription,
    "需要修复的内容：",
    rawText
  ].join("\n\n");
  return postPrompt(prompt, config);
}

async function postPrompt(prompt: string, config: GeminiConfig): Promise<string> {
  if (!config.apiKey) {
    throw new Error("未配置 Gemini API Key");
  }
  const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: config.temperature ?? 0,
        topP: config.topP ?? 0.95
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(formatGeminiError(response.status, errorText));
  }

  const json = await response.json();
  const text = extractText(json);
  if (!text) {
    throw new Error("Gemini 未返回可用文本");
  }
  return text.trim();
}

function extractText(response: unknown): string | undefined {
  const data = response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
      output?: string;
      text?: string;
    }>;
  };

  const candidate = data?.candidates?.[0];
  if (!candidate) {
    return undefined;
  }

  if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
    return candidate.content.parts.map((part) => part?.text ?? "").join("\n");
  }

  if (typeof candidate.output === "string") {
    return candidate.output;
  }

  if (typeof candidate.text === "string") {
    return candidate.text;
  }

  return undefined;
}

function buildPrimaryPrompt(payload: FlashRequestPayload): string {
  const sections: string[] = [
    payload.instructions.trim(),
    "profileData JSON:",
    JSON.stringify(payload.profile, null, 2),
    "fieldCandidates JSON:",
    JSON.stringify(payload.fieldCandidates, null, 2)
  ];

  if (payload.siteMemory) {
    sections.push("siteMemory JSON:", JSON.stringify(payload.siteMemory, null, 2));
  }

  sections.push("请仅返回 FillPlan JSON 数组。");
  return sections.join("\n\n");
}

function formatGeminiError(status: number, body: string): string {
  let parsedMessage: string | undefined;
  let parsedStatus: string | undefined;
  try {
    const data = JSON.parse(body) as {
      error?: { code?: number; status?: string; message?: string };
    };
    parsedMessage = data?.error?.message;
    parsedStatus = data?.error?.status;
  } catch {
    parsedMessage = undefined;
  }

  const details = parsedMessage ?? body.trim() ?? "";
  const prefix = `Gemini API 调用失败：${status}`;

  if (status === 429 || parsedStatus === "RESOURCE_EXHAUSTED") {
    return `${prefix}（配额或速率限制已耗尽，请检查账户套餐与账单状态）。${details}`;
  }

  if (details) {
    return `${prefix} ${details}`;
  }

  return prefix;
}
