#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# Content Quality Lint -- Static Analysis Gate
#
# Catches the class of issues from the April 13 fire drill:
#   1. Hardcoded placeholder/fallback data in page components
#   2. Empty state gaps (data defaults to 0 without render gating)
#   3. Unverified dollar figures in content pages
#   4. Dental/vertical-specific hardcoded terms in generic contexts
#
# Run: bash scripts/content-quality-lint.sh
# Add to CI: runs in <5s, no DB or server required
#
# Exit 0 = clean. Exit 1 = issues found.
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

FRONTEND="frontend/src"
PAGES="$FRONTEND/pages"
CONTENT="$PAGES/content"
MARKETING="$PAGES/marketing"
ERRORS=0
WARNINGS=0

red()    { printf "\033[0;31m%s\033[0m\n" "$1"; }
yellow() { printf "\033[0;33m%s\033[0m\n" "$1"; }
green()  { printf "\033[0;32m%s\033[0m\n" "$1"; }
dim()    { printf "\033[0;90m%s\033[0m\n" "$1"; }

echo ""
echo "========================================"
echo " Content Quality Lint"
echo "========================================"
echo ""

# ─── CHECK 1: Hardcoded placeholder data ─────────────────────────────
echo "--- Check 1: Hardcoded placeholder data ---"

# Pattern: objects with FALLBACK, PLACEHOLDER, DEMO, or example.com
# Excludes: admin pages (legitimate template tooling), HTML placeholder attrs
PLACEHOLDER_HITS=$(grep -rn \
  -e 'FALLBACK\s*=' \
  -e 'PLACEHOLDER\s*=' \
  -e 'DEMO_DATA\s*=' \
  -e 'user@example' \
  -e 'id:\s*"1"' \
  --include="*.tsx" --include="*.ts" \
  "$PAGES" 2>/dev/null | \
  grep -v 'node_modules' | \
  grep -v '\.test\.' | \
  grep -v '\.spec\.' | \
  grep -v '/admin/' | \
  grep -v 'placeholder=' | \
  grep -v '// placeholder' || true)

if [ -n "$PLACEHOLDER_HITS" ]; then
  red "  FAIL: Found hardcoded placeholder data:"
  echo "$PLACEHOLDER_HITS" | while IFS= read -r line; do
    dim "    $line"
  done
  ERRORS=$((ERRORS + 1))
else
  green "  PASS: No placeholder data found"
fi

# ─── CHECK 2: Default-to-zero without data gating ────────────────────
echo ""
echo "--- Check 2: Unsafe zero defaults in page components ---"

# Pattern: `|| 0` or `|| ""` used with display values without a hasData gate
# We look for the pattern in pages that also use useQuery (data-fetching pages)
ZERO_DEFAULT_PAGES=""
for f in $(grep -rl 'useQuery' "$PAGES" --include="*.tsx" 2>/dev/null); do
  # Check if the file has || 0 patterns used in JSX display context
  # Specifically: variables set with || 0 that are then rendered in JSX text
  ZERO_HITS=$(grep -n '|| 0;' "$f" 2>/dev/null || true)
  if [ -n "$ZERO_HITS" ]; then
    # Check if there's a hasData or similar gate
    HAS_GATE=$(grep -c 'hasData\|isLoading\|isEmpty\|noData\|WarmEmptyState' "$f" 2>/dev/null || true)
    if [ "$HAS_GATE" -eq 0 ]; then
      ZERO_DEFAULT_PAGES="$ZERO_DEFAULT_PAGES\n  $f"
      yellow "  WARN: $f has || 0 defaults but no empty state gate"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
done

if [ "$WARNINGS" -eq 0 ]; then
  green "  PASS: All data-fetching pages have empty state handling"
fi

# ─── CHECK 3: Unverified dollar figures in content pages ─────────────
echo ""
echo "--- Check 3: Dollar figures in content pages ---"

# Known-good prices (Alloro pricing, verified)
# $2,000 $400 $1,000 $200,000 (CSO salary reference) $6,000 $200 $500 (competitive comparison)
KNOWN_GOOD='(\$2,000|\$400|\$1,000|\$200,000|\$6,000|\$200/|\$500/|\$0\.00)'

DOLLAR_HITS=$(grep -rn '\$[0-9]' \
  --include="*.tsx" --include="*.ts" \
  "$CONTENT" "$MARKETING" "$PAGES/ThankYou.tsx" "$PAGES/ReferralProgram.tsx" \
  2>/dev/null | \
  grep -v 'node_modules' | \
  grep -v '\.test\.' | \
  grep -vE "$KNOWN_GOOD" | \
  grep -vE '\$\{|`\$|replace.*\$1|\.replace' | \
  grep -vE 'schema\.org|@type|@context' || true)

if [ -n "$DOLLAR_HITS" ]; then
  red "  FAIL: Found unverified dollar figures in content:"
  echo "$DOLLAR_HITS" | while IFS= read -r line; do
    dim "    $line"
  done
  ERRORS=$((ERRORS + 1))
else
  green "  PASS: No unverified dollar figures in content pages"
fi

# ─── CHECK 4: Vertical-specific hardcoded terms ──────────────────────
echo ""
echo "--- Check 4: Hardcoded vertical-specific terms ---"

# These terms should not appear in generic/shared components
# (OK in vertical-specific content pages like OrthodontistMarketing.tsx)
GENERIC_FILES=$(find "$PAGES" -name "*.tsx" \
  ! -path "*/content/*" \
  ! -path "*/admin/*" \
  ! -path "*/checkup/*" \
  ! -name "Demo.tsx" \
  ! -name "*Orthodontist*" \
  ! -name "*Dentist*" \
  ! -name "*Chiro*" \
  ! -name "*PT*" \
  ! -name "*Vet*" \
  ! -name "*Legal*" \
  ! -name "*CPA*" \
  ! -name "*Financial*" \
  ! -name "*GP*" \
  2>/dev/null || true)

VERTICAL_HITS=""
for f in $GENERIC_FILES; do
  HITS=$(grep -n \
    -e '"endodontics"' \
    -e '"Salt Lake City"' \
    -e '"endodontist' \
    -e '"orthodontist' \
    -e '"dentist near me"' \
    -e 'specialty:.*"dental"' \
    "$f" 2>/dev/null | grep -v '//' || true)
  if [ -n "$HITS" ]; then
    VERTICAL_HITS="$VERTICAL_HITS\n  $f:\n$HITS"
  fi
done

if [ -n "$VERTICAL_HITS" ]; then
  red "  FAIL: Found vertical-specific terms in generic pages:"
  echo -e "$VERTICAL_HITS" | while IFS= read -r line; do
    dim "    $line"
  done
  ERRORS=$((ERRORS + 1))
else
  green "  PASS: No vertical leakage into generic pages"
fi

# ─── CHECK 5: Hardcoded auth bypass patterns ─────────────────────────
echo ""
echo "--- Check 5: Hardcoded auth bypass patterns ---"

AUTH_BYPASS=$(grep -rn \
  -e 'const ready = true' \
  -e 'const session = {' \
  -e "session.*user.*id.*email" \
  --include="*.tsx" --include="*.ts" \
  "$PAGES" 2>/dev/null | \
  grep -v 'node_modules' | \
  grep -v '\.test\.' | \
  grep -v '\.spec\.' | \
  grep -v 'GBPIntegration' | \
  grep -v '// ' || true)

if [ -n "$AUTH_BYPASS" ]; then
  red "  FAIL: Found hardcoded auth bypass:"
  echo "$AUTH_BYPASS" | while IFS= read -r line; do
    dim "    $line"
  done
  ERRORS=$((ERRORS + 1))
else
  green "  PASS: No hardcoded auth bypass found"
fi

# ─── CHECK 6: Design system violations ───────────────────────────────
echo ""
echo "--- Check 6: Design system violations ---"

# Only flag #212D40 when used for text color (text-[#212D40]), not bg/border
DESIGN_HITS=$(grep -rn \
  -e 'text-\[10px\]' \
  -e 'text-\[11px\]' \
  -e 'font-black' \
  -e 'font-extrabold' \
  -e 'text-\[#212D40\]' \
  --include="*.tsx" \
  "$FRONTEND" 2>/dev/null | \
  grep -v 'node_modules' || true)

if [ -n "$DESIGN_HITS" ]; then
  yellow "  WARN: Design system violations:"
  echo "$DESIGN_HITS" | while IFS= read -r line; do
    dim "    $line"
  done
  WARNINGS=$((WARNINGS + 1))
else
  green "  PASS: Design system rules followed"
fi

# ─── SUMMARY ─────────────────────────────────────────────────────────
echo ""
echo "========================================"
if [ "$ERRORS" -gt 0 ]; then
  red " RESULT: $ERRORS error(s), $WARNINGS warning(s)"
  red " Fix errors before shipping."
  echo "========================================"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  yellow " RESULT: 0 errors, $WARNINGS warning(s)"
  yellow " Clean enough to ship. Warnings worth reviewing."
  echo "========================================"
  exit 0
else
  green " RESULT: All checks passed"
  echo "========================================"
  exit 0
fi
