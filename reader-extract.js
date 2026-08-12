(function () {
  const MIN_ARTICLE_CHARACTERS = 500;
  const INLINE_TAGS = new Set(["A", "B", "CODE", "EM", "I", "SPAN", "STRONG"]);
  let groupNumber = 0;

  function normalizeSpace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function safeUrl(value, baseUrl) {
    if (!value) return "";
    try {
      const url = new URL(value, baseUrl);
      return url.protocol === "https:" ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function styleFor(element, inheritedStyle) {
    if (element.tagName === "CODE") return "code";
    if (element.tagName === "STRONG" || element.tagName === "B") return "strong";
    if (element.tagName === "EM" || element.tagName === "I") return "em";
    if (element.tagName === "A") return "link";
    return inheritedStyle;
  }

  function collectRuns(node, baseUrl, inheritedStyle = "text", inheritedHref = "", runs = []) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue) runs.push({ style: inheritedStyle, text: node.nodeValue, ...(inheritedHref ? { href: inheritedHref } : {}) });
      return runs;
    }
    if (!(node instanceof Element)) return runs;
    if (node.tagName === "BR") {
      runs.push({ style: "text", text: "\n" });
      return runs;
    }
    const style = INLINE_TAGS.has(node.tagName) ? styleFor(node, inheritedStyle) : inheritedStyle;
    const href = node.tagName === "A" ? safeUrl(node.getAttribute("href"), baseUrl) : inheritedHref;
    for (const child of node.childNodes) collectRuns(child, baseUrl, style, href, runs);
    return compactRuns(runs);
  }

  function compactRuns(runs) {
    const result = [];
    for (const run of runs) {
      if (!run.text) continue;
      const previous = result.at(-1);
      if (previous && previous.style === run.style && previous.href === run.href) previous.text += run.text;
      else result.push({ ...run });
    }
    return result;
  }

  function sliceRuns(runs, start, end) {
    const result = [];
    let offset = 0;
    for (const run of runs) {
      const runStart = offset;
      const runEnd = offset + run.text.length;
      offset = runEnd;
      if (runEnd <= start || runStart >= end) continue;
      result.push({ ...run, text: run.text.slice(Math.max(0, start - runStart), Math.min(run.text.length, end - runStart)) });
    }
    if (result.length) {
      result[0].text = result[0].text.replace(/^\s+/, "");
      result.at(-1).text = result.at(-1).text.replace(/\s+$/, "");
    }
    return compactRuns(result).filter((run) => run.text);
  }

  function splitSentences(runs, locale) {
    const text = runs.map((run) => run.text).join("");
    if (!normalizeSpace(text)) return [];
    if (!Intl.Segmenter) return [runs];
    const segmenter = new Intl.Segmenter(locale || "en", { granularity: "sentence" });
    return Array.from(segmenter.segment(text))
      .map((part) => sliceRuns(runs, part.index, part.index + part.segment.length))
      .filter((part) => normalizeSpace(part.map((run) => run.text).join("")));
  }

  function imageItem(image, heading, baseUrl) {
    const src = safeUrl(
      image.currentSrc || image.getAttribute("src") || image.getAttribute("data-src") || image.getAttribute("data-original"),
      baseUrl
    );
    if (!src) return null;
    const figure = image.closest("figure");
    return {
      kind: "image",
      heading,
      src,
      alt: normalizeSpace(image.getAttribute("alt")),
      caption: normalizeSpace(figure?.querySelector("figcaption")?.textContent)
    };
  }

  function tableRows(table) {
    return Array.from(table.querySelectorAll("tr"))
      .map((row) => Array.from(row.querySelectorAll(":scope > th, :scope > td")).map((cell) => normalizeSpace(cell.textContent)))
      .filter((row) => row.some(Boolean));
  }

  function articleItems(root, title, locale, baseUrl) {
    const items = [];
    let heading = title;

    function walk(container) {
      for (const element of container.children) {
        const name = element.tagName.toLowerCase();
        if (/^h[2-6]$/.test(name)) {
          heading = normalizeSpace(element.textContent) || heading;
          continue;
        }
        if (name === "p" || name === "blockquote") {
          const text = normalizeSpace(element.textContent);
          const images = Array.from(element.querySelectorAll("img"));
          if (text) {
            const group = `paragraph-${groupNumber++}`;
            for (const runs of splitSentences(collectRuns(element, baseUrl), locale)) {
              items.push({ kind: name === "blockquote" ? "callout" : "text", heading, runs, group, ...(name === "blockquote" ? { label: "Quote" } : {}) });
            }
          }
          for (const image of images) {
            const item = imageItem(image, heading, baseUrl);
            if (item) items.push(item);
          }
          continue;
        }
        if (name === "ul" || name === "ol") {
          Array.from(element.children).filter((child) => child.tagName === "LI").forEach((listItem, index) => {
            const runs = collectRuns(listItem, baseUrl);
            if (normalizeSpace(listItem.textContent)) {
              items.push({ kind: "list", heading, runs, ordered: name === "ol", number: name === "ol" ? index + 1 : null });
            }
          });
          continue;
        }
        if (name === "pre") {
          const code = element.querySelector("code");
          const text = (code || element).textContent.replace(/\s+$/, "");
          if (text) items.push({ kind: "code", heading, text, language: "" });
          continue;
        }
        if (name === "table") {
          const rows = tableRows(element);
          if (rows.length) items.push({ kind: "table", heading, rows });
          continue;
        }
        if (name === "figure") {
          const image = element.querySelector("img");
          const item = image && imageItem(image, heading, baseUrl);
          if (item) items.push(item);
          continue;
        }
        if (name === "img") {
          const item = imageItem(element, heading, baseUrl);
          if (item) items.push(item);
          continue;
        }
        if (["article", "div", "main", "section"].includes(name)) walk(element);
      }
    }

    walk(root);
    return items;
  }

  function fallbackArticle(documentClone) {
    const candidates = Array.from(documentClone.querySelectorAll("article"))
      .filter((article) => article.querySelectorAll("p").length >= 2)
      .map((article) => ({ article, length: normalizeSpace(article.textContent).length }))
      .filter((candidate) => candidate.length >= MIN_ARTICLE_CHARACTERS)
      .sort((left, right) => right.length - left.length);
    return candidates[0]?.article || null;
  }

  try {
    const baseUrl = location.href;
    const canonical = safeUrl(document.querySelector("link[rel='canonical']")?.href, baseUrl) || baseUrl;
    const locale = document.documentElement.lang || "en";
    const direction = document.documentElement.dir || getComputedStyle(document.documentElement).direction || "ltr";
    let title = normalizeSpace(document.querySelector("h1")?.textContent || document.title);
    let root = null;
    let method = "readability";

    if (typeof Readability === "function") {
      const parsed = new Readability(document.cloneNode(true), {
        charThreshold: MIN_ARTICLE_CHARACTERS,
        serializer: (element) => element
      }).parse();
      if (parsed?.content && normalizeSpace(parsed.textContent).length >= MIN_ARTICLE_CHARACTERS) {
        root = parsed.content;
        title = normalizeSpace(parsed.title) || title;
      }
    }

    if (!root) {
      method = "article-fallback";
      root = fallbackArticle(document.cloneNode(true));
    }
    if (!root || !title) throw new Error("No clear article was found on this page.");

    const items = articleItems(root, title, locale, baseUrl);
    if (!items.some((item) => item.kind !== "image")) throw new Error("No readable article text was found on this page.");

    return { ok: true, page: { title, url: canonical, locale, direction, readingMinutes: "", items, method } };
  } catch (error) {
    return { ok: false, error: error?.message || "The article could not be read." };
  }
})();
