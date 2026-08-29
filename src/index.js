/* ---------------------------------------------------------------------------
   markdownwizard-tools — public surface.

   Everything here runs in the browser and touches no network: markdown in,
   documents out. Extracted from markdownwizard.app, where the same code ran as
   sixteen <script src> tags sharing a window.MDW global.

   The one behavioural change from that original is deliberate. The old exportAs
   read the document out of the page through MDW.getSource() and MDW.getTitle(),
   which the app assigned at startup. A library cannot reach into a page it does
   not own, so the markdown and title are now arguments.
--------------------------------------------------------------------------- */
export {
  renderHTML, lex, decodeEntities, escapeHtml, debounce, store, download, toast, baseName,
} from './core.js';

export {
  inlines, groupLinks, inlineText, collectImages, loadImages, FORMATS, formatLabel,
} from './common.js';

export { txt } from './exporters/txt.js';
export { htmlPage, wordHtml, printDoc } from './exporters/html.js';
export { rtf } from './exporters/rtf.js';
export { docx } from './exporters/docx.js';
export { pdf } from './exporters/pdf.js';

import { baseName } from './core.js';
import { FORMATS } from './common.js';
import { txt } from './exporters/txt.js';
import { htmlPage, wordHtml } from './exporters/html.js';
import { rtf } from './exporters/rtf.js';
import { docx } from './exporters/docx.js';
import { pdf } from './exporters/pdf.js';

/**
 * Render `md` into the requested format.
 *
 * @param {object} opts
 * @param {string} opts.fmt    one of md, txt, html, doc, dot, rtf, docx, pdf
 * @param {string} opts.md     the markdown source
 * @param {string} [opts.title] document title; falls back to the first heading, then "document"
 * @returns {Promise<{blob: Blob, name: string}>}
 *
 * The MIME types below are load-bearing and not guesses: .doc and .dot are Word-flavoured HTML
 * behind a msword type with a BOM, which is the classic "export to Word" vehicle, and the
 * end-to-end suite asserts on those exact markers.
 */
export function exportAs({ fmt, md, title }) {
  const base = baseName(md, title);
  const name = base + (FORMATS[fmt] ? FORMATS[fmt].ext : '.' + fmt);
  const wrap = (p) => Promise.resolve(p).then((blob) => ({ blob, name }));

  switch (fmt) {
    case 'md':
      return wrap(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    case 'txt':
      return wrap(new Blob([txt(md)], { type: 'text/plain;charset=utf-8' }));
    case 'html':
      return wrap(new Blob([htmlPage(md, title)], { type: 'text/html;charset=utf-8' }));
    case 'doc':
      return wrap(new Blob(['\uFEFF', wordHtml(md, title)], { type: 'application/msword;charset=utf-8' }));
    case 'dot':
      return wrap(new Blob(['\uFEFF', wordHtml(md, title)], { type: 'application/msword;charset=utf-8' }));
    case 'rtf':
      return wrap(new Blob([rtf(md)], { type: 'application/rtf' }));
    case 'docx':
      return wrap(docx(md));
    case 'pdf':
      return wrap(pdf(md, base));
    default:
      return Promise.reject(new Error('Unknown format: ' + fmt));
  }
}
