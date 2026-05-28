#!/usr/bin/env bash
# scripts/forbid-verbs.sh - Phase 1 COMP-01 invariant.
#
# Rejects any branded recommendation vocabulary in source / prompts / config.
# The plan: every "verdict" the product exposes must be one of STRONG_SCORE,
# CAUTION, or WEAK_SCORE - never BUY/SELL/HOLD - until SEBI Research Analyst
# registration. This guard catches accidental drift at CI time.
#
# Companion to packages/shared/src/verdict.ts (branded Verdict type).
#
# Exit codes:
#   0 - no forbidden vocabulary found
#   1 - forbidden vocabulary found (with file:line:match printed to stderr)
#   2 - tooling missing (ripgrep)
#
# Usage:
#   bash scripts/forbid-verbs.sh
#   pnpm forbid-verbs                  (root package.json script)

set -euo pipefail

# Case-sensitive, word-boundary - matches the plan's exact pattern.
# Per advisor: keep case-sensitive to avoid false positives on common English
# ("hold the lock", "RECOMMEND" inside a constant, etc.). Forbidden tokens are
# the loaded compliance verbs only.
PATTERN='\b(BUY|SELL|HOLD|recommend|recommended|target price|you should invest|guaranteed return)\b'

# Exclusions:
# - dist / .next / coverage / node_modules - build output and deps.
# - This script itself - it contains the pattern by definition.
# - The Verdict module + its tests - they legitimately reference the forbidden
#   literals to assert the type/runtime guard rejects them.
# - Planning docs (.planning/, RESEARCH.md, PITFALLS.md, PROJECT.md, CLAUDE.md,
#   REQUIREMENTS.md, ROADMAP.md) - these LEGITIMATELY discuss the forbidden
#   vocabulary as compliance subject matter. Per cross-phase contract.
EXCLUDE=(
  --glob '!**/dist/**'
  --glob '!**/.next/**'
  --glob '!**/.turbo/**'
  --glob '!**/coverage/**'
  --glob '!**/node_modules/**'
  --glob '!scripts/forbid-verbs.sh'
  --glob '!**/verdict.ts'
  --glob '!**/verdict.spec.ts'
  --glob '!**/verdict.test-d.ts'
  --glob '!**/RESEARCH.md'
  --glob '!**/PITFALLS.md'
  --glob '!**/PROJECT.md'
  --glob '!**/CLAUDE.md'
  --glob '!**/REQUIREMENTS.md'
  --glob '!**/ROADMAP.md'
  --glob '!.planning/**'
  # Phase 4 compliance machinery — sanitiser fixtures + Gemini system prompts
  # legitimately contain the forbidden vocabulary as the very thing they
  # reject. Each file is an allowlisted compliance-machinery artifact.
  --glob '!apps/api/src/ai/prompts/**'
  --glob '!apps/api/src/compliance/compliance.fixtures.ts'
  --glob '!apps/api/src/compliance/compliance.sanitiser.ts'
  --glob '!apps/api/src/compliance/compliance.sanitiser.spec.ts'
  --glob '!apps/api/src/compliance/compliance.interceptor.spec.ts'
)

# Require ripgrep - the script uses --glob exclusions which grep -r can't
# express cleanly, and rg correctly skips binary files by default.
if ! command -v rg >/dev/null 2>&1; then
  echo "FAIL: ripgrep (rg) is required for forbid-verbs.sh." >&2
  echo "      Install via: brew install ripgrep  (or your platform equivalent)" >&2
  echo "      CI installs it explicitly in .github/workflows/ci.yml." >&2
  exit 2
fi

# Build the list of top-level directories to scan. Only include dirs that
# exist in the current tree - rg is fine with missing paths but skipping the
# nonexistent ones keeps stderr quiet for downstream readers.
TARGETS=()
for dir in apps packages prompts; do
  if [ -d "$dir" ]; then
    TARGETS+=("$dir")
  fi
done

if [ ${#TARGETS[@]} -eq 0 ]; then
  echo "OK: no scannable directories (apps/, packages/, prompts/) yet." >&2
  exit 0
fi

# rg flags:
#   -w  word-boundary (mirrors \b in the pattern; belt-and-braces)
#   -n  line numbers in output
#   --no-messages  silence "no matches" notes
# We deliberately let rg's case-sensitive default stand.
if rg -wn --no-messages "${EXCLUDE[@]}" "$PATTERN" "${TARGETS[@]}"; then
  echo "" >&2
  echo "FAIL: Forbidden compliance vocabulary found above (COMP-01)." >&2
  echo "" >&2
  echo "      These verbs imply branded investment recommendations and are banned" >&2
  echo "      until SEBI Research Analyst registration." >&2
  echo "" >&2
  echo "      Use STRONG_SCORE / CAUTION / WEAK_SCORE from @finsight/shared" >&2
  echo "      instead (see packages/shared/src/verdict.ts)." >&2
  echo "" >&2
  echo "      If a test genuinely needs to assert that the API rejects a" >&2
  echo "      forbidden literal, hold the string as a base64 / hex constant," >&2
  echo "      or place the file under the verdict.ts allowlist." >&2
  exit 1
fi

echo "OK: no forbidden verbs in $(IFS=,; echo "${TARGETS[*]}")."
