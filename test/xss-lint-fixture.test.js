/**
 * TGWAB — the XSS rule's own control. DEV-STANDARDS §15.
 *
 * Runner is node:test (this repo does not use vitest); assertions match the
 * vendored kit. The specimen (`fixtures/xss-lint-fixture.js`) is byte-identical
 * to tgwab-standards `templates/xss-lint-fixture.js`. Adding vitest for this
 * one file would be a second runner that only the kit uses — gh-office already
 * made this call.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, relative, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, "fixtures/xss-lint-fixture.js");
const COVERS = resolve(here, "fixtures/xss-lint-covers.json");

async function flaggedCases() {
  const code = readFileSync(FIXTURE, "utf8");
  const eslint = new ESLint();
  const [result] = await eslint.lintText(code, {
    filePath: resolve(process.cwd(), "src/__xss-lint-fixture__.js"),
  });
  const lines = code.split("\n");
  const cases = new Set();
  for (const m of result.messages) {
    if (m.ruleId !== "no-restricted-syntax") continue;
    for (let i = m.line - 1; i >= 0; i--) {
      const name = /function (case\d)/.exec(lines[i]);
      if (name) {
        cases.add(name[1]);
        break;
      }
    }
  }
  return [...cases].sort();
}

test("the interpolated-JSON XSS rule flags all five hazards (DS §15)", async () => {
  const flagged = await flaggedCases();
  assert.deepEqual(flagged, ["case1", "case2", "case3", "case4", "case5"]);
});

test("the interpolated-JSON XSS rule leaves the two negative controls alone", async () => {
  const flagged = await flaggedCases();
  assert.ok(flagged.includes("case1"));
  assert.ok(!flagged.includes("case6"));
  assert.ok(!flagged.includes("case7"));
});

const KIT_FILES = new Set([
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "xss-lint-fixture.js",
  "xss-lint-fixture.test.js",
]);

function* shippedFiles(dir, root) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* shippedFiles(full, root);
    else if (entry.isFile()) yield relative(root, full);
  }
}

function carriesTheRule(config) {
  const entry = config?.rules?.["no-restricted-syntax"];
  if (!Array.isArray(entry) || entry[0] !== 2) return false;
  return entry
    .slice(1)
    .some(
      (o) =>
        typeof o?.selector === "string" &&
        o.selector.includes("JSON") &&
        o.selector.includes("stringify"),
    );
}

async function ruleCoverage(root = process.cwd()) {
  const eslint = new ESLint();
  const covered = [];
  let linted = 0;
  for (const rel of shippedFiles(root, root)) {
    if (KIT_FILES.has(basename(rel))) continue;
    if (await eslint.isPathIgnored(rel)) continue;
    linted++;
    if (carriesTheRule(await eslint.calculateConfigForFile(rel))) covered.push(rel);
  }
  return { covered, linted };
}

function repoRoot() {
  let dir = here;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function resolveNamed(named, root) {
  const fromCwd = resolve(process.cwd(), named);
  if (existsSync(fromCwd)) return fromCwd;
  if (root) {
    const fromRoot = resolve(root, named);
    if (existsSync(fromRoot)) return fromRoot;
  }
  return null;
}

const NOT_PRODUCT_SOURCE = [
  /(^|\/)[^/]*\.config\.(js|mjs|cjs)$/,
  /^(scripts|migrations|tests?|__tests__|e2e|loadtest|test-kit)\//,
];

function readDeclaration() {
  let raw;
  try {
    raw = readFileSync(COVERS, "utf8");
  } catch {
    throw new Error(
      `DS §15: ${relative(process.cwd(), COVERS)} is missing. Create it naming ` +
        "the product source this repo ships that the rule must cover.",
    );
  }
  const d = JSON.parse(raw);
  if (!Array.isArray(d.covers)) throw new Error("DS §15: `covers` must be an array.");
  return d;
}

test("the rule resolves for every file this repo NAMES as covered product source", async () => {
  const d = readDeclaration();
  const { covered, linted } = await ruleCoverage();
  process.stdout.write(
    `DS §15 coverage: the rule resolves for ${covered.length} of ${linted} ` +
      `linted files; ${d.covers.length} named as product source.\n`,
  );

  if (d.covers.length === 0) {
    assert.ok(
      typeof d.declaredGap === "string" && d.declaredGap.trim().length > 0,
      "DS §15: `covers` is empty, so `declaredGap` MUST say why",
    );
    return;
  }

  const eslint = new ESLint();
  const root = repoRoot();
  for (const named of d.covers) {
    const abs = resolveNamed(named, root);
    const normalized = abs && root ? relative(root, abs) : named;

    assert.equal(
      KIT_FILES.has(basename(named)),
      false,
      `DS §15: \`${named}\` is a file this repo GAINS by adopting the kit.`,
    );
    assert.equal(
      NOT_PRODUCT_SOURCE.some((re) => re.test(normalized)),
      false,
      `DS §15: \`${named}\` is build tooling, not product source.`,
    );
    assert.ok(
      abs !== null,
      `DS §15: \`${named}\` is named in xss-lint-covers.json but does not exist.`,
    );
    assert.ok(
      carriesTheRule(await eslint.calculateConfigForFile(abs)),
      `DS §15: the rule does NOT resolve for \`${named}\`.`,
    );
  }
});
