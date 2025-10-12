import { FlashRequestPayload, FieldCandidates, FillPlan, ProfileData, SiteMemory } from "../lib/schema";

/**
 * Coordinates communication between popup/content scripts and the Gemini Flash API.
 */
export class ResumeAutofillBackground {
  private activeProfile?: ProfileData;
  private siteMemoryCache = new Map<string, SiteMemory>();

  async initialize(): Promise<void> {
    // TODO: wire up runtime message handlers and alarm listeners.
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void this.dispatchMessage(message, sender, sendResponse);
      return true;
    });
  }

  private async dispatchMessage(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void): Promise<void> {
    // TODO: route popup/content requests to the appropriate handler.
    sendResponse({ ok: false, error: "Not implemented" });
  }

  private async handleScanAndPlanRequest(tabId: number, candidates: FieldCandidates): Promise<FillPlan> {
    // TODO: compose the Flash request payload and call Gemini.
    void tabId;
    void candidates;
    return [];
  }

  private async prepareFlashPayload(candidates: FieldCandidates): Promise<FlashRequestPayload> {
    // TODO: assemble instructions, profile data, and optional site memory.
    void candidates;
    return {
      instructions: "",
      profile: await this.readActiveProfile(),
      fieldCandidates: [],
      siteMemory: undefined
    };
  }

  private async invokeFlash(payload: FlashRequestPayload): Promise<FillPlan> {
    // TODO: send payload to Gemini Flash and perform JSON validation/repair.
    void payload;
    return [];
  }

  private async readActiveProfile(): Promise<ProfileData> {
    // TODO: load profile data from chrome.storage or bundled JSON file.
    if (this.activeProfile) {
      return this.activeProfile;
    }

    throw new Error("Active profile not loaded");
  }

  private async loadSiteMemory(key: string): Promise<SiteMemory | undefined> {
    // TODO: hydrate site memory from persistent storage.
    return this.siteMemoryCache.get(key);
  }

  private async persistSiteMemory(key: string, memory: SiteMemory): Promise<void> {
    // TODO: persist site memory and update in-memory cache.
    this.siteMemoryCache.set(key, memory);
  }
}

const background = new ResumeAutofillBackground();
void background.initialize();
