(function () {
  const extension = this.FocusReaderApi;
  if (this.FocusReaderOverlay) return;

  const state = {
    host: null,
    iframe: null,
    htmlOverflow: "",
    bodyOverflow: ""
  };

  extension.events.onMessage.addListener((message) => {
    if (message?.type !== "focus-reader-show" || !message.token) return undefined;
    showReader(message.token);
    return Promise.resolve({ ok: true });
  });

  function showReader(token) {
    closeReader();
    state.htmlOverflow = document.documentElement.style.overflow;
    state.bodyOverflow = document.body?.style.overflow || "";
    document.documentElement.style.setProperty("overflow", "hidden", "important");
    document.body?.style.setProperty("overflow", "hidden", "important");

    const host = document.createElement("div");
    host.id = "focus-reader-overlay";
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("inset", "0", "important");
    host.style.setProperty("width", "100vw", "important");
    host.style.setProperty("height", "100vh", "important");
    host.style.setProperty("margin", "0", "important");
    host.style.setProperty("padding", "0", "important");
    host.style.setProperty("border", "0", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("background", "#f4f8fc", "important");

    const shadow = host.attachShadow({ mode: "closed" });
    const iframe = document.createElement("iframe");
    iframe.title = "Focus Reader";
    iframe.src = `${extension.runtime.getUrl("reader.html")}?embedded=1&token=${encodeURIComponent(token)}`;
    iframe.style.cssText = "display:block;width:100%;height:100%;margin:0;padding:0;border:0;background:#f4f8fc;";
    iframe.setAttribute("allow", "clipboard-write");
    shadow.appendChild(iframe);
    document.documentElement.appendChild(host);
    state.host = host;
    state.iframe = iframe;
    window.addEventListener("message", handleReaderMessage);
    iframe.addEventListener("load", () => iframe.focus(), { once: true });
  }

  function handleReaderMessage(event) {
    if (
      event.source !== state.iframe?.contentWindow ||
      event.data?.type !== "focus-reader-close"
    ) return;
    closeReader();
  }

  function closeReader() {
    const wasOpen = Boolean(state.host);
    window.removeEventListener("message", handleReaderMessage);
    state.host?.remove();
    state.host = null;
    state.iframe = null;
    if (wasOpen) {
      document.documentElement.style.overflow = state.htmlOverflow;
      if (document.body) document.body.style.overflow = state.bodyOverflow;
    }
  }

  this.FocusReaderOverlay = { close: closeReader };
})();
