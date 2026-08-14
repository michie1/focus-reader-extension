const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");

const source = fs.readFileSync("extension-api.js", "utf8");

function event() {
  return {
    listener: null,
    addListener(listener) { this.listener = listener; }
  };
}

function chromeContext(overrides = {}) {
  const onMessage = event();
  const action = { onClicked: event() };
  const contextMenus = { onClicked: event(), create() {}, remove(_id, callback) { callback(); } };
  const chrome = {
    action,
    runtime: {
      lastError: null,
      onInstalled: event(),
      onMessage,
      getURL: (path) => `chrome-extension://test/${path}`,
      sendMessage(_message, callback) { callback({ ok: true }); }
    },
    commands: { onCommand: event(), getAll(callback) { callback([]); }, update(_details, callback) { callback(); } },
    contextMenus,
    tabs: {
      create(_details, callback) { callback({ id: 2 }); },
      getCurrent(callback) { callback({ id: 1 }); },
      query(_details, callback) { callback([]); },
      remove(_id, callback) { callback(); },
      sendMessage(_id, _message, callback) { callback({ ok: true }); }
    },
    scripting: {
      executeScript(_details, callback) { callback([{ frameId: 0, result: { ok: true } }]); }
    },
    storage: {
      session: {
        get(key, callback) { callback({ [key]: "value" }); },
        set(_items, callback) { callback(); },
        remove(_key, callback) { callback(); }
      }
    },
    ...overrides
  };
  const context = vm.createContext({ chrome, globalThis: null });
  context.globalThis = context;
  vm.runInContext(source, context);
  return { api: context.FocusReaderApi, chrome, onMessage, action, contextMenus };
}

test("Chrome maps context menus and scripting results", async () => {
  const { api, chrome, action, contextMenus } = chromeContext();
  assert.equal(api.events.onActionClicked, action.onClicked);
  assert.equal(api.events.onMenuClicked, contextMenus.onClicked);
  const results = await api.tabs.executeScript(7, { file: "reader-extract.js" });
  assert.deepEqual(results, [{ ok: true }]);
  assert.equal(chrome.runtime.lastError, null);
});

test("Chrome message listener keeps the channel open for promises", async () => {
  const { api, onMessage } = chromeContext();
  api.events.onMessage.addListener(async () => ({ ok: true }));
  const response = await new Promise((resolve) => {
    const keptOpen = onMessage.listener({ type: "test" }, {}, resolve);
    assert.equal(keptOpen, true);
  });
  assert.deepEqual(response, { ok: true });
});

test("Chrome exposes session storage", async () => {
  const { api } = chromeContext();
  assert.deepEqual(await api.session.get("token"), { token: "value" });
});

test("Firefox keeps its native promise API and menus namespace", async () => {
  const onMessage = event();
  const browserAction = { onClicked: event() };
  const menus = { onClicked: event(), create() {}, remove: async () => {} };
  const browser = {
    browserAction,
    runtime: { onInstalled: event(), onMessage, getURL: (path) => path, sendMessage: async () => ({ ok: true }) },
    commands: { onCommand: event(), getAll: async () => [], update: async () => {} },
    menus,
    tabs: {
      create: async () => ({}), executeScript: async () => [{ ok: true }], getCurrent: async () => ({}),
      query: async () => [], remove: async () => {}, sendMessage: async () => ({})
    }
  };
  const context = vm.createContext({ browser, globalThis: null });
  context.globalThis = context;
  vm.runInContext(source, context);
  assert.equal(context.FocusReaderApi.events.onActionClicked, browserAction.onClicked);
  assert.equal(context.FocusReaderApi.events.onMessage, onMessage);
  assert.equal(context.FocusReaderApi.events.onMenuClicked, menus.onClicked);
  assert.deepEqual(await context.FocusReaderApi.tabs.executeScript(1, { file: "test.js" }), [{ ok: true }]);
});

test("Firefox Android keeps the action when commands and menus are unavailable", () => {
  const browserAction = { onClicked: event() };
  const browser = {
    browserAction,
    runtime: { onInstalled: event(), onMessage: event(), getURL: (path) => path, sendMessage: async () => ({}) },
    tabs: {
      create: async () => ({}), executeScript: async () => [], getCurrent: async () => ({}),
      query: async () => [], remove: async () => {}, sendMessage: async () => ({})
    }
  };
  const context = vm.createContext({ browser, globalThis: null });
  context.globalThis = context;
  vm.runInContext(source, context);
  assert.equal(context.FocusReaderApi.events.onActionClicked, browserAction.onClicked);
  assert.equal(context.FocusReaderApi.events.onCommand, undefined);
  assert.equal(context.FocusReaderApi.events.onMenuClicked, undefined);
  assert.equal(context.FocusReaderApi.commands, null);
  assert.equal(context.FocusReaderApi.menus, null);
});
