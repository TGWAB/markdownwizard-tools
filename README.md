# markdownwizard-tools

Markdown rendering and document exporters behind [markdownwizard.app](https://markdownwizard.app) —
Markdown in, documents out: `.txt`, `.html`, `.doc`, `.dot`, `.rtf`, `.docx`, `.pdf`.

**Everything runs in the browser. Nothing is uploaded.** There is no server component and no network
call in this package; your document never leaves the machine it is written on.

## Install

```bash
npm install git+https://github.com/TGWAB/markdownwizard-tools.git
```

## Use

```js
import { exportAs, renderHTML } from 'markdownwizard-tools';

const html = renderHTML('# Hello');                       // sanitised HTML for preview
const { blob, name } = await exportAs({ fmt: 'docx', md, title });
```

`exportAs` returns `{ blob, name }` for every format, so a download is the same three lines whichever
one the user picked. `name` is derived from the title, falling back to the document's first heading
and then to `document`.

Also exported: `renderHTML`, `lex`, `decodeEntities`, `escapeHtml`, `debounce`, `store`, `download`,
`toast`, `baseName`, `inlines`, `groupLinks`, `inlineText`, `collectImages`, `loadImages`, `FORMATS`,
`formatLabel`, and each exporter directly (`txt`, `htmlPage`, `wordHtml`, `printDoc`, `rtf`, `docx`,
`pdf`).

## Dependencies

**This package is not dependency-free**, unlike its sibling `textwizard-tools`. The exporters are
thin layers over four libraries, declared as peer dependencies so an application controls the
versions and ships one copy:

| Library | Purpose | Licence |
|---|---|---|
| [marked](https://github.com/markedjs/marked) | Markdown parsing and lexing | MIT |
| [DOMPurify](https://github.com/cure53/DOMPurify) | Sanitising rendered HTML | **Apache-2.0 / MPL-2.0** |
| [docx](https://github.com/dolanmiu/docx) | `.docx` generation | MIT |
| [pdfmake](https://github.com/bpampuch/pdfmake) | `.pdf` generation | MIT |

**DOMPurify is not MIT.** It is Cure53's, dual-licensed Apache-2.0 / MPL-2.0. It is declared here and
deliberately **not vendored**, because its terms cannot be folded into this repository's MIT licence.

## Two builds, and why

```
src/   ES modules, vendor libraries imported by name   → for bundlers (Astro, Vite, webpack)
dist/  a classic <script> bundle, vendors as globals   → for file:// use
```

The second exists because markdownwizard is a **double-clickable offline app**, and ES modules cannot
load from `file://` at all — the browser blocks them as cross-origin from a null origin. A page that
must work when opened straight from disk therefore cannot use `type="module"`, so the IIFE build
serves that case:

```html
<script src="marked.min.js"></script>   <!-- vendors first, as globals -->
<script src="purify.min.js"></script>
<script src="markdownwizard-tools.iife.js"></script>
<script>const html = MDWTools.renderHTML('# Hello');</script>
```

The bundle contains **only this package's code**. It resolves `marked`, `dompurify`, `docx` and
`pdfmake` to the globals the page has already loaded rather than inlining second copies, and those
shims are generated from what `src/` actually imports — a hand-maintained list drifted on the very
first build.

`npm run build` produces it. It also runs on `prepare`, so a git-URL install gets `dist/` without it
being committed.

## Provenance

Extracted from [markdownwizard](https://github.com/MichalAFerber/markdownwizard), where this code ran
as sixteen `<script src>` tags sharing a `window.MDW` global with zero `import`/`export` statements.

One behavioural change was necessary. The old `exportAs`, `baseName` and `printDoc` read the document
out of the page through `MDW.getSource()` and `MDW.getTitle()`, which the application assigned at
startup. A library cannot reach into a page it does not own, so the markdown and title are now
arguments. Everything else — every format quirk, every byte of the RTF and Word output — is unchanged,
and the source project's end-to-end suite validates all seven formats against this package.

## Licence

MIT — see [LICENSE](LICENSE). The peer dependencies keep their own licences, listed above.
