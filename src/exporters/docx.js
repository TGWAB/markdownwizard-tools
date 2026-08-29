/* ---------------------------------------------------------------------------
   Markdown Wizard — Word (.docx) export.
   Maps the Markdown token tree onto real OOXML via the docx library, so the
   result opens correctly in Microsoft Word, Google Docs, and LibreOffice
   (no HTML-in-a-wrapper tricks). Images are fetched and embedded; a fetch
   failure degrades to the image's alt text instead of failing the export.
--------------------------------------------------------------------------- */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  LevelFormat,
  WidthType
} from 'docx';
import { lex, decodeEntities, baseName } from '../core.js';
import { inlines, groupLinks, collectImages, loadImages } from '../common.js';

const MAX_IMG_PX = 620; // ~6.5in at 96dpi

export function docx(md) {
  var tokens = lex(md);
  return loadImages(collectImages(tokens)).then(function (images) {
    var ctx = {
      images: images,
      numInstance: 0,
      quote: 0,
      indent: 0,
      color: null
    };
    var children = blocks(tokens, ctx);
    var doc = new Document({
      creator: 'Markdown Wizard',
      title: baseName(md),
      styles: {
        default: {
          document: {
            run: { font: 'Calibri', size: 22 },
            paragraph: { spacing: { after: 160, line: 276 } }
          }
        }
      },
      numbering: { config: numberingConfig() },
      sections: [{ properties: {}, children: children }]
    });
    return Packer.toBlob(doc);
  });
}

function numberingConfig() {
  function levels(ordered) {
    var out = [];
    for (var l = 0; l < 9; l++) {
      out.push({
        level: l,
        format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
        text: ordered ? '%' + (l + 1) + '.' : ['•', '◦', '▪'][l % 3],
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } }
      });
    }
    return out;
  }
  return [
    { reference: 'mdw-bullet', levels: levels(false) },
    { reference: 'mdw-number', levels: levels(true) }
  ];
}

/* ------------------------------------------------------------ inline runs */

function runs(tokens, ctx, extraRun) {
  var out = [];
  if (extraRun) out.push(extraRun);
  groupLinks(inlines(tokens)).forEach(function (g) {
    var trs = g.runs.map(function (r) { return oneRun(r, ctx, !!g.href); });
    if (g.href) {
      out.push(new ExternalHyperlink({ children: trs, link: g.href }));
    } else {
      out.push.apply(out, trs);
    }
  });
  return out;
}

function oneRun(r, ctx, inLink) {
  if (r.br) return new TextRun({ text: '', break: 1 });
  if (r.image) return imageRun(r.image, ctx);
  var opts = { text: r.text || '' };
  if (r.bold || ctx.bold) opts.bold = true;
  if (r.italic) opts.italics = true;
  if (r.strike) opts.strike = true;
  if (r.code) {
    opts.font = 'Consolas';
    opts.size = 20;
    opts.shading = { type: ShadingType.CLEAR, fill: 'F2F1F7', color: 'auto' };
  }
  if (inLink) {
    opts.color = '0B62C4';
    opts.underline = {};
  } else if (ctx.color) {
    opts.color = ctx.color;
  }
  return new TextRun(opts);
}

function imageRun(img, ctx) {
  var loaded = ctx.images.get(img.href);
  if (!loaded) {
    var label = '[' + (img.alt || 'image') + ']';
    if (img.href && img.href.slice(0, 5) !== 'data:') label += ' (' + img.href + ')';
    return new TextRun({ text: label, italics: true, color: '888888' });
  }
  var w = loaded.width, h = loaded.height;
  if (w > MAX_IMG_PX) { h = Math.round(h * MAX_IMG_PX / w); w = MAX_IMG_PX; }
  return new ImageRun({ data: loaded.bytes, transformation: { width: w, height: h } });
}

/* ----------------------------------------------------------------- blocks */

function blocks(tokens, ctx) {
  var out = [];
  (tokens || []).forEach(function (t) {
    switch (t.type) {
      case 'space': break;
      case 'heading':
        out.push(new Paragraph({
          heading: HeadingLevel['HEADING_' + Math.min(t.depth, 6)],
          children: runs(t.tokens, ctx)
        }));
        break;
      case 'paragraph': case 'text':
        out.push(para(t.tokens != null ? t.tokens : [t], ctx));
        break;
      case 'code':
        out.push.apply(out, codeBlocks(t.text, ctx));
        break;
      case 'blockquote':
        out.push.apply(out, blocks(t.tokens, merge(ctx, {
          quote: ctx.quote + 1,
          color: '595959'
        })));
        break;
      case 'list':
        out.push.apply(out, list(t, ctx, 0));
        break;
      case 'table':
        out.push(table(t, ctx));
        break;
      case 'hr':
        out.push(new Paragraph({
          spacing: { after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } }
        }));
        break;
      case 'html': {
        var stripped = t.text.replace(/<[^>]*>/g, '').trim();
        if (stripped) {
          out.push(new Paragraph({
            children: [new TextRun({ text: decodeEntities(stripped) })]
          }));
        }
        break;
      }
      default:
        if (t.tokens) out.push(para(t.tokens, ctx));
    }
  });
  return out;
}

function para(inlineTokens, ctx, extraRun, paraOpts) {
  var opts = paraOpts || {};
  opts.children = runs(inlineTokens, ctx, extraRun);
  applyQuote(opts, ctx);
  return new Paragraph(opts);
}

function applyQuote(opts, ctx) {
  if (ctx.quote) {
    opts.indent = mergeIndent(opts.indent, { left: 360 * ctx.quote + (ctx.indent || 0) });
    opts.border = {
      left: { style: BorderStyle.SINGLE, size: 18, color: 'C9C4E0', space: 8 }
    };
  } else if (ctx.indent) {
    opts.indent = mergeIndent(opts.indent, { left: ctx.indent });
  }
}

function mergeIndent(a, b) {
  var o = a || {};
  for (var k in b) o[k] = b[k];
  return o;
}

function codeBlocks(text, ctx) {
  var lines = text.split('\n');
  return lines.map(function (line, i) {
    var opts = {
      children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 18 })],
      shading: { type: ShadingType.CLEAR, fill: 'F4F3F8', color: 'auto' },
      spacing: { after: i === lines.length - 1 ? 160 : 0, line: 240 }
    };
    if (ctx.indent || ctx.quote) opts.indent = { left: (ctx.indent || 0) + 360 * ctx.quote };
    return new Paragraph(opts);
  });
}

function list(t, ctx, level) {
  var out = [];
  var instance = 0;
  if (t.ordered) instance = ++ctx.numInstance;
  t.items.forEach(function (item) {
    var first = true;
    var taskRun = item.task
      ? new TextRun({ text: item.checked ? '☑ ' : '☐ ' })
      : null;
    (item.tokens || []).forEach(function (bt) {
      if (bt.type === 'list') {
        out.push.apply(out, list(bt, ctx, level + 1));
        first = false;
      } else if (bt.type === 'text' || bt.type === 'paragraph') {
        if (first) {
          out.push(para(bt.tokens != null ? bt.tokens : [bt], ctx, taskRun, {
            numbering: {
              reference: t.ordered ? 'mdw-number' : 'mdw-bullet',
              level: Math.min(level, 8),
              instance: instance
            },
            spacing: { after: 80 }
          }));
          first = false;
        } else {
          out.push(para(bt.tokens != null ? bt.tokens : [bt],
            merge(ctx, { indent: 720 * (level + 1) }), null, { spacing: { after: 80 } }));
        }
      } else if (bt.type === 'space') {
        // ignore
      } else {
        out.push.apply(out, blocks([bt], merge(ctx, { indent: 720 * (level + 1) })));
        first = false;
      }
    });
    if (first) {
      out.push(new Paragraph({
        children: taskRun ? [taskRun] : [],
        numbering: {
          reference: t.ordered ? 'mdw-number' : 'mdw-bullet',
          level: Math.min(level, 8),
          instance: instance
        },
        spacing: { after: 80 }
      }));
    }
  });
  return out;
}

function table(t, ctx) {
  var aligns = (t.align || []).map(function (a) {
    return a === 'center' ? AlignmentType.CENTER
      : a === 'right' ? AlignmentType.RIGHT
      : AlignmentType.LEFT;
  });

  function cell(c, i, isHeader) {
    var cellCtx = isHeader ? merge(ctx, { bold: true }) : ctx;
    return new TableCell({
      children: [new Paragraph({
        children: c ? runs(c.tokens, cellCtx) : [],
        alignment: aligns[i],
        spacing: { after: 0 }
      })],
      shading: isHeader ? { type: ShadingType.CLEAR, fill: 'EFEDF6', color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 110, right: 110 }
    });
  }

  var rows = [new TableRow({
    tableHeader: true,
    children: t.header.map(function (c, i) {
      var tc = cell(c, i, true);
      return tc;
    })
  })];
  t.rows.forEach(function (r) {
    rows.push(new TableRow({
      children: r.map(function (c, i) { return cell(c, i, false); })
    }));
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows
  });
}

function merge(ctx, over) {
  var o = {};
  for (var k in ctx) o[k] = ctx[k];
  for (var j in over) o[j] = over[j];
  return o;
}
