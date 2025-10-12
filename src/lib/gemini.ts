import { FillPlan, FlashRequestPayload } from "./schema";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  topP?: number;
}

export interface GeminiCallResult {
  rawText: string;
  fillPlan?: FillPlan;
  repaired?: boolean;
}

export async function callGeminiFlash(payload: FlashRequestPayload, config: GeminiConfig): Promise<GeminiCallResult> {
  // TODO: invoke Gemini Flash API and return the raw string response.
  void payload;
  void config;
  return { rawText: "" };
}

export async function repairJsonIfNeeded(rawText: string, config: GeminiConfig): Promise<string> {
  // TODO: trigger a JSON repair round if parsing fails.
  void rawText;
  void config;
  return rawText;
}
