const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const root = __dirname;
const readabilitySource = fs.readFileSync(path.join(root, "vendor/Readability.js"), "utf8");
const extractorSource = fs.readFileSync(path.join(root, "reader-extract.js"), "utf8");
const filler = "Dit is lange, nuttige artikeltekst die genoeg inhoud geeft voor een echte leesweergave. ".repeat(8);

function extract(html, { readability = true } = {}) {
  const dom = new JSDOM(html, {
    url: "https://example.com/news/article",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  if (readability) dom.window.eval(readabilitySource);
  return dom.window.eval(extractorSource);
}

test("Readability extracts safe structured article items", () => {
  const result = extract(`<!doctype html><html lang="nl"><head>
    <title>Een helder artikel</title><link rel="canonical" href="https://example.com/news/article">
    </head><body><nav>Menu</nav><article><h1>Een helder artikel</h1>
    <p>${filler} Eerste zin. <strong>Tweede zin.</strong></p>
    <h2>Details</h2><p>Lees <a href="/more">meer</a> en <a href="javascript:alert(1)">niets</a>. ${filler}</p>
    <figure><img src="/photo.jpg" alt="Voorbeeld"><figcaption>Een foto</figcaption></figure>
    </article></body></html>`);

  assert.equal(result.ok, true);
  assert.equal(result.page.title, "Een helder artikel");
  assert.equal(result.page.url, "https://example.com/news/article");
  assert.ok(result.page.items.some((item) => item.kind === "text"));
  assert.ok(result.page.items.some((item) => item.kind === "image" && item.src === "https://example.com/photo.jpg"));
  const links = result.page.items.flatMap((item) => item.runs || []).filter((run) => run.style === "link");
  assert.ok(links.some((run) => run.href === "https://example.com/more"));
  assert.ok(links.every((run) => !run.href.startsWith("javascript:")));
});

test("falls back to one clear article element", () => {
  const result = extract(`<!doctype html><html><head><title>Fallback article</title></head><body>
    <article><h1>Fallback article</h1><p>${filler}</p><p>${filler}</p></article>
    </body></html>`, { readability: false });

  assert.equal(result.ok, true);
  assert.equal(result.page.method, "article-fallback");
  assert.ok(result.page.items.length >= 2);
  assert.equal(result.page.items[0].group, result.page.items[1].group);
});

test("rejects a feed without a clear article", () => {
  const result = extract(`<!doctype html><html><head><title>News feed</title></head><body>
    <main><h1>Latest</h1><a href="/1">One</a><a href="/2">Two</a></main>
    </body></html>`, { readability: false });

  assert.equal(result.ok, false);
  assert.match(result.error, /clear article/i);
});

test("keeps headings, lists, quotes, code, and tables in order", () => {
  const result = extract(`<!doctype html><html><head><title>Structured article</title></head><body>
    <article><h1>Structured article</h1><p>${filler}</p><h2>Useful details</h2>
    <ul><li>First point</li><li>Second point</li></ul>
    <ol><li>Step one</li><li>Step two</li></ol>
    <blockquote>A quoted thought that matters.</blockquote>
    <pre><code>const answer = 42;</code></pre>
    <table><tr><th>Name</th><th>Value</th></tr><tr><td>Answer</td><td>42</td></tr></table>
    <p>${filler}</p></article></body></html>`);

  assert.equal(result.ok, true);
  const details = result.page.items.filter((item) => item.heading === "Useful details");
  assert.ok(details.some((item) => item.kind === "list" && item.ordered === false));
  assert.ok(details.some((item) => item.kind === "list" && item.ordered === true && item.number === 1));
  assert.ok(details.some((item) => item.kind === "callout" && item.label === "Quote"));
  assert.ok(details.some((item) => item.kind === "code" && item.text.includes("answer")));
  assert.ok(details.some((item) => item.kind === "table" && item.rows[1][1] === "42"));
});

test("drops unsafe canonical, image, and inline link URLs", () => {
  const result = extract(`<!doctype html><html><head><title>Safe article</title>
    <link rel="canonical" href="javascript:alert(1)"></head><body><article><h1>Safe article</h1>
    <p>${filler} <a href="http://example.com/plain">Plain HTTP</a>.</p>
    <img src="data:image/png;base64,AAAA" alt="Unsafe image"><p>${filler}</p>
    </article></body></html>`);

  assert.equal(result.ok, true);
  assert.equal(result.page.url, "https://example.com/news/article");
  assert.equal(result.page.items.some((item) => item.kind === "image"), false);
  const links = result.page.items.flatMap((item) => item.runs || []).filter((run) => run.style === "link");
  assert.ok(links.every((run) => !run.href));
});

test("rejects an article that has no readable text", () => {
  const result = extract(`<!doctype html><html><head><title>Image page</title></head><body>
    <article><img src="https://example.com/photo.jpg" alt="Only an image"></article>
    </body></html>`, { readability: false });

  assert.equal(result.ok, false);
  assert.match(result.error, /clear article|readable article text/i);
});
