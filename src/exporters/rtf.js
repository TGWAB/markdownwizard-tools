/* ---------------------------------------------------------------------------
   Markdown Wizard — Rich Text Format (.rtf) export.
   Hand-rolled RTF writer covering the Markdown feature set: headings, bold/
   italic/strike/code runs, hyperlink fields, nested lists, task lists, block
   quotes, code blocks, tables, and horizontal rules. Unicode is emitted as
   \uN? escapes, so any script and emoji survive the trip.

   Color table: 1=link blue, 2=muted gray, 3=code background, 4=border gray.
   Font table:  f0=Calibri, f1=Consolas.
--------------------------------------------------------------------------- */
import { lex, decodeEntities } from '../core.js';
import { inlines, groupLinks } from '../common.js';

// Heading sizes in half-points (24pt, 20pt, 16pt, 14pt, 12pt, 11pt).
const HSIZE = { 1: 48, 2: 40, 3: 32, 4: 28, 5: 24, 6: 22 };
const PAGE_TWIPS = 9360; // 6.5in usable width on US Letter with 1in margins

function esc(s) {
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var code = s.charCodeAt(i);
    var ch = s[i];
    if (ch === '\\') out += '\\\\';
    else if (ch === '{') out += '\\{';
    else if (ch === '}') out += '\\}';
    else if (code === 10 || code === 13) out += '\\line ';
    else if (code === 9) out += '\\tab ';
    else if (code < 128) out += ch;
    else {
      var n = code;
      if (n > 32767) n -= 65536;
      out += '\\u' + n + '?';
    }
  }
  return out;
}

/* ------------------------------------------------------------ inline runs */

function runRtf(r) {
  if (r.br) return '\\line ';
  if (r.image) {
    var label = '[' + (r.image.alt || 'image') + ']';
    if (r.image.href && r.image.href.slice(0, 5) !== 'data:') label += ' (' + r.image.href + ')';
    return '{\\i\\cf2 ' + esc(label) + '}';
  }
  var f = '';
  if (r.bold) f += '\\b';
  if (r.italic) f += '\\i';
  if (r.strike) f += '\\strike';
  if (r.code) f += '\\f1\\fs20';
  return '{' + f + (f ? ' ' : '') + esc(r.text || '') + '}';
}

function inlineRtf(tokens) {
  var groups = groupLinks(inlines(tokens));
  return groups.map(function (g) {
    var inner = g.runs.map(runRtf).join('');
    if (!g.href) return inner;
    return '{\\field{\\*\\fldinst{HYPERLINK "' + esc(g.href).replace(/"/g, '%22') + '"}}' +
           '{\\fldrslt{\\ul\\cf1 ' + inner + '}}}';
  }).join('');
}

/* ----------------------------------------------------------------- blocks */

function blocksRtf(tokens, ctx) {
  ctx = ctx || { quote: 0, list: 0 };
  var out = '';
  (tokens || []).forEach(function (t) {
    switch (t.type) {
      case 'space': break;
      case 'heading':
        out += '{\\pard' + quoteProps(ctx) + '\\sb240\\sa120\\keepn\\b\\fs' + HSIZE[t.depth] + ' ' +
               inlineRtf(t.tokens) + '\\par}\n';
        break;
      case 'paragraph': case 'text':
        out += '{\\pard' + quoteProps(ctx) + '\\sa160 ' +
               inlineRtf(t.tokens != null ? t.tokens : [t]) + '\\par}\n';
        break;
      case 'code': {
        var lines = t.text.split('\n').map(esc).join('\\line ');
        out += '{\\pard' + quoteProps(ctx) + '\\sa160\\cbpat3\\f1\\fs18 ' + lines + '\\par}\n';
        break;
      }
      case 'blockquote':
        out += blocksRtf(t.tokens, { quote: ctx.quote + 1, list: ctx.list });
        break;
      case 'list':
        out += listRtf(t, ctx);
        break;
      case 'table':
        out += tableRtf(t);
        break;
      case 'hr':
        out += '{\\pard\\sa160\\brdrb\\brdrs\\brdrw15\\brdrcf4\\par}\n';
        break;
      case 'html': {
        var stripped = t.text.replace(/<[^>]*>/g, '').trim();
        if (stripped) out += '{\\pard\\sa160 ' + esc(decodeEntities(stripped)) + '\\par}\n';
        break;
      }
      default:
        if (t.tokens) out += '{\\pard\\sa160 ' + inlineRtf(t.tokens) + '\\par}\n';
    }
  });
  return out;
}

function quoteProps(ctx) {
  if (!ctx.quote) return '';
  var indent = 360 * ctx.quote;
  return '\\li' + indent + '\\brdrl\\brdrs\\brdrw30\\brdrcf4\\cf2';
}

function listRtf(t, ctx) {
  var out = '';
  var level = ctx.list || 0;
  var n = typeof t.start === 'number' && t.start > 0 ? t.start : 1;
  t.items.forEach(function (item) {
    var marker;
    if (item.task) marker = item.checked ? '\\u9745?' : '\\u9744?';
    else if (t.ordered) marker = esc((n++) + '.');
    else marker = '\\bullet';
    var indent = 720 * (level + 1);
    var first = true;
    (item.tokens || []).forEach(function (bt) {
      if (bt.type === 'list') {
        out += listRtf(bt, { quote: ctx.quote, list: level + 1 });
        first = false;
      } else if (bt.type === 'text' || bt.type === 'paragraph') {
        if (first) {
          out += '{\\pard\\li' + indent + '\\fi-360\\sa80 ' + marker + '\\tab ' +
                 inlineRtf(bt.tokens != null ? bt.tokens : [bt]) + '\\par}\n';
          first = false;
        } else {
          out += '{\\pard\\li' + indent + '\\sa80 ' +
                 inlineRtf(bt.tokens != null ? bt.tokens : [bt]) + '\\par}\n';
        }
      } else if (bt.type === 'code') {
        var lines = bt.text.split('\n').map(esc).join('\\line ');
        out += '{\\pard\\li' + indent + '\\sa80\\cbpat3\\f1\\fs18 ' + lines + '\\par}\n';
        first = false;
      } else if (bt.type === 'space') {
        // ignore
      } else {
        out += blocksRtf([bt], { quote: ctx.quote, list: level + 1 });
        first = false;
      }
    });
    if (first) {
      out += '{\\pard\\li' + indent + '\\fi-360\\sa80 ' + marker + '\\tab\\par}\n';
    }
  });
  return out;
}

function tableRtf(t) {
  var cols = t.header.length;
  if (!cols) return '';
  var w = Math.floor(PAGE_TWIPS / cols);
  var alignWord = function (i) {
    var a = (t.align || [])[i];
    return a === 'center' ? '\\qc' : a === 'right' ? '\\qr' : '\\ql';
  };

  function rowRtf(cells, isHeader) {
    var def = '\\trowd\\trgaph108\\trleft0';
    for (var i = 0; i < cols; i++) {
      def += '\\clbrdrt\\brdrs\\brdrw10\\brdrcf4\\clbrdrl\\brdrs\\brdrw10\\brdrcf4' +
             '\\clbrdrb\\brdrs\\brdrw10\\brdrcf4\\clbrdrr\\brdrs\\brdrw10\\brdrcf4' +
             (isHeader ? '\\clcbpat3' : '') +
             '\\cellx' + (w * (i + 1));
    }
    var body = '';
    for (var j = 0; j < cols; j++) {
      var cell = cells[j];
      var content = cell ? inlineRtf(cell.tokens) : '';
      body += '\\pard\\intbl' + alignWord(j) + ' ' + (isHeader ? '{\\b ' + content + '}' : content) + '\\cell';
    }
    return def + body + '\\row\n';
  }

  var out = rowRtf(t.header, true);
  t.rows.forEach(function (r) { out += rowRtf(r, false); });
  return out + '\\pard\\sa160\\par\n';
}

/* ------------------------------------------------------------------ entry */

export function rtf(md) {
  var body = blocksRtf(lex(md), { quote: 0, list: 0 });
  return '{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033\n' +
    '{\\fonttbl{\\f0\\fswiss\\fcharset0 Calibri;}{\\f1\\fmodern\\fcharset0 Consolas;}}\n' +
    '{\\colortbl ;\\red11\\green98\\blue196;\\red100\\green100\\blue110;' +
    '\\red242\\green241\\blue247;\\red201\\green201\\blue212;}\n' +
    '{\\*\\generator Markdown Wizard}\\viewkind4\\uc1\\fs22\n' +
    body +
    '}';
}
