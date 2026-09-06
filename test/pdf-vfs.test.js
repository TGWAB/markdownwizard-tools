/* The repo had no test runner. node:test is enough to prove the two defects
   in issue #1 without standing up pdfmake's browser bundle. */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// node:test has NO default per-test timeout, so a guard that turns a hang into
// a rejection cannot be tested by simply awaiting it: delete the guard and the
// test stops reporting at all rather than reporting red. Every test whose
// subject is that guard therefore carries an explicit `timeout`. 2000ms is
// ~50x the 40ms the assertions actually wait for — wide enough not to flake on
// a contended runner, short enough that a broken guard is red in seconds
// instead of burning to the CI job limit.
const HANG_GUARD_TIMEOUT = { timeout: 2000 };

const vfs = {
  'Roboto-Regular.ttf': 'AAAA',
  'Roboto-Medium.ttf': 'AAAA',
  'Roboto-Italic.ttf': 'AAAA',
  'Roboto-MediumItalic.ttf': 'AAAA'
};

const registered = [];
// Captured AT CALL TIME. Reading `registered.length` after the whole promise
// settles is order-blind — it is satisfied just as well by registering the
// fonts *after* createPdf, which is the defect this suite is named for.
let registeredWhenCreatePdfRan = -1;
let getBlobImpl = function (cb) { cb({ type: 'application/pdf' }); };

mock.module('pdfmake', {
  exports: {
    default: {
      addVirtualFileSystem: function (v) { registered.push(v); },
      createPdf: function () {
        registeredWhenCreatePdfRan = registered.length;
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
  assert.equal(registered.length, 1, 'addVirtualFileSystem must be called exactly once');
  assert.ok(registered[0]['Roboto-Medium.ttf'], 'addVirtualFileSystem received Roboto-Medium.ttf');
  assert.equal(
    registeredWhenCreatePdfRan,
    1,
    'fonts must already be registered when createPdf runs — registering them afterwards is the missing-Roboto hang'
  );
  assert.equal(blob.type, 'application/pdf');
});

test('a hung getBlob rejects instead of stalling', HANG_GUARD_TIMEOUT, async () => {
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

test('a hung getBlob promise rejects instead of stalling', HANG_GUARD_TIMEOUT, async () => {
  const hung = { getBlob: function () { return new Promise(function () { /* never settles */ }); } };
  await assert.rejects(
    () => blobFromPdf(hung, 40),
    /timed out after 40ms.*Roboto-Medium\.ttf/
  );
});
