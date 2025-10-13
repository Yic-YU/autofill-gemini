import { collectFieldCandidates } from "./detector";
import { applyFillPlan, rollbackFillPlan, AppliedFillState } from "./autofill";
import { FillPlan } from "../lib/schema";

let lastApplied: AppliedFillState[] = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void sender;
  void handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

async function handleMessage(message: unknown): Promise<unknown> {
  // TODO: implement message contract (scan, apply plan, rollback).
  if (!isContentCommand(message)) {
    return { ok: false, error: "Unknown message" };
  }

  switch (message.type) {
    case "collect-field-candidates": {
      const candidates = collectFieldCandidates(document, { skipPrefilled: message.skipPrefilled ?? false });
      return { ok: true, candidates };
    }
    case "apply-fill-plan": {
      const applied = applyFillPlan(message.plan);
      lastApplied = applied;
      return { ok: true };
    }
    case "rollback-fill-plan": {
      rollbackFillPlan(lastApplied);
      lastApplied = [];
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unhandled command" };
  }
}

interface CollectFieldCandidatesCommand {
  type: "collect-field-candidates";
  skipPrefilled?: boolean;
}

interface ApplyFillPlanCommand {
  type: "apply-fill-plan";
  plan: FillPlan;
}

interface RollbackFillPlanCommand {
  type: "rollback-fill-plan";
}

type ContentCommand = CollectFieldCandidatesCommand | ApplyFillPlanCommand | RollbackFillPlanCommand;

function isContentCommand(value: unknown): value is ContentCommand {
  if (!value || typeof value !== "object") {
    return false;
  }

  const command = value as { type?: unknown };
  return typeof command.type === "string";
}
