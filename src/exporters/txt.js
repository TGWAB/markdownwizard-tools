/* ---------------------------------------------------------------------------
   Markdown Wizard — plain text (.txt) export.
   Flattens formatting into readable text: setext-style heading underlines,
   indented lists, "> " quotes, aligned tables, "label (url)" links.
--------------------------------------------------------------------------- */
import { lex, decodeEntities } from '../core.js';

function inlineText(tokens) {
  var s = '';
  (tokens || []).forEach(function (t) {
    switch (t.type) {
      case 'strong': case 'em': case 'del':
        s += inlineText(t.tokens); break;
      case 'link': {
        var inner = inlineText(t.tokens);
        s += inner;
        var href = t.href || '';
        if (href && inner.trim() !== href && href.charAt(0) !== '#') s += ' (' + href + ')';
        break;
      }
      case 'codespan': s += decodeEntities(t.text); break;
      case 'br': s += '\n'; break;
      case 'image':
        s += '[' + (t.text || 'image') + ']';
        if (t.href && t.href.slice(0, 5) !== 'data:') s += ' (' + t.href + ')';
        break;
      case 'html': break;
      default:
        if (t.tokens && t.tokens.length) s += inlineText(t.tokens);
        else s += decodeEntities(t.text || '').replace(/\n/g, ' ');
    }
  });
  return s;
}

function walk(tokens) {
  var blocks = [];
  (tokens || []).forEach(function (t) {
    switch (t.type) {
      case 'space': break;
      case 'heading': {
        var text = inlineText(t.tokens);
        if (t.depth === 1) blocks.push([text, '='.repeat(Math.max(3, text.length))]);
        else if (t.depth === 2) blocks.push([text, '-'.repeat(Math.max(3, text.length))]);
        else blocks.push([text]);
        break;
      }
      case 'paragraph': case 'text':
        blocks.push(inlineText(t.tokens != null ? t.tokens : [t]).split('\n'));
        break;
      case 'code':
        blocks.push(t.text.split('\n').map(function (l) { return '    ' + l; }));
        break;
      case 'blockquote':
        blocks.push(joinBlocks(walk(t.tokens)).split('\n').map(function (l) {
          return ('> ' + l).replace(/\s+$/, '');
        }));
        break;
      case 'list': blocks.push(listLines(t)); break;
      case 'table': blocks.push(tableLines(t)); break;
      case 'hr': blocks.push(['-'.repeat(40)]); break;
      case 'html': {
        var stripped = t.text.replace(/<[^>]*>/g, '').trim();
        if (stripped) blocks.push([decodeEntities(stripped)]);
        break;
      }
      default:
        if (t.tokens) blocks.push(inlineText(t.tokens).split('\n'));
    }
  });
  return blocks;
}

function listLines(t) {
  var lines = [];
  var n = typeof t.start === 'number' && t.start > 0 ? t.start : 1;
  t.items.forEach(function (item) {
    var marker = t.ordered ? (n++) + '. ' : '- ';
    if (item.task) marker += item.checked ? '[x] ' : '[ ] ';
    var childLines = joinBlocks(walk(item.tokens)).split('\n');
    var pad = ' '.repeat(marker.length);
    childLines.forEach(function (l, i) {
      lines.push((i === 0 ? marker : pad) + l);
    });
  });
  return lines;
}

function tableLines(t) {
  var head = t.header.map(function (c) { return inlineText(c.tokens).replace(/\n/g, ' '); });
  var rows = t.rows.map(function (r) {
    return r.map(function (c) { return inlineText(c.tokens).replace(/\n/g, ' '); });
  });
  var widths = head.map(function (h, i) {
    var w = h.length;
    rows.forEach(function (r) { w = Math.max(w, (r[i] || '').length); });
    return Math.max(w, 3);
  });
  function fmt(cells) {
    return cells.map(function (c, i) { return (c || '') + ' '.repeat(widths[i] - (c || '').length); }).join('  |  ').replace(/\s+$/, '');
  }
  var lines = [fmt(head)];
  lines.push(widths.map(function (w) { return '-'.repeat(w); }).join('--+--'));
  rows.forEach(function (r) { lines.push(fmt(r)); });
  return lines;
}

function joinBlocks(blocks) {
  return blocks.map(function (b) { return b.join('\n'); }).join('\n\n');
}

export function txt(md) {
  return joinBlocks(walk(lex(md))) + '\n';
}
