(function (root) {
  const api = root.browser || root.chrome;
  if (!api) throw new Error("No WebExtension API found.");
  const usesPromises = Boolean(root.browser);

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
      onMenuClicked: api.menus?.onClicked,
      onMessage: api.runtime.onMessage
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
      create: (details) => api.menus.create(details),
      remove: (id) => call(api.menus, "remove", id)
    },
    tabs: {
      create: (details) => call(api.tabs, "create", details),
      executeScript: (tabId, details) => call(api.tabs, "executeScript", tabId, details),
      getCurrent: () => call(api.tabs, "getCurrent"),
      query: (details) => call(api.tabs, "query", details),
      remove: (tabId) => call(api.tabs, "remove", tabId),
      sendMessage: (tabId, message) => call(api.tabs, "sendMessage", tabId, message)
    }
  };
})(globalThis);
