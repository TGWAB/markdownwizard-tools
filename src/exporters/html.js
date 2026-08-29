/* ---------------------------------------------------------------------------
   Markdown Wizard — HTML-based exports.

   - htmlPage(md, title):  self-contained styled .html file
   - wordHtml(md, title):  Word-flavored HTML used for .doc and .dot downloads
                           (Microsoft Word opens HTML documents natively; this
                           is the classic "export to Word" vehicle)
   - printDoc(md, title):  renders the document into a hidden iframe and opens
                           the system print dialog ("Save as PDF" gives a
                           pixel-perfect vector PDF with the browser's own
                           layout engine)
--------------------------------------------------------------------------- */
import { renderHTML, escapeHtml, baseName } from '../core.js';

// Shared "document look" for exported pages. Deliberately plain, print-
// friendly CSS that Word's HTML importer also understands.
const DOC_CSS = [
  'body{font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:11pt;line-height:1.55;color:#1a1a24;',
  '  max-width:7.4in;margin:0 auto;padding:24px 16px;}',
  'h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.2em 0 .45em;}',
  'h1{font-size:22pt;border-bottom:1pt solid #d9d9e3;padding-bottom:4pt;}',
  'h2{font-size:17pt;border-bottom:1pt solid #e4e4ec;padding-bottom:3pt;}',
  'h3{font-size:14pt;}h4{font-size:12pt;}h5{font-size:11pt;}h6{font-size:10pt;color:#666;}',
  'p{margin:.55em 0;}',
  'a{color:#0b62c4;}',
  'code{font-family:Consolas,"Courier New",monospace;font-size:9.5pt;background:#f2f0f7;padding:1pt 4pt;border-radius:3pt;}',
  'pre{background:#f4f3f8;border:1pt solid #e4e2ee;border-radius:6pt;padding:10pt 12pt;overflow-x:auto;line-height:1.45;}',
  'pre code{background:none;padding:0;}',
  'blockquote{margin:.8em 0;padding:2pt 12pt;border-left:3pt solid #b9a8ee;color:#555;}',
  'ul,ol{margin:.55em 0;padding-left:2em;}',
  'li{margin:.2em 0;}',
  'table{border-collapse:collapse;margin:.8em 0;}',
  'th,td{border:1pt solid #c9c9d4;padding:4pt 9pt;}',
  'th{background:#efedf6;}',
  'img{max-width:100%;}',
  'hr{border:0;border-top:1.5pt solid #d9d9e3;margin:1.4em 0;}',
  '@page{size:8.5in 11in;margin:1in;}',
  '@media print{body{max-width:none;padding:0;}pre{white-space:pre-wrap;word-break:break-word;}}'
].join('\n');

function titleOf(md, title) {
  return baseName(md, title);
}

export function htmlPage(md, title) {
  var body = renderHTML(md);
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + escapeHtml(titleOf(md, title)) + '</title>\n' +
    '<style>\n' + DOC_CSS + '\n</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n';
}

export function wordHtml(md, title) {
  var body = renderHTML(md);
  return '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
    'xmlns="http://www.w3.org/TR/REC-html40">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="ProgId" content="Word.Document">\n' +
    '<meta name="Generator" content="Markdown Wizard">\n' +
    '<title>' + escapeHtml(titleOf(md, title)) + '</title>\n' +
    '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom>' +
    '<w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->\n' +
    '<style>\n' + DOC_CSS + '\n</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n';
}

/* ------------------------------------------------------------------ print */

let printFrame = null;

export function printDoc(md, title) {
  if (printFrame) { printFrame.remove(); printFrame = null; }
  var f = printFrame = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  f.srcdoc = htmlPage(md, title);
  f.onload = function () {
    try {
      f.contentWindow.focus();
      f.contentWindow.print();
    } catch (e) {
      window.print(); // fall back to printing the app view (print CSS shows only the preview)
    }
    setTimeout(function () {
      if (printFrame === f) { f.remove(); printFrame = null; }
    }, 60000);
  };
  document.body.appendChild(f);
}
