export {};

declare namespace chrome {
  const sidePanel: {
    setOptions(options: { tabId?: number; windowId?: number; path?: string; enabled: boolean }): Promise<void>;
    open(options: { tabId?: number; windowId?: number }): Promise<void>;
    setPanelBehavior?(options: { openPanelOnActionClick: boolean }): Promise<void>;
  } | undefined;
}
