(function () {
  const extension = this.FocusReaderApi;
  const THEME_KEY = "focusReader.theme";
  const loading = document.getElementById("loading");
  const errorView = document.getElementById("error-view");
  const errorMessage = document.getElementById("error-message");
  const focusView = document.getElementById("focus-view");
  const fullView = document.getElementById("full-view");
  const focusHeading = document.getElementById("focus-heading");
  const focusCount = document.getElementById("focus-count");
  const progressBar = document.getElementById("progress-bar");
  const focusMain = document.getElementById("focus-main");
  const focusContent = document.getElementById("focus-content");
  const previousButton = document.getElementById("previous-item");
  const nextButton = document.getElementById("next-item");
  const copyButton = document.getElementById("copy-item");
  const themeToggle = document.getElementById("theme-toggle");
  const fullTitle = document.getElementById("full-title");
  const fullContent = document.getElementById("full-content");
  const sourceLink = document.getElementById("source-link");
  let page = null;
  let currentIndex = 0;
  let atEnd = false;
  let wheelDelta = 0;
  let wheelLocked = false;
  let wheelTimer = null;
  let touchStart = null;
  const embedded = new URLSearchParams(location.search).get("embedded") === "1";

  initialize();

  async function initialize() {
    applyTheme(localStorage.getItem(THEME_KEY) || "system");
    const token = new URLSearchParams(location.search).get("token");
    const payload = token ? await extension.runtime.sendMessage({ type: "focus-reader-get", token }) : null;
    loading.hidden = true;
    if (!payload?.ok || !payload.page?.items?.length) {
      errorMessage.textContent = payload?.error || "The Focus Reader session is missing or expired.";
      errorView.hidden = false;
      return;
    }
    page = payload.page;
    document.title = `${page.title} — Focus Reader`;
    document.documentElement.lang = page.locale || "en";
    document.documentElement.dir = page.direction === "rtl" ? "rtl" : "ltr";
    focusView.hidden = false;
    renderFocus();
  }

  function renderRuns(runs, target) {
    for (const run of runs || []) {
      let node;
      if (run.style === "code") node = document.createElement("code");
      else if (run.style === "strong") node = document.createElement("strong");
      else if (run.style === "em") node = document.createElement("em");
      else if (run.style === "link" && run.href) {
        node = document.createElement("a");
        node.href = run.href;
        node.target = "_blank";
        node.rel = "noopener noreferrer";
      } else node = document.createTextNode(run.text);
      if (node.nodeType === Node.ELEMENT_NODE) node.textContent = run.text;
      target.appendChild(node);
    }
  }

  function renderText(item, target) {
    const wrapper = document.createElement(item.kind === "callout" ? "div" : "p");
    if (item.kind === "callout") {
      wrapper.className = "callout";
      const label = document.createElement("span");
      label.className = "callout-label";
      label.textContent = item.label || "Note";
      wrapper.appendChild(label);
    }
    if (item.kind === "list") {
      const prefix = document.createElement("span");
      prefix.className = "list-prefix";
      prefix.textContent = item.ordered ? `${item.number}.` : "•";
      wrapper.appendChild(prefix);
    }
    renderRuns(item.runs, wrapper);
    target.appendChild(wrapper);
  }

  function renderCode(item, target) {
    const pre = document.createElement("pre");
    pre.className = "code-block";
    const code = document.createElement("code");
    code.textContent = item.text;
    pre.appendChild(code);
    target.appendChild(pre);
  }

  function renderTable(item, target) {
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrap";
    const table = document.createElement("table");
    table.className = "reader-table";
    const body = document.createElement("tbody");
    item.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      row.forEach((value) => {
        const cell = document.createElement(rowIndex === 0 ? "th" : "td");
        cell.textContent = value;
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrapper.appendChild(table);
    target.appendChild(wrapper);
  }

  function renderImage(item, target) {
    const figure = document.createElement("figure");
    figure.className = "reader-image";
    const image = document.createElement("img");
    image.src = item.src;
    image.alt = item.alt || "";
    figure.appendChild(image);
    if (item.caption) {
      const caption = document.createElement("figcaption");
      caption.textContent = item.caption;
      figure.appendChild(caption);
    }
    target.appendChild(figure);
  }

  function renderItem(item, target) {
    if (["text", "list", "callout"].includes(item.kind)) renderText(item, target);
    else if (item.kind === "code") renderCode(item, target);
    else if (item.kind === "table") renderTable(item, target);
    else if (item.kind === "image") renderImage(item, target);
  }

  function renderFocus() {
    if (!page) return;
    focusContent.replaceChildren();
    if (atEnd) {
      focusHeading.textContent = "Focus complete";
      focusCount.textContent = `${page.items.length} / ${page.items.length}`;
      progressBar.style.transform = "scaleX(1)";
      const completion = document.createElement("div");
      completion.className = "completion";
      const title = document.createElement("h2");
      title.textContent = "You reached the end.";
      completion.appendChild(title);
      focusContent.appendChild(completion);
      previousButton.disabled = false;
      nextButton.textContent = "Restart";
      copyButton.hidden = true;
      return;
    }
    const item = page.items[currentIndex];
    focusHeading.textContent = item.heading || page.title;
    focusCount.textContent = `${currentIndex + 1} / ${page.items.length}`;
    progressBar.style.transform = `scaleX(${(currentIndex + 1) / page.items.length})`;
    renderItem(item, focusContent);
    previousButton.disabled = currentIndex === 0;
    nextButton.textContent = "Next";
    copyButton.hidden = !clipboardText(item);
    copyButton.textContent = "Copy";
    focusMain.scrollTop = 0;
  }

  function nextItem() {
    if (atEnd) {
      currentIndex = 0;
      atEnd = false;
    } else if (currentIndex >= page.items.length - 1) atEnd = true;
    else currentIndex += 1;
    renderFocus();
  }

  function previousItem() {
    if (atEnd) {
      atEnd = false;
      currentIndex = page.items.length - 1;
    } else currentIndex = Math.max(0, currentIndex - 1);
    renderFocus();
  }

  function renderFullText() {
    fullTitle.textContent = page.title;
    sourceLink.href = page.url;
    fullContent.replaceChildren();
    let heading = page.title;
    for (let index = 0; index < page.items.length; index += 1) {
      const item = page.items[index];
      const nextHeading = item.heading || page.title;
      if (nextHeading !== heading) {
        const title = document.createElement("h2");
        title.textContent = nextHeading;
        fullContent.appendChild(title);
        heading = nextHeading;
      }
      if (item.kind === "text" && item.group) {
        const paragraph = document.createElement("p");
        renderRuns(item.runs, paragraph);
        while (page.items[index + 1]?.kind === "text" && page.items[index + 1].group === item.group) {
          paragraph.append(" ");
          index += 1;
          renderRuns(page.items[index].runs, paragraph);
        }
        fullContent.appendChild(paragraph);
      } else renderItem(item, fullContent);
    }
    focusView.hidden = true;
    fullView.hidden = false;
    scrollTo(0, 0);
    document.getElementById("back-to-focus").focus();
  }

  function showFocus() {
    fullView.hidden = true;
    focusView.hidden = false;
    renderFocus();
    document.getElementById("show-full").focus();
  }

  function clipboardText(item) {
    if (!item) return "";
    if (item.runs) return item.runs.map((run) => run.text).join("").trim();
    if (item.kind === "code") return item.text;
    if (item.kind === "table") return item.rows.map((row) => row.join("\t")).join("\n");
    if (item.kind === "image") return item.caption || item.alt || "";
    return "";
  }

  async function copyCurrentItem() {
    const text = clipboardText(page?.items?.[currentIndex]);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copyButton.textContent = "Copied";
      setTimeout(() => { copyButton.textContent = "Copy"; }, 1200);
    } catch (error) {
      copyButton.textContent = "Copy failed";
    }
  }

  function applyTheme(theme) {
    const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    themeToggle.textContent = `Theme: ${theme[0].toUpperCase()}${theme.slice(1)}`;
    themeToggle.dataset.theme = theme;
  }

  function cycleTheme() {
    const themes = ["system", "light", "dark"];
    const next = themes[(themes.indexOf(themeToggle.dataset.theme) + 1) % themes.length];
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  function closeTab() {
    if (embedded) {
      parent.postMessage({ type: "focus-reader-close" }, "*");
      return;
    }
    extension.tabs.getCurrent().then((tab) => extension.tabs.remove(tab.id));
  }

  function handleWheel(event) {
    if (wheelLocked || fullView.hidden === false) return;
    const canScroll = focusMain.scrollHeight > focusMain.clientHeight + 2;
    const atTop = focusMain.scrollTop <= 0;
    const atBottom = focusMain.scrollTop + focusMain.clientHeight >= focusMain.scrollHeight - 2;
    if (canScroll && !((event.deltaY > 0 && atBottom) || (event.deltaY < 0 && atTop))) return;
    wheelDelta += event.deltaY;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelDelta = 0; }, 180);
    if (Math.abs(wheelDelta) < 80) return;
    event.preventDefault();
    wheelLocked = true;
    wheelDelta > 0 ? nextItem() : previousItem();
    wheelDelta = 0;
    setTimeout(() => { wheelLocked = false; }, 300);
  }

  previousButton.addEventListener("click", previousItem);
  nextButton.addEventListener("click", nextItem);
  copyButton.addEventListener("click", copyCurrentItem);
  themeToggle.addEventListener("click", cycleTheme);
  document.getElementById("show-full").addEventListener("click", renderFullText);
  document.getElementById("back-to-focus").addEventListener("click", showFocus);
  document.getElementById("exit-reader").addEventListener("click", closeTab);
  document.getElementById("error-close").addEventListener("click", closeTab);
  focusView.addEventListener("wheel", handleWheel, { passive: false });
  focusView.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }, { passive: true });
  focusView.addEventListener("touchend", (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 48) return;
    if (Math.abs(deltaX) > Math.abs(deltaY) ? deltaX < 0 : deltaY < 0) nextItem();
    else previousItem();
  }, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, select")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      fullView.hidden ? closeTab() : showFocus();
    } else if (focusView.hidden === false && ["ArrowRight", "j", "J"].includes(event.key)) {
      event.preventDefault();
      nextItem();
    } else if (focusView.hidden === false && ["ArrowLeft", "k", "K"].includes(event.key)) {
      event.preventDefault();
      previousItem();
    }
  });
})();
