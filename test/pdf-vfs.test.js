/* The repo had no test runner. node:test is enough to prove the two defects
   in issue #1 without standing up pdfmake's browser bundle. */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const vfs = {
  'Roboto-Regular.ttf': 'AAAA',
  'Roboto-Medium.ttf': 'AAAA',
  'Roboto-Italic.ttf': 'AAAA',
  'Roboto-MediumItalic.ttf': 'AAAA'
};

const registered = [];
let getBlobImpl = function (cb) { cb({ type: 'application/pdf' }); };

mock.module('pdfmake', {
  exports: {
    default: {
      addVirtualFileSystem: function (v) { registered.push(v); },
      createPdf: function () {
        return { getBlob: function (cb) { return getBlobImpl(cb); } };
      }
    }
  }
});
mock.module('pdfmake/build/vfs_fonts.js', { exports: { default: vfs } });
mock.module(new URL('../src/core.js', import.meta.url).href, {
  exports: {
    lex: function () { return []; },
    decodeEntities: function (s) { return s || ''; }
  }
});
mock.module(new URL('../src/common.js', import.meta.url).href, {
  exports: {
    inlines: function () { return []; },
    collectImages: function () { return []; },
    loadImages: function () { return Promise.resolve(new Map()); }
  }
});

const { pdf, blobFromPdf } = await import('../src/exporters/pdf.js');

test('pdf() registers Roboto on pdfmake before createPdf', async () => {
  const blob = await pdf('# Hello', 'hello');
  assert.equal(registered.length, 1);
  assert.ok(registered[0]['Roboto-Medium.ttf'], 'addVirtualFileSystem received Roboto-Medium.ttf');
  assert.equal(blob.type, 'application/pdf');
});

test('a hung getBlob rejects instead of stalling', async () => {
  const hung = { getBlob: function () { /* never calls back, as pdfmake 0.2 does when a font is missing */ } };
  await assert.rejects(
    () => blobFromPdf(hung, 40),
    /timed out after 40ms.*Roboto-Medium\.ttf/
  );
});

test('a promise getBlob (pdfmake 0.3) resolves', async () => {
  const doc = { getBlob: async function () { return { type: 'application/pdf' }; } };
  const blob = await blobFromPdf(doc, 40);
  assert.equal(blob.type, 'application/pdf');
});

test('a hung getBlob promise rejects instead of stalling', async () => {
  const hung = { getBlob: function () { return new Promise(function () { /* never settles */ }); } };
  await assert.rejects(
    () => blobFromPdf(hung, 40),
    /timed out after 40ms.*Roboto-Medium\.ttf/
  );
});
