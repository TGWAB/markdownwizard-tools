/* ---------------------------------------------------------------------------
   Markdown Wizard — PDF (.pdf) export.
   Maps the Markdown token tree onto a pdfmake document definition, producing
   a real, selectable-text vector PDF entirely in the browser (embedded Roboto
   fonts). Images are embedded when they can be fetched; otherwise the alt
   text appears instead. For byte-perfect visual fidelity there is also the
   "Print…" route, which uses the browser's own PDF engine.
--------------------------------------------------------------------------- */
import pdfMake from 'pdfmake';
import { lex, decodeEntities } from '../core.js';
import { inlines, collectImages, loadImages } from '../common.js';

const CONTENT_W = 504; // LETTER (612pt) minus 54pt margins each side

export function pdf(md, base) {
  var tokens = lex(md);
  return loadImages(collectImages(tokens)).then(function (images) {
    var dd = {
      info: { title: base || 'document', creator: 'Markdown Wizard' },
      pageSize: 'LETTER',
      pageMargins: [54, 60, 54, 66],
      defaultStyle: { fontSize: 11, lineHeight: 1.35, color: '#1b1b24' },
      styles: {
        h1: { fontSize: 23, bold: true, margin: [0, 14, 0, 6] },
        h2: { fontSize: 18, bold: true, margin: [0, 13, 0, 5] },
        h3: { fontSize: 14.5, bold: true, margin: [0, 11, 0, 4] },
        h4: { fontSize: 12.5, bold: true, margin: [0, 10, 0, 4] },
        h5: { fontSize: 11.5, bold: true, margin: [0, 9, 0, 3] },
        h6: { fontSize: 11, bold: true, color: '#666672', margin: [0, 9, 0, 3] }
      },
      footer: function (page, total) {
        return { text: page + ' / ' + total, alignment: 'center', fontSize: 9, color: '#9a9aa6', margin: [0, 24, 0, 0] };
      },
      content: blocks(tokens, { images: images })
    };
    var pdf = pdfMake.createPdf(dd);
    return new Promise(function (resolve, reject) {
      try {
        pdf.getBlob(function (blob) { resolve(blob); });
      } catch (e) { reject(e); }
    });
  });
}

/* ------------------------------------------------------------ inline text */

function textRuns(tokens, ctx) {
  var out = [];
  inlines(tokens).forEach(function (r) {
    if (r.br) { out.push({ text: '\n' }); return; }
    if (r.image) {
      // Inline (mid-sentence) images become their alt text; block-level
      // image paragraphs are emitted as real images in blocks().
      out.push({ text: '[' + (r.image.alt || 'image') + ']', italics: true, color: '#8a8a96' });
      return;
    }
    var o = { text: r.text || '' };
    if (r.bold) o.bold = true;
    if (r.italic) o.italics = true;
    if (r.strike) o.decoration = 'lineThrough';
    if (r.code) { o.background = '#F2F1F7'; o.fontSize = 9.5; }
    if (r.href) {
      o.link = r.href;
      o.color = '#0B62C4';
      o.decoration = r.strike ? 'lineThrough' : 'underline';
    }
    out.push(o);
  });
  return out.length ? out : [{ text: '' }];
}

function isImageOnlyParagraph(t) {
  var toks = t.tokens || [];
  var sawImage = false;
  for (var i = 0; i < toks.length; i++) {
    var tk = toks[i];
    if (tk.type === 'image') { sawImage = true; continue; }
    if (tk.type === 'text' && !(tk.text || '').trim()) continue;
    if (tk.type === 'br') continue;
    return false;
  }
  return sawImage;
}

/* ----------------------------------------------------------------- blocks */

function blocks(tokens, ctx) {
  var out = [];
  (tokens || []).forEach(function (t) {
    switch (t.type) {
      case 'space': break;
      case 'heading':
        out.push({ text: textRuns(t.tokens, ctx), style: 'h' + Math.min(t.depth, 6) });
        break;
      case 'paragraph': case 'text': {
        if (t.type === 'paragraph' && isImageOnlyParagraph(t)) {
          (t.tokens || []).forEach(function (tk) {
            if (tk.type !== 'image') return;
            var img = ctx.images.get(tk.href);
            if (img) {
              out.push({ image: img.dataURL, fit: [CONTENT_W, 380], margin: [0, 4, 0, 10] });
            } else {
              var label = '[' + (tk.text || 'image') + ']';
              if (tk.href && tk.href.slice(0, 5) !== 'data:') label += ' (' + tk.href + ')';
              out.push({ text: label, italics: true, color: '#8a8a96', margin: [0, 3, 0, 8] });
            }
          });
          break;
        }
        out.push({ text: textRuns(t.tokens != null ? t.tokens : [t], ctx), margin: [0, 3, 0, 8] });
        break;
      }
      case 'code':
        out.push({
          table: { widths: ['*'], body: [[{
            text: t.text,
            preserveLeadingSpaces: true,
            fontSize: 9.5,
            lineHeight: 1.25,
            color: '#2b2b36'
          }]] },
          layout: {
            fillColor: function () { return '#F4F3F8'; },
            hLineWidth: function () { return 0; },
            vLineWidth: function () { return 0; },
            paddingLeft: function () { return 10; },
            paddingRight: function () { return 10; },
            paddingTop: function () { return 8; },
            paddingBottom: function () { return 8; }
          },
          margin: [0, 4, 0, 10]
        });
        break;
      case 'blockquote':
        out.push({
          table: { widths: [2.5, '*'], body: [[
            { text: '', fillColor: '#C9C4E0' },
            { stack: blocks(t.tokens, ctx), margin: [8, 2, 0, 2], color: '#55555f' }
          ]] },
          layout: {
            defaultBorder: false,
            hLineWidth: function () { return 0; },
            vLineWidth: function () { return 0; },
            paddingLeft: function () { return 0; },
            paddingRight: function () { return 0; },
            paddingTop: function () { return 0; },
            paddingBottom: function () { return 0; }
          },
          margin: [0, 4, 0, 10]
        });
        break;
      case 'list':
        out.push(list(t, ctx));
        break;
      case 'table':
        out.push(table(t, ctx));
        break;
      case 'hr':
        out.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.8, lineColor: '#CFCFDA' }],
          margin: [0, 10, 0, 12]
        });
        break;
      case 'html': {
        var stripped = t.text.replace(/<[^>]*>/g, '').trim();
        if (stripped) out.push({ text: decodeEntities(stripped), margin: [0, 3, 0, 8] });
        break;
      }
      default:
        if (t.tokens) out.push({ text: textRuns(t.tokens, ctx), margin: [0, 3, 0, 8] });
    }
  });
  return out;
}

function list(t, ctx) {
  var items = t.items.map(function (item) {
    var stack = [];
    (item.tokens || []).forEach(function (bt) {
      if (bt.type === 'text' || bt.type === 'paragraph') {
        var runsArr = textRuns(bt.tokens != null ? bt.tokens : [bt], ctx);
        if (item.task && stack.length === 0) {
          runsArr.unshift({ text: item.checked ? '[x] ' : '[  ] ', fontSize: 9.5, color: '#666672' });
        }
        stack.push({ text: runsArr, margin: [0, 1, 0, 2] });
      } else {
        stack.push.apply(stack, blocks([bt], ctx));
      }
    });
    if (!stack.length) stack.push({ text: '' });
    return stack.length === 1 ? stack[0] : { stack: stack };
  });
  var node = t.ordered ? { ol: items } : { ul: items };
  if (t.ordered && typeof t.start === 'number' && t.start > 1) node.start = t.start;
  node.margin = [0, 2, 0, 8];
  node.markerColor = '#6D28D9';
  return node;
}

function table(t, ctx) {
  var aligns = (t.align || []).map(function (a) { return a || 'left'; });
  function cells(row, isHeader) {
    return row.map(function (c, i) {
      var o = { text: c ? textRuns(c.tokens, ctx) : '', alignment: aligns[i] || 'left' };
      if (isHeader) { o.bold = true; o.fillColor = '#EFEDF6'; }
      return o;
    });
  }
  var body = [cells(t.header, true)];
  t.rows.forEach(function (r) { body.push(cells(r, false)); });
  return {
    table: {
      headerRows: 1,
      widths: t.header.map(function () { return 'auto'; }),
      body: body
    },
    layout: {
      hLineWidth: function () { return 0.7; },
      vLineWidth: function () { return 0.7; },
      hLineColor: function () { return '#D9D9E3'; },
      vLineColor: function () { return '#D9D9E3'; },
      paddingLeft: function () { return 8; },
      paddingRight: function () { return 8; },
      paddingTop: function () { return 4; },
      paddingBottom: function () { return 4; }
    },
    margin: [0, 4, 0, 10]
  };
}
