import { FillPlan } from "../lib/schema";

export interface AppliedFillState {
  elKey: string;
  previousValue: unknown;
}

export function applyFillPlan(plan: FillPlan): AppliedFillState[] {
  // TODO: iterate through the fill plan and perform the mechanical fill steps.
  void plan;
  return [];
}

export function rollbackFillPlan(states: AppliedFillState[]): void {
  // TODO: revert DOM mutations performed during applyFillPlan.
  void states;
}
