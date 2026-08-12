# Focus Reader

Focus Reader is a small Firefox extension that turns an HTTPS article into a calm, one-item-at-a-time reader. Article text stays in the extension and is not saved or sent to a server.

## Install for local use

1. Open `about:debugging` in Firefox.
2. Choose **This Firefox**.
3. Choose **Load Temporary Add-on**.
4. Select `manifest.json` from this folder.

## Use

1. Open an HTTPS article.
2. Press `Ctrl+Shift+F`, or right-click the page and choose **Open in Focus Reader**.
3. Use `J`, `K`, the arrow keys, the mouse wheel, or swipe to move.
4. Use **Full text** to see the extracted article on one page.
5. Press `Escape` or choose **Exit** to return to the page.

Focus Reader shows an error for browser pages, PDF files, HTTP pages, feeds without a clear article, and pages where it cannot find enough article text. If Firefox blocks an overlay on a built-in page, the error opens in a small extension tab instead.

## Privacy and permissions

1. `activeTab` gives the extension short-lived access only to the page on which you use the shortcut or menu command.
2. `menus` adds the **Open in Focus Reader** page menu item.
3. Extracted text and reading progress live only in memory for the open reader session.
4. The extension does not keep article text, URLs, history, or reading progress.

## Develop and test

1. Install dependencies with `npm install`.
2. Run extraction tests with `npm test`.
3. The vendored `Readability.js` comes from Mozilla Readability 0.6.0. See `vendor/README.md` and `vendor/READABILITY-LICENSE.md`.

## Install a signed release in Firefox

1. Open the project's **Releases** page on GitHub.
2. Open the latest release.
3. Download the attached `.xpi` file.
4. Open `about:addons` in Firefox.
5. Click the gear icon and choose **Install Add-on From File...**.
6. Select the downloaded `.xpi`.

Only install an `.xpi` attached to an official project release. The file is signed by Mozilla, so Firefox permits a permanent install.

## Sign a release

1. Install Mozilla's extension tool: `npm install --global web-ext`.
2. Create Mozilla Add-ons API credentials at `https://addons.mozilla.org/developers/`.
3. Copy `.env.sign.example` to `.env.sign` and add your AMO keys.
4. Run `./sign-unlisted.sh`.
5. Find the signed `.xpi` in `web-ext-artifacts/`.
6. Attach that `.xpi` to the matching GitHub Release.

The signing script submits the extension as an unlisted add-on. Mozilla signs it for direct install, but does not publish it in the add-on store.

## Chrome later

The article extractor and reader UI do not depend on Firefox APIs. Browser calls are kept in `extension-api.js`; a Chrome release can replace the Firefox Manifest V2 injection path with Manifest V3 and `chrome.scripting` without changing the article format or UI.
