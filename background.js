(function () {
  const extension = this.FocusReaderApi;
  const MENU_ID = "focus-reader-current-page";
  const COMMAND_ID = "focus-current-page";
  const SESSION_TTL_MS = 60_000;
  const pendingPages = new Map();

  ensureMenu().catch((error) => console.error("Failed to set up the Focus Reader menu", error));
  ensureShortcut().catch((error) => console.error("Failed to set up the Focus Reader shortcut", error));

  extension.events.onInstalled.addListener(() => {
    ensureMenu().catch((error) => console.error("Failed to reset the Focus Reader menu", error));
  });

  extension.events.onCommand.addListener((command) => {
    if (command !== COMMAND_ID) return;
    openActivePage().catch((error) => console.error("Focus Reader shortcut failed", error));
  });

  extension.events.onMenuClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID) return;
    openPage(tab).catch((error) => console.error("Focus Reader menu action failed", error));
  });

  extension.events.onMessage.addListener((message) => {
    if (message?.type !== "focus-reader-get") return undefined;
    const payload = pendingPages.get(message.token);
    pendingPages.delete(message.token);
    return Promise.resolve(payload || {
      ok: false,
      error: "This Focus Reader session has expired. Return to the article and open it again."
    });
  });

  async function ensureMenu() {
    try {
      await extension.menus.remove(MENU_ID);
    } catch (error) {
      // The menu does not exist on first run.
    }
    extension.menus.create({
      id: MENU_ID,
      title: "Open in Focus Reader",
      contexts: ["page"]
    });
  }

  async function ensureShortcut() {
    const commands = await extension.commands.getAll();
    const command = commands.find((item) => item.name === COMMAND_ID);
    if (command && command.shortcut && command.shortcut !== "Alt+Shift+F") return;
    await extension.commands.update({ name: COMMAND_ID, shortcut: "Ctrl+Shift+F" });
  }

  async function openActivePage() {
    const [tab] = await extension.tabs.query({ active: true, currentWindow: true });
    return openPage(tab);
  }

  async function openPage(tab) {
    let payload;
    try {
      if (!tab?.id || !isReadableUrl(tab.url)) {
        throw new Error("Focus Reader works on HTTPS article pages, not browser pages or PDF files.");
      }
      await extension.tabs.executeScript(tab.id, { file: "vendor/Readability.js", runAt: "document_idle" });
      const results = await extension.tabs.executeScript(tab.id, { file: "reader-extract.js", runAt: "document_idle" });
      payload = results?.[0] || { ok: false, error: "The article extractor returned no result." };
    } catch (error) {
      payload = { ok: false, error: error?.message || "This page could not be opened in Focus Reader." };
    }

    const token = createToken();
    pendingPages.set(token, payload);
    setTimeout(() => pendingPages.delete(token), SESSION_TTL_MS);
    try {
      await extension.tabs.executeScript(tab.id, { file: "extension-api.js", runAt: "document_idle" });
      await extension.tabs.executeScript(tab.id, { file: "reader-overlay.js", runAt: "document_idle" });
      await extension.tabs.sendMessage(tab.id, { type: "focus-reader-show", token });
    } catch (error) {
      try {
        await extension.tabs.create({ url: `${extension.runtime.getUrl("reader.html")}?token=${encodeURIComponent(token)}` });
      } catch (fallbackError) {
        pendingPages.delete(token);
        console.error("Focus Reader could not open its error page", fallbackError);
      }
    }
  }

  function isReadableUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.pathname.toLowerCase().endsWith(".pdf");
    } catch (error) {
      return false;
    }
  }

  function createToken() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
})();
