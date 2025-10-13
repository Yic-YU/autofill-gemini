export type StorageAreaName = "local" | "sync" | "session";

function resolveArea(area: StorageAreaName = "local"): chrome.storage.StorageArea {
  switch (area) {
    case "sync":
      return chrome.storage.sync;
    case "session":
      return chrome.storage.session;
    case "local":
    default:
      return chrome.storage.local;
  }
}

export function storageGet<T>(key: string, area: StorageAreaName = "local"): Promise<T | undefined> {
  const storageArea = resolveArea(area);
  return new Promise((resolve, reject) => {
    storageArea.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result[key] as T | undefined);
    });
  });
}

export function storageSet<T>(key: string, value: T, area: StorageAreaName = "local"): Promise<void> {
  const storageArea = resolveArea(area);
  return new Promise((resolve, reject) => {
    storageArea.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function getActiveProfilePath(): Promise<string> {
  const options = await getOptions();
  return options.activeProfile;
}

export interface ExtensionOptions {
  apiKey: string;
  model: string;
  activeProfile: string;
  minConfidence: number;
  maxSummaryChars: number;
  phoneFormat: string;
  enableSiteMemory: boolean;
}

export const DEFAULT_OPTIONS: ExtensionOptions = {
  apiKey: "",
  model: "gemini-1.5-flash-latest",
  activeProfile: "profile.default.json",
  minConfidence: 0.6,
  maxSummaryChars: 500,
  phoneFormat: "+86-000-0000-0000",
  enableSiteMemory: true
};

const OPTIONS_STORAGE_KEY = "options";

export async function getOptions(): Promise<ExtensionOptions> {
  const stored = await storageGet<Partial<ExtensionOptions>>(OPTIONS_STORAGE_KEY);
  if (!stored) {
    return { ...DEFAULT_OPTIONS };
  }
  return { ...DEFAULT_OPTIONS, ...stored };
}

export async function saveOptions(options: ExtensionOptions): Promise<void> {
  await storageSet(OPTIONS_STORAGE_KEY, options);
}
