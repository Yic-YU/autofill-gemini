export type FieldRole =
  | "text"
  | "textarea"
  | "tel"
  | "email"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "contenteditable"
  | "custom";

export type FieldUIFlag =
  | "maskedInput"
  | "reactControlled"
  | "shadowDom"
  | "iframeChain"
  | "needsClickBeforeType"
  | "blocksPaste";

export interface FieldHints {
  label?: string;
  placeholder?: string;
  nameOrId?: string;
  aria?: string;
  title?: string;
  neighborText?: string;
  groupTitle?: string;
}

export interface FieldConstraints {
  required?: boolean;
  maxlength?: number;
  minlength?: number;
  pattern?: string;
  accept?: string;
}

export interface FieldOption {
  idx: number;
  text: string;
  altText?: string;
  valueAttr?: string;
}

export interface FieldCandidate {
  elKey: string;
  role: FieldRole;
  hints: FieldHints;
  constraints: FieldConstraints;
  options?: FieldOption[];
  uiFlags?: FieldUIFlag[];
}

export type FieldCandidates = FieldCandidate[];

export type OptionMatchMode = "exact" | "contains" | "index";

export interface OptionMatch {
  mode: OptionMatchMode;
  index?: number;
  expectText?: string;
}

export interface FillPlanEntry {
  elKey: string;
  targetKey: string | "unknown";
  value: string | string[];
  optionMatch?: OptionMatch;
  confidence: number;
  reason?: string;
}

export type FillPlan = FillPlanEntry[];

export interface ProfileField {
  key: string;
  label: string;
  value: string | string[];
  metadata?: Record<string, unknown>;
}

export interface ProfileData {
  profileId: string;
  summary?: string;
  fields: ProfileField[];
}

export interface SiteMemoryMapping {
  elKey: string;
  targetKey: string;
  confidence: number;
  lastConfirmed: string;
}

export interface SiteMemory {
  host: string;
  structureHash: string;
  lastUsed: string;
  mappings: SiteMemoryMapping[];
}

export interface FlashRequestPayload {
  profile: ProfileData;
  fieldCandidates: FieldCandidates;
  siteMemory?: SiteMemory;
  instructions: string;
}

export interface FlashResponse {
  fillPlan: FillPlan;
  rawText?: string;
  repaired?: boolean;
}
