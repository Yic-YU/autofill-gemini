import { FieldCandidates } from "../lib/schema";

export function collectFieldCandidates(root: Document | ShadowRoot = document): FieldCandidates {
  // TODO: traverse the DOM, extract supported field metadata, and return FieldCandidates.
  void root;
  return [];
}
