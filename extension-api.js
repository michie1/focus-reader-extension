(function (root) {
  const api = root.browser || root.chrome;
  if (!api) throw new Error("No WebExtension API found.");
  const usesPromises = Boolean(root.browser);

  function messageEvent(event) {
    if (usesPromises) return event;
    return {
      addListener(listener) {
        event.addListener((message, sender, sendResponse) => {
          const result = listener(message, sender);
          if (!result || typeof result.then !== "function") {
            if (result !== undefined) sendResponse(result);
            return result !== undefined;
          }
          result.then(sendResponse, (error) => sendResponse({
            ok: false,
            error: error?.message || "The extension request failed."
          }));
          return true;
        });
      }
    };
  }

  function call(target, method, ...args) {
    if (usesPromises) return target[method](...args);
    return new Promise((resolve, reject) => {
      target[method](...args, (result) => {
        const error = api.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result);
      });
    });
  }

  root.FocusReaderApi = {
    events: {
      onCommand: api.commands?.onCommand,
      onInstalled: api.runtime.onInstalled,
      onMenuClicked: (api.menus || api.contextMenus)?.onClicked,
      onMessage: messageEvent(api.runtime.onMessage)
    },
    runtime: {
      getUrl: (path) => api.runtime.getURL(path),
      sendMessage: (message) => call(api.runtime, "sendMessage", message)
    },
    commands: {
      getAll: () => call(api.commands, "getAll"),
      update: (details) => call(api.commands, "update", details)
    },
    menus: {
      create: (details) => (api.menus || api.contextMenus).create(details),
      remove: (id) => call(api.menus || api.contextMenus, "remove", id)
    },
    tabs: {
      create: (details) => call(api.tabs, "create", details),
      executeScript: async (tabId, details) => {
        if (api.scripting) {
          const results = await call(api.scripting, "executeScript", {
            target: { tabId },
            files: [details.file]
          });
          return results?.map((item) => item.result);
        }
        return call(api.tabs, "executeScript", tabId, details);
      },
      getCurrent: () => call(api.tabs, "getCurrent"),
      query: (details) => call(api.tabs, "query", details),
      remove: (tabId) => call(api.tabs, "remove", tabId),
      sendMessage: (tabId, message) => call(api.tabs, "sendMessage", tabId, message)
    },
    session: api.storage?.session ? {
      get: (key) => call(api.storage.session, "get", key),
      remove: (key) => call(api.storage.session, "remove", key),
      set: (items) => call(api.storage.session, "set", items)
    } : null
  };
})(globalThis);
