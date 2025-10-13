import { FillPlan, FillPlanEntry, FieldRole } from "../lib/schema";
import { getElementByKey } from "./detector";

export interface AppliedFillState {
  elKey: string;
  role: FieldRole;
  previousValue?: string | string[] | null;
  previousChecked?: boolean;
  radioGroupName?: string;
}

export function applyFillPlan(plan: FillPlan): AppliedFillState[] {
  const applied: AppliedFillState[] = [];

  for (const entry of plan) {
    const element = getElementByKey(entry.elKey);
    if (!element) {
      continue;
    }

    const role = determineRole(element);
    if (!role) {
      continue;
    }

    try {
      const state = applyEntry(element, role, entry);
      if (state) {
        applied.push(state);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to apply fill plan entry", entry, error);
    }
  }

  return applied;
}

export function rollbackFillPlan(states: AppliedFillState[]): void {
  [...states].reverse().forEach((state) => {
    const element = getElementByKey(state.elKey);
    if (!element) {
      return;
    }

    try {
      switch (state.role) {
        case "text":
        case "textarea":
        case "email":
        case "tel":
        case "date":
        case "custom": {
          restoreTextValue(element, state.previousValue ?? "");
          break;
        }
        case "contenteditable": {
          restoreContentEditable(element, state.previousValue ?? "");
          break;
        }
        case "select": {
          restoreSelectValue(element as HTMLSelectElement, state.previousValue ?? null);
          break;
        }
        case "radio": {
          restoreRadioValue(element as HTMLInputElement, state.radioGroupName, state.previousValue);
          break;
        }
        case "checkbox": {
          restoreCheckboxValue(element as HTMLInputElement, state.previousChecked ?? false);
          break;
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to rollback fill state", state, error);
    }
  });
}

function determineRole(element: HTMLElement): FieldRole | undefined {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (type === "radio") {
      return "radio";
    }
    if (type === "checkbox") {
      return "checkbox";
    }
    if (type === "email") {
      return "email";
    }
    if (type === "tel" || type === "phone") {
      return "tel";
    }
    if (type === "date" || type === "datetime-local") {
      return "date";
    }
    return "text";
  }
  if (element instanceof HTMLTextAreaElement) {
    return "textarea";
  }
  if (element instanceof HTMLSelectElement) {
    return "select";
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return "contenteditable";
  }
  return "custom";
}

function applyEntry(element: HTMLElement, role: FieldRole, entry: FillPlanEntry): AppliedFillState | undefined {
  switch (role) {
    case "text":
    case "textarea":
    case "email":
    case "tel":
    case "date":
    case "custom":
      return applyTextValue(element, role, entry);
    case "contenteditable":
      return applyContentEditable(element, entry);
    case "select":
      return applySelect(element as HTMLSelectElement, entry);
    case "radio":
      return applyRadio(element as HTMLInputElement, entry);
    case "checkbox":
      return applyCheckbox(element as HTMLInputElement, entry);
    default:
      return undefined;
  }
}

function applyTextValue(element: HTMLElement, role: FieldRole, entry: FillPlanEntry): AppliedFillState | undefined {
  const value = normalizeValue(entry.value);
  const previousValue = getCurrentValue(element);

  focusElement(element);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
  } else if (role === "custom") {
    (element as HTMLElement).textContent = value;
  }
  emitInputEvents(element);

  return { elKey: entry.elKey, role, previousValue };
}

function applyContentEditable(element: HTMLElement, entry: FillPlanEntry): AppliedFillState | undefined {
  const value = normalizeValue(entry.value);
  const previousValue = element.innerText;

  focusElement(element);
  element.innerText = value;
  emitInputEvents(element);

  return { elKey: entry.elKey, role: "contenteditable", previousValue };
}

function applySelect(select: HTMLSelectElement, entry: FillPlanEntry): AppliedFillState | undefined {
  const previousValue = select.value;
  const options = Array.from(select.options);
  const resolvedIndex = resolveOptionIndex(options, entry);

  focusElement(select);
  if (resolvedIndex !== undefined && resolvedIndex >= 0 && resolvedIndex < options.length) {
    select.selectedIndex = resolvedIndex;
  } else {
    const candidateValue = normalizeValue(entry.value);
    const matchByValue = options.find((option) => option.value === candidateValue);
    if (matchByValue) {
      matchByValue.selected = true;
    } else {
      const matchByText = options.find((option) => option.text.trim() === candidateValue);
      if (matchByText) {
        matchByText.selected = true;
      }
    }
  }
  emitChange(select);

  return { elKey: entry.elKey, role: "select", previousValue };
}

function applyRadio(radio: HTMLInputElement, entry: FillPlanEntry): AppliedFillState | undefined {
  const groupName = radio.name || undefined;
  const group = groupName
    ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(groupName)}"]`))
    : [radio];
  const previouslyChecked = group.find((item) => item.checked)?.value ?? null;

  const target = resolveRadioTarget(group, entry);
  if (!target) {
    return undefined;
  }

  focusElement(target);
  target.checked = true;
  emitInputEvents(target);

  return {
    elKey: entry.elKey,
    role: "radio",
    previousValue: previouslyChecked,
    radioGroupName: groupName
  };
}

function applyCheckbox(checkbox: HTMLInputElement, entry: FillPlanEntry): AppliedFillState | undefined {
  const previousChecked = checkbox.checked;
  const desiredState = resolveCheckboxState(checkbox, entry);

  focusElement(checkbox);
  checkbox.checked = desiredState;
  emitInputEvents(checkbox);

  return { elKey: entry.elKey, role: "checkbox", previousChecked };
}

function restoreTextValue(element: HTMLElement, value: string | string[]): void {
  const text = Array.isArray(value) ? value.join("\n") : value;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = text ?? "";
    emitInputEvents(element);
    return;
  }
  element.textContent = text ?? "";
}

function restoreContentEditable(element: HTMLElement, value: string | string[]): void {
  const text = Array.isArray(value) ? value.join("\n") : value;
  element.innerText = text ?? "";
  emitInputEvents(element);
}

function restoreSelectValue(select: HTMLSelectElement, value: string | string[] | null): void {
  if (value === null) {
    select.selectedIndex = -1;
  } else {
    const target = Array.isArray(value) ? value[0] : value;
    select.value = target ?? "";
  }
  emitInputEvents(select);
}

function restoreRadioValue(radio: HTMLInputElement, groupName: string | undefined, previousValue: string | string[] | null | undefined): void {
  const group = groupName
    ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(groupName)}"]`))
    : [radio];

  if (previousValue === null || previousValue === undefined) {
    group.forEach((item) => {
      item.checked = false;
      emitInputEvents(item);
    });
    return;
  }

  const targetValue = Array.isArray(previousValue) ? previousValue[0] : previousValue;
  const toCheck = group.find((item) => item.value === targetValue);
  group.forEach((item) => {
    item.checked = item === toCheck;
    emitInputEvents(item);
  });
}

function restoreCheckboxValue(checkbox: HTMLInputElement, checked: boolean): void {
  checkbox.checked = checked;
  emitInputEvents(checkbox);
}

function normalizeValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.join("\n");
  }
  return value;
}

function getCurrentValue(element: HTMLElement): string | string[] {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return element.innerText;
  }
  return element.textContent ?? "";
}

function focusElement(element: HTMLElement): void {
  if (typeof element.focus === "function") {
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  }
}

function emitInputEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  emitChange(element);
}

function emitChange(element: HTMLElement): void {
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function resolveOptionIndex(options: HTMLOptionElement[], entry: FillPlanEntry): number | undefined {
  if (!entry.optionMatch) {
    return undefined;
  }

  const { mode, index, expectText } = entry.optionMatch;
  const targetText = expectText ?? normalizeValue(entry.value);

  switch (mode) {
    case "index":
      return index;
    case "exact":
      return options.findIndex((option) => option.text.trim() === targetText || option.value === targetText);
    case "contains":
      return options.findIndex((option) => option.text.includes(targetText));
    default:
      return undefined;
  }
}

function resolveRadioTarget(radios: HTMLInputElement[], entry: FillPlanEntry): HTMLInputElement | undefined {
  if (entry.optionMatch) {
    const { mode, index, expectText } = entry.optionMatch;
    const targetText = expectText ?? normalizeValue(entry.value);
    switch (mode) {
      case "index":
        return typeof index === "number" ? radios[index] : undefined;
      case "exact":
        return radios.find((radio) => radio.value === targetText || extractLabelText(radio)?.trim() === targetText);
      case "contains":
        return radios.find((radio) => {
          const label = extractLabelText(radio) ?? "";
          return label.includes(targetText);
        });
    }
  }

  const valueText = normalizeValue(entry.value);
  return radios.find((radio) => radio.value === valueText || extractLabelText(radio)?.trim() === valueText);
}

function resolveCheckboxState(checkbox: HTMLInputElement, entry: FillPlanEntry): boolean {
  if (entry.optionMatch) {
    const { mode, expectText } = entry.optionMatch;
    const targetText = expectText ?? normalizeValue(entry.value).toLowerCase();
    if (mode === "index") {
      return entry.optionMatch.index === 0;
    }
    const label = extractLabelText(checkbox)?.toLowerCase() ?? "";
    if (mode === "exact") {
      return label === targetText || checkbox.value.toLowerCase() === targetText;
    }
    if (mode === "contains") {
      return label.includes(targetText) || checkbox.value.toLowerCase().includes(targetText);
    }
  }

  const rawValue = Array.isArray(entry.value) ? entry.value[0] : entry.value;
  if (rawValue === undefined) {
    return false;
  }

  const normalized = rawValue.toString().toLowerCase();
  return ["1", "true", "yes", "on", checkbox.value.toLowerCase()].includes(normalized);
}

function collectElementLabels(element: HTMLElement): HTMLLabelElement[] | undefined {
  const candidate = element as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> | null };
  const labelList = candidate.labels ?? null;
  if (!labelList || labelList.length === 0) {
    return undefined;
  }
  return Array.from(labelList);
}

function extractLabelText(element: HTMLElement): string | undefined {
  const labels = collectElementLabels(element);
  if (labels && labels.length > 0) {
    const direct = labels.map((label) => label.innerText.trim()).find(Boolean);
    if (direct) {
      return direct;
    }
  }
  const wrappingLabel = element.closest("label");
  return wrappingLabel?.textContent?.trim() ?? undefined;
}
