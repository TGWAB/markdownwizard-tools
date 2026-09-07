#!/usr/bin/env bash
# TGWAB eval gate—DEV-STANDARDS §2.
#
# Place at:  scripts/no-eval.sh   ·   CI:  ./scripts/no-eval.sh dist
#
# The §12 CSP never carries 'unsafe-eval', which blocks eval(), new Function(),
# bare Function("…"), and string-form setTimeout/setInterval/setImmediate. Anything
# this finds is code that will throw at runtime for a real user.
#
# Runs against BUILT output, not source: esbuild preserves the `eval` identifier
# through minification, so the check survives bundling.
#
# Escape hatch (§2): a vendor file that genuinely cannot be made eval-free goes in
# .eval-allowlist as a path prefix with a one-line reason, AND as a README deviation.
# The CSP MUST NOT be loosened instead.
set -euo pipefail

# TARGETS: every path this package actually ships (DS §2). Defaults to `dist`,
# which is what every caller passed before this took more than one.
#
# TWO DEFECTS THIS REPLACED, BOTH OF WHICH REPORTED GREEN OVER NOTHING:
#
#   1. It read only "$1". `no-eval.sh dist src` set TARGET=dist and DROPPED src
#      silently — measured 2026-09-07 by planting `new Function(` in src/ and
#      running all three forms: `src` alone exits 1, `dist` alone exits 0, and
#      `dist src` printed "eval-free: OK (dist)" and exited 0. A gate widened
#      that way looks widened, reports green, and scans exactly what it did
#      before.
#
#   2. A target that did not exist reported "eval-free: OK" and exited 0,
#      because the `|| true` below swallows grep's exit-2. So a build that never
#      ran read as a clean scan. Latent rather than live — all 11 adopters run
#      this after a build step — but it is the same failure class as (1), and a
#      missing target is now a hard error.
if [ "$#" -eq 0 ]; then set -- dist; fi

missing=()
for t in "$@"; do [ -e "$t" ] || missing+=("$t"); done
if [ "${#missing[@]}" -gt 0 ]; then
  printf '::error::no-eval target not found: %s\n' "${missing[*]}"
  printf 'A missing target is a failure, not a pass: it used to print "eval-free: OK" and exit 0, so a build that never ran read as a clean scan.\n'
  exit 1
fi

ALLOW=".eval-allowlist"

PATTERN='(^|[^A-Za-z0-9_$])eval[[:space:]]*\(|new[[:space:]]+Function[[:space:]]*\(|(^|[^A-Za-z0-9_$.])Function[[:space:]]*\([[:space:]]*["'"'"'`]|set(Timeout|Interval|Immediate)[[:space:]]*\([[:space:]]*["'"'"'`]'

hits="$(grep -nEr "$PATTERN" \
  --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.html' \
  "$@" || true)"

if [ -s "$ALLOW" ]; then
  hits="$(printf '%s\n' "$hits" \
    | grep -vFf <(grep -v '^[[:space:]]*#' "$ALLOW" | grep -v '^[[:space:]]*$') || true)"
fi

if [ -n "$hits" ]; then
  printf '::error::runtime code-generation found in %s (CSP has no %s)\n' "$*" "'unsafe-eval'"
  printf '%s\n' "$hits"
  exit 1
fi

printf 'eval-free: OK (%s)\n' "$*"
