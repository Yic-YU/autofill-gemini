import {
  FieldCandidates,
  FieldCandidate,
  FieldConstraints,
  FieldHints,
  FieldOption,
  FieldRole,
  FieldUIFlag
} from "../lib/schema";

const ELEMENT_KEY_ATTR = "data-resume-autofill-key";
const elementRegistry = new Map<string, HTMLElement>();

export interface CollectFieldOptions {
  skipPrefilled?: boolean;
}

export function collectFieldCandidates(
  root: Document | ShadowRoot = document,
  options?: CollectFieldOptions
): FieldCandidates {
  const scope: Document | ShadowRoot = root;
  elementRegistry.clear();
  const skipPrefilled = options?.skipPrefilled ?? false;

  const candidates: FieldCandidates = [];
  const radioGroupsHandled = new Set<string>();

  const controls = scope.querySelectorAll<HTMLElement>(
    "input, textarea, select, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']"
  );

  controls.forEach((element, index) => {
    if (!isEligibleElement(element)) {
      return;
    }

    const role = detectRole(element);
    if (!role) {
      return;
    }

    if (role === "radio") {
      const radio = element as HTMLInputElement;
      const groupKey = getRadioGroupKey(radio);
      if (groupKey && radioGroupsHandled.has(groupKey)) {
        return;
      }
      if (groupKey) {
        radioGroupsHandled.add(groupKey);
      }
    }

    if (skipPrefilled && isElementPrefilled(element, role)) {
      return;
    }

    const elKey = assignElementKey(element, index);
    const candidate = buildCandidate(element, elKey, role);
    if (candidate) {
      candidates.push(candidate);
    }
  });

  return candidates;
}

export function getElementByKey(elKey: string): HTMLElement | undefined {
  return elementRegistry.get(elKey);
}

function isEligibleElement(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (["button", "submit", "reset", "image", "hidden", "file"].includes(type)) {
      return false;
    }
  }

  if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    if (element.disabled) {
      return false;
    }
  }

  if (element instanceof HTMLElement && element.offsetParent === null && !element.isContentEditable) {
    // Skip elements that are not rendered; contenteditable may be invisible but still relevant.
    return false;
  }

  return true;
}

function detectRole(element: HTMLElement): FieldRole | undefined {
  if (element instanceof HTMLTextAreaElement) {
    return "textarea";
  }

  if (element instanceof HTMLSelectElement) {
    return "select";
  }

  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    switch (type) {
      case "email":
        return "email";
      case "tel":
      case "phone":
        return "tel";
      case "date":
      case "datetime-local":
        return "date";
      case "radio":
        return "radio";
      case "checkbox":
        return "checkbox";
      case "number":
      case "text":
      case "search":
      case "url":
      case "password":
      default:
        return "text";
    }
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    return "contenteditable";
  }

  return "custom";
}

function assignElementKey(element: HTMLElement, index: number): string {
  const existing = element.getAttribute(ELEMENT_KEY_ATTR);
  if (existing) {
    elementRegistry.set(existing, element);
    return existing;
  }

  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${index}`;
  const key = `el-${uuid}`;
  element.setAttribute(ELEMENT_KEY_ATTR, key);
  elementRegistry.set(key, element);
  return key;
}

function buildCandidate(element: HTMLElement, elKey: string, role: FieldRole): FieldCandidate | undefined {
  const hints = extractHints(element);
  const constraints = extractConstraints(element);
  const uiFlags = detectUiFlags(element);
  const options = role === "select" || role === "radio" || role === "checkbox" ? extractOptions(element, role) : undefined;

  return {
    elKey,
    role,
    hints,
    constraints,
    options,
    uiFlags
  };
}

function extractHints(element: HTMLElement): FieldHints {
  const doc = element.ownerDocument ?? document;
  return {
    label: extractLabelText(element),
    placeholder: getPlaceholder(element),
    nameOrId: getNameOrId(element),
    aria: getAriaDescription(element, doc),
    title: element.getAttribute("title") ?? undefined,
    neighborText: getNeighborText(element),
    groupTitle: getGroupTitle(element)
  };
}

function extractConstraints(element: HTMLElement): FieldConstraints {
  const constraints: FieldConstraints = {};

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    constraints.required = element.required || element.getAttribute("aria-required") === "true" || undefined;

    if (element.maxLength > 0) {
      constraints.maxlength = element.maxLength;
    }

    if (element.minLength > 0) {
      constraints.minlength = element.minLength;
    }

    if (element instanceof HTMLInputElement) {
      if (element.pattern) {
        constraints.pattern = element.pattern;
      }
      if (element.accept) {
        constraints.accept = element.accept;
      }
    }
  }

  if (element instanceof HTMLSelectElement) {
    constraints.required = element.required || undefined;
  }

  return constraints;
}

function detectUiFlags(element: HTMLElement): FieldUIFlag[] | undefined {
  const flags: FieldUIFlag[] = [];

  const root = element.getRootNode();
  if (root && "host" in root && root instanceof ShadowRoot) {
    flags.push("shadowDom");
  }

  if (flags.length === 0) {
    return undefined;
  }

  return flags;
}

function extractOptions(element: HTMLElement, role: FieldRole): FieldOption[] | undefined {
  const doc = element.ownerDocument ?? document;

  if (role === "select" && element instanceof HTMLSelectElement) {
    return Array.from(element.options).map((option, idx) => ({
      idx,
      text: option.text.trim(),
      altText: option.label || undefined,
      valueAttr: option.value || undefined
    }));
  }

  if (role === "radio" && element instanceof HTMLInputElement) {
    const name = element.name;
    const radios = name
      ? Array.from(doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`))
      : [element];
    return radios.map((radio, idx) => ({
      idx,
      text: extractLabelText(radio) ?? radio.value ?? `选项${idx + 1}`,
      altText: radio.value || undefined,
      valueAttr: radio.value || undefined
    }));
  }

  if (role === "checkbox" && element instanceof HTMLInputElement) {
    const name = element.name;
    const checkboxes = name
      ? Array.from(doc.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${CSS.escape(name)}"]`))
      : [element];
    return checkboxes.map((checkbox, idx) => ({
      idx,
      text: extractLabelText(checkbox) ?? checkbox.value ?? `选项${idx + 1}`,
      altText: checkbox.value || undefined,
      valueAttr: checkbox.value || undefined
    }));
  }

  return undefined;
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
    const direct = labels
      .map((label) => label.innerText.trim())
      .find(Boolean);
    if (direct) {
      return direct;
    }
  }

  const doc = element.ownerDocument ?? document;
  const id = element.getAttribute("id");
  if (id) {
    const forLabel = doc.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (forLabel) {
      const text = forLabel.innerText.trim();
      if (text) {
        return text;
      }
    }
  }

  const wrappingLabel = element.closest<HTMLLabelElement>("label");
  if (wrappingLabel) {
    const text = wrappingLabel.textContent?.replace(element.textContent ?? "", "").trim();
    if (text) {
      return text;
    }
  }

  return undefined;
}

function getPlaceholder(element: HTMLElement): string | undefined {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.placeholder || undefined;
  }
  return undefined;
}

function getNameOrId(element: HTMLElement): string | undefined {
  if ("name" in element && typeof element.name === "string" && element.name) {
    return element.name;
  }
  if (element.id) {
    return element.id;
  }
  return undefined;
}

function getAriaDescription(element: HTMLElement, doc: Document): string | undefined {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return ariaLabel;
  }
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const ids = labelledBy.split(" ").map((id) => id.trim()).filter(Boolean);
    const text = ids
      .map((id) => doc.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    return text || undefined;
  }
  return undefined;
}

function getNeighborText(element: HTMLElement): string | undefined {
  const previous = element.previousElementSibling;
  if (previous?.textContent) {
    const text = previous.textContent.trim();
    if (text) {
      return text;
    }
  }

  const parent = element.parentElement;
  if (parent) {
    const text = parent.textContent?.replace(element.textContent ?? "", "").trim();
    if (text && text.length <= 200 && !/必填项?/.test(text)) {
      return text;
    }
  }

  const fallback = collectAncestorSiblingText(element);
  if (fallback) {
    return fallback;
  }

  return undefined;
}

function collectAncestorSiblingText(element: HTMLElement, maxDepth = 3): string | undefined {
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    const parent = current.parentElement;
    if (!parent) {
      break;
    }

    const label = collectSiblingText(parent, current);
    if (label) {
      return label;
    }

    current = parent;
    depth += 1;
  }

  return undefined;
}

function collectSiblingText(container: HTMLElement, target: HTMLElement): string | undefined {
  const fragments: string[] = [];
  let reachedTarget = false;

  for (const child of Array.from(container.children)) {
    if (child === target) {
      reachedTarget = true;
      break;
    }
    const text = child.textContent?.trim();
    if (text) {
      fragments.push(text.replace(/\s+/g, " "));
    }
  }

  if (!reachedTarget || fragments.length === 0) {
    return undefined;
  }

  const combined = fragments.join(" ").trim();
  if (!combined || combined.length > 200) {
    return undefined;
  }

  if (/必填项?/.test(combined)) {
    return undefined;
  }

  return combined;
}

function getGroupTitle(element: HTMLElement): string | undefined {
  const fieldset = element.closest("fieldset");
  if (!fieldset) {
    return undefined;
  }
  const legend = fieldset.querySelector("legend");
  if (legend?.textContent) {
    return legend.textContent.trim();
  }
  return undefined;
}

function isElementPrefilled(element: HTMLElement, role: FieldRole): boolean {
  switch (role) {
    case "text":
    case "textarea":
    case "email":
    case "tel":
    case "date":
    case "custom": {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return hasNonEmptyValue(element.value);
      }
      return hasNonEmptyValue(element.textContent);
    }
    case "contenteditable": {
      return hasNonEmptyValue(element.innerText);
    }
    case "select": {
      if (!(element instanceof HTMLSelectElement)) {
        return false;
      }
      if (hasNonEmptyValue(element.value)) {
        return true;
      }
      return Array.from(element.selectedOptions ?? []).some((option) => hasNonEmptyValue(option.value));
    }
    case "radio": {
      if (!(element instanceof HTMLInputElement)) {
        return false;
      }
      return radioGroupHasSelection(element);
    }
    case "checkbox": {
      if (!(element instanceof HTMLInputElement)) {
        return false;
      }
      return element.checked;
    }
    default:
      return false;
  }
}

function radioGroupHasSelection(radio: HTMLInputElement): boolean {
  if (!radio.name) {
    return radio.checked;
  }

  const root = radio.getRootNode();
  if (root instanceof Document || root instanceof ShadowRoot) {
    const selector = `input[type="radio"][name="${CSS.escape(radio.name)}"]`;
    const radios = Array.from(root.querySelectorAll<HTMLInputElement>(selector));
    return radios.some((item) => item.checked);
  }

  return radio.checked;
}

function hasNonEmptyValue(value: string | null | undefined): boolean {
  return value !== undefined && value !== null && value.trim().length > 0;
}

function getRadioGroupKey(radio: HTMLInputElement): string | undefined {
  if (!radio.name) {
    return undefined;
  }
  const formId = radio.form?.id ?? "no-form";
  return `${formId}:${radio.name}`;
}
