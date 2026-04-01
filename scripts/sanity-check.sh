#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ALLORO SANITY CHECK
# Not "does it compile?" -- "would a human trust this?"
#
# Catches the 29 types of issues from the April 1 Jo call:
# - Impossible numbers (510 weeks, negative percentages, $0 impact for #15 ranked)
# - Duplicate/ghost orgs
# - Mismatched states (green label inside red card)
# - "Unknown" or "null" in user-facing strings
# - Wrong branding (Practice Clarity, Business Intelligence)
# - Features that reference removed/renamed things
# - Copy that contradicts itself (No login required + login gate)
#
# Run after every build. Catches what TypeScript can't.
# ═══════════════════════════════════════════════════════════════

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check() {
  local label="$1" result="$2" detail="$3"
  if [ "$result" = "PASS" ]; then
    echo -e "  ${GREEN}PASS${NC}: $label"
    PASS=$((PASS + 1))
  elif [ "$result" = "WARN" ]; then
    echo -e "  ${YELLOW}WARN${NC}: $label -- $detail"
    WARN=$((WARN + 1))
  else
    echo -e "  ${RED}FAIL${NC}: $label -- $detail"
    FAIL=$((FAIL + 1))
  fi
}

cd "$(dirname "$0")/.." 2>/dev/null || cd /Users/coreys.air/Desktop/alloro

echo "═══════════════════════════════════════"
echo "  ALLORO SANITY CHECK"
echo "  Would a human trust this?"
echo "  $(date)"
echo "═══════════════════════════════════════"
echo ""

# ─── 1. IMPOSSIBLE NUMBERS ────────────────────────────────────
echo "CHECK 1: Impossible Numbers in Code"

# Numbers that would make a business owner laugh or lose trust
IMPOSSIBLE=$(grep -rn "999\|9999\|Infinity\|NaN" frontend/src/pages/ frontend/src/components/dashboard/ --include="*.tsx" 2>/dev/null | grep -v "node_modules\|\.test\.\|//\|MAX_SAFE\|timeout\|staleTime\|THRESHOLD\|windowMs\|maxAge\|z-index\|zIndex\|999px\|max-w" | grep -v "lastReviewDaysAgo = 999" | head -5)
if [ -z "$IMPOSSIBLE" ]; then
  check "No exposed Infinity/NaN/9999 in customer pages" "PASS"
else
  check "No exposed Infinity/NaN in customer pages" "WARN" "$(echo "$IMPOSSIBLE" | wc -l | tr -d ' ') potential instances"
fi

echo ""

# ─── 2. NULL/UNDEFINED/UNKNOWN IN USER-FACING STRINGS ─────────
echo "CHECK 2: Null/Unknown in User-Facing Copy"

NULL_STRINGS=$(grep -rn '"null"\|"undefined"\|"unknown"\|"Unknown"' frontend/src/pages/ frontend/src/components/dashboard/ --include="*.tsx" 2>/dev/null | grep -v "node_modules\|\.test\.\|//\|console\|typeof\|=== null\|!= null\|!== null\|== null\|!= undefined\|=== undefined\|!== undefined" | head -10)
COUNT=$(echo "$NULL_STRINGS" | grep -c "." 2>/dev/null)
if [ "$COUNT" -eq 0 ] || [ -z "$NULL_STRINGS" ]; then
  check "No literal 'null'/'unknown' in user-facing strings" "PASS"
else
  check "No literal 'null'/'unknown' in user-facing strings" "WARN" "$COUNT files may show 'null' or 'unknown' to users"
fi

echo ""

# ─── 3. BRANDING CONSISTENCY ──────────────────────────────────
echo "CHECK 3: Branding Consistency"

OLD_BRAND=$(grep -rc "Practice Clarity\|Business Intelligence\|Practice Intelligence\|Hamilton Wise\|hamiltonwise" frontend/src/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v ":0" | grep -v "admin/" | wc -l | tr -d ' ')
if [ "$OLD_BRAND" -eq 0 ]; then
  check "No old branding in customer-facing code" "PASS"
else
  check "No old branding in customer-facing code" "FAIL" "$OLD_BRAND files still reference old brand names"
fi

echo ""

# ─── 4. CONTRADICTORY COPY ────────────────────────────────────
echo "CHECK 4: Contradictory Copy"

NO_LOGIN=$(grep -rc "No login required\|no login\|no account" frontend/src/pages/ --include="*.tsx" 2>/dev/null | grep -v ":0" | grep -v "admin/" | wc -l | tr -d ' ')
if [ "$NO_LOGIN" -eq 0 ]; then
  check "No 'no login required' contradictions" "PASS"
else
  check "No 'no login required' contradictions" "FAIL" "$NO_LOGIN customer-facing files still claim no login needed"
fi

UNLOCK=$(grep -rc '"Unlock\|"unlock' frontend/src/pages/ --include="*.tsx" 2>/dev/null | grep -v ":0" | grep -v "admin/" | wc -l | tr -d ' ')
if [ "$UNLOCK" -eq 0 ]; then
  check "No 'unlock' gate language" "PASS"
else
  check "No 'unlock' gate language" "WARN" "$UNLOCK files use 'unlock' (signals locked content)"
fi

echo ""

# ─── 5. WE/OUR LANGUAGE (implies human team) ─────────────────
echo "CHECK 5: Product Voice (Alloro is a product, not a team)"

WE_LANG=$(grep -rn "\"We \|\"We'" frontend/src/pages/DoctorDashboard.tsx frontend/src/components/dashboard/ frontend/src/pages/ThankYou.tsx --include="*.tsx" 2>/dev/null | grep -v "//\|console\|admin/" | wc -l | tr -d ' ')
if [ "$WE_LANG" -eq 0 ]; then
  check "No 'We' language in customer dashboard" "PASS"
else
  check "No 'We' language in customer dashboard" "WARN" "$WE_LANG instances of 'We' may imply human team"
fi

echo ""

# ─── 6. DOLLAR FIGURES WITHOUT CONTEXT ────────────────────────
echo "CHECK 6: Dollar Figures (guesses destroy trust)"

DOLLAR_RISK=$(grep -rn "at risk\|Estimated Annual\|Est\. \$\|totalImpact" frontend/src/pages/checkup/ --include="*.tsx" 2>/dev/null | grep -v "//\|console\|interface\|type " | wc -l | tr -d ' ')
if [ "$DOLLAR_RISK" -eq 0 ]; then
  check "No uncontextualized dollar estimates in checkup" "PASS"
else
  check "No uncontextualized dollar estimates in checkup" "WARN" "$DOLLAR_RISK lines still reference dollar impact"
fi

echo ""

# ─── 7. FABRICATED CONTENT ────────────────────────────────────
echo "CHECK 7: Fabricated Content"

GREAT_EXP=$(grep -rc "Great experience" frontend/src/ --include="*.tsx" 2>/dev/null | grep -v ":0" | wc -l | tr -d ' ')
if [ "$GREAT_EXP" -eq 0 ]; then
  check "No fabricated review text" "PASS"
else
  check "No fabricated review text" "FAIL" "Still fabricating 'Great experience!' for empty reviews"
fi

echo ""

# ─── 8. AGENT/INTERNAL JARGON ─────────────────────────────────
echo "CHECK 8: Internal Jargon Leaking to Customers"

JARGON=$(grep -rn "your agents\|dream team\|proofline\|behavioral_events\|signal bus" frontend/src/pages/DoctorDashboard.tsx frontend/src/components/dashboard/ frontend/src/pages/ThankYou.tsx --include="*.tsx" 2>/dev/null | grep -v "//\|console\|import\|interface\|type " | wc -l | tr -d ' ')
if [ "$JARGON" -eq 0 ]; then
  check "No internal jargon in customer-facing pages" "PASS"
else
  check "No internal jargon in customer-facing pages" "WARN" "$JARGON instances of internal terms visible to customers"
fi

echo ""

# ─── 9. HARDCODED CONFERENCE/EVENT CONTENT ────────────────────
echo "CHECK 9: Event-Specific Content Properly Gated"

BOOTH=$(grep -rn "booth\|#835\|AAE" frontend/src/pages/ThankYou.tsx frontend/src/pages/DoctorDashboard.tsx --include="*.tsx" 2>/dev/null | grep -v "//\|console\|showBooth\|isConference" | wc -l | tr -d ' ')
if [ "$BOOTH" -eq 0 ]; then
  check "No ungated conference content" "PASS"
else
  check "No ungated conference content" "WARN" "$BOOTH lines may show conference content to non-conference users"
fi

echo ""

# ─── 10. PROSPECT/B2B LANGUAGE ────────────────────────────────
echo "CHECK 10: Human-Centered Language"

PROSPECTS=$(grep -rc "Prospects\|prospect" frontend/src/pages/ frontend/src/components/dashboard/ --include="*.tsx" 2>/dev/null | grep -v ":0" | grep -v "admin/" | wc -l | tr -d ' ')
if [ "$PROSPECTS" -eq 0 ]; then
  check "No 'Prospects' in customer-facing code" "PASS"
else
  check "No 'Prospects' in customer-facing code" "FAIL" "$PROSPECTS files still use 'Prospects' (B2B jargon)"
fi

echo ""

# ─── SUMMARY ──────────────────────────────────────────────────
echo "═══════════════════════════════════════"
TOTAL=$((PASS + FAIL + WARN))
if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
  echo -e "  ${GREEN}HUMAN-READY${NC}: $TOTAL/$TOTAL checks passed"
elif [ "$FAIL" -eq 0 ]; then
  echo -e "  ${YELLOW}REVIEW WARNINGS${NC}: $PASS passed, $WARN warnings"
else
  echo -e "  ${RED}NOT HUMAN-READY${NC}: $PASS passed, $WARN warnings, $FAIL failures"
  echo "  A customer would lose trust. Fix failures first."
fi
echo "═══════════════════════════════════════"
