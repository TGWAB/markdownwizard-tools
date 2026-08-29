/* ---------------------------------------------------------------------------
   Markdown Wizard — exporter foundation.

   Every exporter works from the same marked.js token tree. This module holds
   the shared pieces: flattening inline tokens into styled runs, grouping runs
   that belong to one hyperlink, collecting/loading images, and the format
   table shared by the UI and the export dispatcher.
--------------------------------------------------------------------------- */

import { decodeEntities } from './core.js';

/* -------------------------------------------------- inline token flattening */

// Turns marked inline tokens into a flat list of runs:
//   {text, bold, italic, strike, code, href}  |  {br:true}  |  {image:{href,alt}}
// Soft line breaks inside a paragraph become spaces; hard breaks become {br}.
export function inlines(tokens, st) {
  st = st || {};
  var out = [];
  (tokens || []).forEach(function (t) {
    switch (t.type) {
      case 'strong': out.push.apply(out, inlines(t.tokens, merge(st, { bold: true }))); break;
      case 'em': out.push.apply(out, inlines(t.tokens, merge(st, { italic: true }))); break;
      case 'del': out.push.apply(out, inlines(t.tokens, merge(st, { strike: true }))); break;
      case 'link': out.push.apply(out, inlines(t.tokens, merge(st, { href: t.href || '' }))); break;
      case 'codespan': out.push(merge(st, { code: true, text: decodeEntities(t.text) })); break;
      case 'br': out.push(merge(st, { br: true })); break;
      case 'image': out.push(merge(st, { image: { href: t.href || '', alt: t.text || '' } })); break;
      case 'html':
        if (/^<br[\s/>]/i.test(t.text || '')) out.push(merge(st, { br: true }));
        // other raw HTML tags are dropped from document exports
        break;
      default: {
        if (t.tokens && t.tokens.length) { out.push.apply(out, inlines(t.tokens, st)); break; }
        var text = decodeEntities(t.text != null ? t.text : (t.raw || '')).replace(/\n/g, ' ');
        if (text) out.push(merge(st, { text: text }));
      }
    }
  });
  return out;
}

function merge(a, b) {
  var o = {};
  for (var k in a) o[k] = a[k];
  for (var j in b) o[j] = b[j];
  return o;
}

// Groups consecutive runs that share the same href so exporters can emit a
// single hyperlink around them: [{href?, runs:[...]}, ...]
export function groupLinks(runs) {
  var out = [];
  runs.forEach(function (r) {
    var href = r.href || null;
    var last = out[out.length - 1];
    if (last && last.href === href) last.runs.push(r);
    else out.push({ href: href, runs: [r] });
  });
  return out;
}

// Plain visible text of a set of inline tokens (no styling, no URLs).
export function inlineText(tokens) {
  return inlines(tokens).map(function (r) {
    if (r.br) return '\n';
    if (r.image) return r.image.alt ? '[' + r.image.alt + ']' : '[image]';
    return r.text || '';
  }).join('');
}

/* ------------------------------------------------------------------ images */

export function collectImages(tokens) {
  var urls = [];
  (function walk(list) {
    (list || []).forEach(function (t) {
      if (t.type === 'image' && t.href && urls.indexOf(t.href) === -1) urls.push(t.href);
      if (t.tokens) walk(t.tokens);
      if (t.items) t.items.forEach(function (it) { walk(it.tokens); });
      if (t.header) t.header.forEach(function (c) { walk(c.tokens); });
      if (t.rows) t.rows.forEach(function (row) { row.forEach(function (c) { walk(c.tokens); }); });
    });
  })(tokens);
  return urls;
}

// Loads images for embedding: returns a Map href -> {dataURL, bytes, width, height}.
// Anything that is not PNG/JPEG/GIF (SVG, WebP, …) is rasterized to PNG so
// both DOCX and PDF can embed it. Failures resolve to null (exporters fall
// back to the alt text) — a missing or cross-origin image never blocks export.
export function loadImages(urls) {
  var map = new Map();
  if (!urls.length) return Promise.resolve(map);
  return Promise.all(urls.map(function (u) {
    return withTimeout(loadOne(u), 8000).then(function (img) { map.set(u, img); });
  })).then(function () { return map; });
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise(function (res) { setTimeout(function () { res(null); }, ms); })])
    .catch(function () { return null; });
}

function loadOne(url) {
  return fetch(url, { mode: 'cors' }).then(function (res) {
    if (!res.ok) return null;
    return res.blob();
  }).then(function (blob) {
    if (!blob) return null;
    var type = blob.type || '';
    if (!/^image\//.test(type) && !/^data:image/.test(url)) return null;
    return blobToDataURL(blob).then(function (dataURL) {
      if (!dataURL) return null;
      return imageDims(dataURL).then(function (dim) {
        if (!dim) return null;
        if (/image\/(png|jpe?g|gif)/.test(type)) {
          return blob.arrayBuffer().then(function (buf) {
            return { dataURL: dataURL, bytes: new Uint8Array(buf), width: dim.w, height: dim.h };
          });
        }
        return rasterize(dataURL, dim.w, dim.h);
      });
    });
  });
}

function blobToDataURL(blob) {
  return new Promise(function (res) {
    var fr = new FileReader();
    fr.onload = function () { res(fr.result); };
    fr.onerror = function () { res(null); };
    fr.readAsDataURL(blob);
  });
}

function imageDims(dataURL) {
  return new Promise(function (res) {
    var im = new Image();
    im.onload = function () { res({ w: im.naturalWidth || 600, h: im.naturalHeight || 400, el: im }); };
    im.onerror = function () { res(null); };
    im.src = dataURL;
  });
}

function rasterize(dataURL, w, h) {
  return imageDims(dataURL).then(function (dim) {
    if (!dim) return null;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    var ctx = canvas.getContext('2d');
    ctx.drawImage(dim.el, 0, 0, canvas.width, canvas.height);
    var png = canvas.toDataURL('image/png');
    var bytes = dataURLBytes(png);
    return bytes ? { dataURL: png, bytes: bytes, width: canvas.width, height: canvas.height } : null;
  }).catch(function () { return null; });
}

function dataURLBytes(dataURL) {
  var idx = dataURL.indexOf(',');
  if (idx === -1) return null;
  try {
    var bin = atob(dataURL.slice(idx + 1));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------ formats */

export const FORMATS = {
  md:   { ext: '.md',   label: 'Markdown' },
  txt:  { ext: '.txt',  label: 'plain text' },
  html: { ext: '.html', label: 'HTML' },
  doc:  { ext: '.doc',  label: 'Word 97-2003' },
  dot:  { ext: '.dot',  label: 'Word template' },
  rtf:  { ext: '.rtf',  label: 'Rich Text' },
  docx: { ext: '.docx', label: 'Word' },
  pdf:  { ext: '.pdf',  label: 'PDF' }
};

export function formatLabel(fmt) { return (FORMATS[fmt] || {}).label || fmt; }
