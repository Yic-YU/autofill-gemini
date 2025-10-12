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
  // TODO: surface the active profile path from extension storage (default to bundled profile).
  return "profile.default.json";
}
