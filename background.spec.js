const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");

const source = fs.readFileSync("background.js", "utf8");

function event() {
  return {
    listener: null,
    addListener(listener) { this.listener = listener; }
  };
}

test("the action opens the clicked HTTPS article without commands or menus", async () => {
  const onActionClicked = event();
  const executed = [];
  const messages = [];
  const api = {
    commands: null,
    menus: null,
    events: {
      onActionClicked,
      onCommand: undefined,
      onInstalled: event(),
      onMenuClicked: undefined,
      onMessage: event()
    },
    runtime: { getUrl: (path) => `moz-extension://test/${path}` },
    tabs: {
      create: async () => ({}),
      executeScript: async (_tabId, details) => {
        executed.push(details.file);
        if (details.file === "reader-extract.js") return [{ ok: true, page: { items: [{ kind: "text" }] } }];
        return [];
      },
      query: async () => [],
      sendMessage: async (_tabId, message) => { messages.push(message); }
    },
    session: null
  };
  const context = vm.createContext({
    FocusReaderApi: api,
    URL,
    console,
    crypto,
    globalThis: null,
    setTimeout: (callback, delay) => {
      const timer = setTimeout(callback, delay);
      timer.unref();
      return timer;
    }
  });
  context.globalThis = context;
  vm.runInContext(source, context);

  onActionClicked.listener({ id: 7, url: "https://example.com/article" });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(executed, [
    "vendor/Readability.js",
    "reader-extract.js",
    "extension-api.js",
    "reader-overlay.js"
  ]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "focus-reader-show");
});
