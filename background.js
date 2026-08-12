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

  extension.events.onMessage.addListener(async (message) => {
    if (message?.type !== "focus-reader-get") return undefined;
    const payload = await takePendingPage(message.token);
    return payload || {
      ok: false,
      error: "This Focus Reader session has expired. Return to the article and open it again."
    };
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
    try {
      await storePendingPage(token, payload);
    } catch (error) {
      payload = {
        ok: false,
        error: "This article is too large to open in Focus Reader."
      };
      await storePendingPage(token, payload);
    }
    try {
      await extension.tabs.executeScript(tab.id, { file: "extension-api.js", runAt: "document_idle" });
      await extension.tabs.executeScript(tab.id, { file: "reader-overlay.js", runAt: "document_idle" });
      await extension.tabs.sendMessage(tab.id, { type: "focus-reader-show", token });
    } catch (error) {
      try {
        await extension.tabs.create({ url: `${extension.runtime.getUrl("reader.html")}?token=${encodeURIComponent(token)}` });
      } catch (fallbackError) {
        await removePendingPage(token);
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

  async function storePendingPage(token, payload) {
    if (extension.session) {
      await removeExpiredPages();
      await extension.session.set({ [sessionKey(token)]: { payload, expiresAt: Date.now() + SESSION_TTL_MS } });
      return;
    }
    pendingPages.set(token, payload);
    setTimeout(() => pendingPages.delete(token), SESSION_TTL_MS);
  }

  async function takePendingPage(token) {
    if (extension.session) {
      const key = sessionKey(token);
      const values = await extension.session.get(key);
      await extension.session.remove(key);
      const entry = values?.[key];
      return entry && entry.expiresAt > Date.now() ? entry.payload : null;
    }
    const payload = pendingPages.get(token);
    pendingPages.delete(token);
    return payload;
  }

  async function removePendingPage(token) {
    if (extension.session) await extension.session.remove(sessionKey(token));
    else pendingPages.delete(token);
  }

  async function removeExpiredPages() {
    const values = await extension.session.get(null);
    const now = Date.now();
    const expiredKeys = Object.entries(values || {})
      .filter(([key, entry]) => key.startsWith("focus-reader-session-") && entry?.expiresAt <= now)
      .map(([key]) => key);
    if (expiredKeys.length) await extension.session.remove(expiredKeys);
  }

  function sessionKey(token) {
    return `focus-reader-session-${token}`;
  }
})();
