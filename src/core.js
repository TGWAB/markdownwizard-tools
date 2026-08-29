/* ---------------------------------------------------------------------------
   Markdown Wizard — core: rendering, sanitization, storage, shared utilities.
   Everything runs locally in the browser; there is no server component.
--------------------------------------------------------------------------- */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.use({ gfm: true, breaks: false });

/* ------------------------------------------------------------- rendering */

export function renderHTML(md) {
  var raw = marked.parse(md || '');
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel'] });
}

export function lex(md) {
  return marked.lexer(md || '');
}

/* ------------------------------------------------------------- utilities */

const _decoder = document.createElement('textarea');

// marked escapes HTML entities inside some token text (&amp;, &lt;, &#39; …);
// decode them so exported documents contain the real characters.
export function decodeEntities(s) {
  if (!s) return '';
  if (s.indexOf('&') === -1) return s;
  _decoder.innerHTML = s;
  return _decoder.value;
}

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function debounce(fn, ms) {
  var t = null;
  return function () {
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

/* --------------------------------------------------------------- storage */

export const store = {
  get: function (k) { try { return localStorage.getItem('mdw:' + k); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem('mdw:' + k, v); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem('mdw:' + k); } catch (e) {} }
};

/* -------------------------------------------------------------- document */

// File name for downloads: the title field, else the first heading, else "document".
export function baseName(md, title) {
  var name = (title || '').trim();
  if (!name) {
    var m = (md || '').match(/^\s{0,3}#{1,6}\s+(.+)$/m);
    if (m) name = m[1].replace(/[*_~`#]/g, '').trim();
  }
  if (!name) name = 'document';
  name = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim();
  return (name.slice(0, 120) || 'document');
}

/* -------------------------------------------------------------- download */

export function download(blob, filename) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
}

/* ----------------------------------------------------------------- toast */

let toastTimer = null;
export function toast(msg, ms) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2400);
}
