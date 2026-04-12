#!/usr/bin/env bash
#
# Constitution Compliance Check
# Runs grep-testable Knowns from docs/PRODUCT-OPERATIONS.md
# Exit 0 = all pass. Exit 1 = failures found.
#
# Usage: ./scripts/constitution-check.sh [--critical-path]
#   --critical-path: only check the 4 AAE demo files
#
# Knowns tested: 2, 3, 4, 6, 14, 15
# Knowns NOT tested (require human judgment): 1, 5, 7, 8, 9, 11, 12, 13
#

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$REPO_ROOT/frontend/src"
BACKEND="$REPO_ROOT/src"
FAILURES=0
PASSES=0

# Critical path = the 4 files a prospect sees at AAE
CRITICAL_PATH_FILES=(
  "$FRONTEND/pages/checkup/EntryScreen.tsx"
  "$FRONTEND/pages/checkup/ScanningTheater.tsx"
  "$FRONTEND/pages/checkup/ResultsScreen.tsx"
  "$FRONTEND/pages/checkup/conferenceFallback.ts"
)

CRITICAL_ONLY=false
if [[ "${1:-}" == "--critical-path" ]]; then
  CRITICAL_ONLY=true
fi

pass() {
  echo -e "  ${GREEN}PASS${NC} $1"
  PASSES=$((PASSES + 1))
}

fail() {
  echo -e "  ${RED}FAIL${NC} $1"
  echo -e "       $2"
  FAILURES=$((FAILURES + 1))
}

warn() {
  echo -e "  ${YELLOW}WARN${NC} $1"
}

search_path() {
  if $CRITICAL_ONLY; then
    echo "${CRITICAL_PATH_FILES[@]}"
  else
    echo "$FRONTEND"
  fi
}

# ── Known 2: One scoring algorithm ──────────────────────────────────
echo ""
echo "Known 2: One scoring algorithm"
if ! $CRITICAL_ONLY; then
  K2_HITS=$(grep -r "computeScore\|calculateScore" "$BACKEND" --include="*.ts" -l 2>/dev/null | grep -v clarityScoring.ts | grep -v node_modules || true)
  if [[ -z "$K2_HITS" ]]; then
    pass "No duplicate scoring functions outside clarityScoring.ts"
  else
    fail "Duplicate scoring functions found" "$K2_HITS"
  fi
else
  warn "Skipped (backend check, not in critical path)"
fi

# ── Known 3: No position claims ─────────────────────────────────────
echo ""
echo "Known 3: No position claims"

# Pattern: #X position displays, "rank" in customer-visible strings, "outranking"
K3_PATTERN='#\$\{.*rank\|#\$\{.*position\|"#[0-9]\|outranking\|where you rank\|where they rank\|You ranked #\|Current [Pp]osition.*#'

if $CRITICAL_ONLY; then
  K3_HITS=""
  for f in "${CRITICAL_PATH_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      RESULT=$(grep -n "$K3_PATTERN" "$f" 2>/dev/null || true)
      if [[ -n "$RESULT" ]]; then
        K3_HITS="$K3_HITS\n$(basename "$f"): $RESULT"
      fi
    fi
  done
else
  K3_HITS=$(grep -rn "$K3_PATTERN" "$FRONTEND" --include="*.tsx" --include="*.ts" \
    | grep -v node_modules \
    | grep -v "// Known\|// K3\|// removed\|// Score Ring\|// getScoreLabel\|\.test\." \
    || true)
fi

if [[ -z "$K3_HITS" ]]; then
  pass "No position claims found"
else
  fail "Position claims detected" "$K3_HITS"
fi

# ── Known 4: No fabricated dollar figures ────────────────────────────
echo ""
echo "Known 4: No fabricated dollar figures"

# Pattern: dollar amounts in template literals or JSX (likely fabricated)
K4_PATTERN='\$[0-9][0-9,]*.*at risk\|\$[0-9][0-9,]*.*per case\|\$[0-9][0-9,]*.*revenue\|\$[0-9][0-9,]*.*month.*estimated'

if $CRITICAL_ONLY; then
  K4_HITS=""
  for f in "${CRITICAL_PATH_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      RESULT=$(grep -n "$K4_PATTERN" "$f" 2>/dev/null || true)
      if [[ -n "$RESULT" ]]; then
        K4_HITS="$K4_HITS\n$(basename "$f"): $RESULT"
      fi
    fi
  done
else
  K4_HITS=$(grep -rn "$K4_PATTERN" "$FRONTEND" --include="*.tsx" --include="*.ts" \
    | grep -v node_modules \
    | grep -v "\.test\." \
    || true)
fi

if [[ -z "$K4_HITS" ]]; then
  pass "No fabricated dollar figures found"
else
  fail "Fabricated dollar figures detected" "$K4_HITS"
fi

# ── Known 6: No composite scores / gauges ────────────────────────────
echo ""
echo "Known 6: No composite scores or gauges"

K6_PATTERN='Business Clarity Score\|composite.*score.*[0-9]\|Score.*\/100\|score.*gauge\|BreathingScore'

if $CRITICAL_ONLY; then
  K6_HITS=""
  for f in "${CRITICAL_PATH_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      RESULT=$(grep -n "$K6_PATTERN" "$f" 2>/dev/null | grep -v "^[0-9]*:[[:space:]]*//" || true)
      if [[ -n "$RESULT" ]]; then
        K6_HITS="$K6_HITS\n$(basename "$f"): $RESULT"
      fi
    fi
  done
else
  # Exclude comments, imports, type definitions, and known-safe admin/legal pages
  K6_HITS=$(grep -rn "$K6_PATTERN" "$FRONTEND" --include="*.tsx" --include="*.ts" \
    | grep -v node_modules \
    | grep -v "^[^:]*:[0-9]*:[[:space:]]*//"     | grep -v "/admin/\|/legal/" \
    | grep -v "import.*BreathingScore" \
    || true)
fi

if [[ -z "$K6_HITS" ]]; then
  pass "No composite scores or gauges found"
else
  fail "Composite scores or gauges detected" "$K6_HITS"
fi

# ── Known 14: Brand constants ────────────────────────────────────────
echo ""
echo "Known 14: Brand constants"

# 14a: No font-black or font-extrabold
K14A_HITS=""
if $CRITICAL_ONLY; then
  for f in "${CRITICAL_PATH_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      RESULT=$(grep -n "font-black\|font-extrabold" "$f" 2>/dev/null || true)
      if [[ -n "$RESULT" ]]; then
        K14A_HITS="$K14A_HITS\n$(basename "$f"): $RESULT"
      fi
    fi
  done
else
  K14A_HITS=$(grep -rn "font-black\|font-extrabold" "$FRONTEND" --include="*.tsx" --include="*.ts" \
    | grep -v node_modules || true)
fi

if [[ -z "$K14A_HITS" ]]; then
  pass "No font-black or font-extrabold"
else
  fail "font-black or font-extrabold found" "$K14A_HITS"
fi

# 14b: No text-[10px] or text-[11px]
K14B_HITS=""
if $CRITICAL_ONLY; then
  for f in "${CRITICAL_PATH_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      RESULT=$(grep -n 'text-\[10px\]\|text-\[11px\]' "$f" 2>/dev/null || true)
      if [[ -n "$RESULT" ]]; then
        K14B_HITS="$K14B_HITS\n$(basename "$f"): $RESULT"
      fi
    fi
  done
else
  K14B_HITS=$(grep -rn 'text-\[10px\]\|text-\[11px\]' "$FRONTEND" --include="*.tsx" --include="*.ts" \
    | grep -v node_modules || true)
fi

if [[ -z "$K14B_HITS" ]]; then
  pass "No text-[10px] or text-[11px]"
else
  fail "Sub-minimum font sizes found" "$K14B_HITS"
fi

# 14c: No #212D40 as text color (allow as background)
K14C_HITS=""
if $CRITICAL_ONLY; then
  for f in "${CRITICAL_PATH_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      RESULT=$(grep -n 'text-\[#212D40\]' "$f" 2>/dev/null || true)
      if [[ -n "$RESULT" ]]; then
        K14C_HITS="$K14C_HITS\n$(basename "$f"): $RESULT"
      fi
    fi
  done
else
  K14C_HITS=$(grep -rn 'text-\[#212D40\]' "$FRONTEND" --include="*.tsx" --include="*.ts" \
    | grep -v node_modules || true)
fi

if [[ -z "$K14C_HITS" ]]; then
  pass "No #212D40 used as text color"
else
  fail "#212D40 used as text color (should be #1A1D23)" "$K14C_HITS"
fi

# 14d: No em-dashes in customer-facing strings
K14D_HITS=""
if $CRITICAL_ONLY; then
  for f in "${CRITICAL_PATH_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      RESULT=$(grep -Pn '\xe2\x80\x94' "$f" 2>/dev/null | grep -vE '^[0-9]+:\s*(//|/\*|\*|\{/\*)' || true)
      if [[ -n "$RESULT" ]]; then
        K14D_HITS="$K14D_HITS\n$(basename "$f"): $RESULT"
      fi
    fi
  done
else
  K14D_HITS=$(grep -Prn '—' "$FRONTEND" --include="*.tsx" --include="*.ts" \
    | grep -v node_modules \
    | grep -v "^[^:]*:[0-9]*:[[:space:]]*//" \
    | grep -v "\.test\.\|/legal/\|middot" \
    || true)
fi

if [[ -z "$K14D_HITS" ]]; then
  pass "No em-dashes found"
else
  fail "Em-dashes detected" "$K14D_HITS"
fi

# ── Known 15: Max 2 temporary prompts ────────────────────────────────
echo ""
echo "Known 15: Max 2 temporary prompts"
if ! $CRITICAL_ONLY; then
  K15_HITS=$(grep -n "limitPrompts\|maxPrompts\|MAX_PROMPTS" "$FRONTEND/pages/HomePage.tsx" 2>/dev/null || true)
  if [[ -n "$K15_HITS" ]]; then
    pass "Prompt limiter exists in HomePage.tsx"
  else
    warn "No explicit prompt limiter found in HomePage.tsx (verify manually)"
  fi
else
  warn "Skipped (not in critical path)"
fi

# ── Summary ──────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────"
if $CRITICAL_ONLY; then
  echo "  Mode: CRITICAL PATH (AAE demo files only)"
fi
echo -e "  ${GREEN}$PASSES passed${NC}, ${RED}$FAILURES failed${NC}"
echo "─────────────────────────────────"

if [[ $FAILURES -gt 0 ]]; then
  echo ""
  echo "Fix all failures before committing."
  exit 1
else
  echo ""
  echo "Constitution check passed."
  exit 0
fi
