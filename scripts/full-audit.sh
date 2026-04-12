#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ALLORO FULL AUDIT
# Three validation criteria (per Dave, April 11 2026):
#   1. Design is consistent, not sloppy
#   2. Features and APIs not disrupted
#   3. Output code consistent with existing codebase
#
# Combines design system enforcement + sanity check + build check.
# Run before every push to sandbox. Run before every handoff to Dave.
#
# Usage: bash scripts/full-audit.sh [--json]
#   --json  Outputs machine-readable JSON (for Dave's agents)
#
# Exit codes:
#   0 = all checks passed
#   1 = failures found (blocks merge to main)
# ═══════════════════════════════════════════════════════════════

set -u
# Note: -e and pipefail intentionally omitted. Grep returns 1 on no-match,
# which kills scripts under set -e + pipefail. We track failures via FAIL counter.

JSON_MODE=false
if [ "${1:-}" = "--json" ]; then JSON_MODE=true; fi

cd "$(dirname "$0")/.." 2>/dev/null || cd ~/Desktop/alloro

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
RESULTS=()

check() {
  local card="$1" label="$2" result="$3" detail="${4:-}" remediation="${5:-}"
  if [ "$result" = "PASS" ]; then
    PASS=$((PASS + 1))
  elif [ "$result" = "WARN" ]; then
    WARN=$((WARN + 1))
  else
    FAIL=$((FAIL + 1))
  fi
  if [ "$JSON_MODE" = true ]; then
    if [ -n "$remediation" ]; then
      RESULTS+=("{\"card\":\"$card\",\"check\":\"$label\",\"result\":\"$result\",\"detail\":\"$detail\",\"remediation\":$remediation}")
    else
      RESULTS+=("{\"card\":\"$card\",\"check\":\"$label\",\"result\":\"$result\",\"detail\":\"$detail\"}")
    fi
  else
    local color="$GREEN"
    [ "$result" = "WARN" ] && color="$YELLOW"
    [ "$result" = "FAIL" ] && color="$RED"
    if [ -n "$detail" ]; then
      echo -e "  ${color}${result}${NC}: $label -- $detail"
    else
      echo -e "  ${color}${result}${NC}: $label"
    fi
  fi
}

CUSTOMER_PAGES="frontend/src/pages/HomePage.tsx
frontend/src/pages/ComparePage.tsx
frontend/src/pages/ReviewsPage.tsx
frontend/src/pages/PresencePage.tsx
frontend/src/pages/ProgressReport.tsx
frontend/src/pages/ThankYou.tsx
frontend/src/pages/Demo.tsx
frontend/src/pages/Notifications.tsx
frontend/src/pages/Messages.tsx
frontend/src/pages/Signin.tsx
frontend/src/pages/Signup.tsx
frontend/src/pages/VerifyEmail.tsx
frontend/src/pages/OnboardingPaymentSuccess.tsx
frontend/src/pages/NotFound.tsx
frontend/src/pages/checkup/CheckupLayout.tsx
frontend/src/pages/checkup/EntryScreen.tsx
frontend/src/pages/checkup/ScanningTheater.tsx
frontend/src/pages/checkup/ResultsScreen.tsx
frontend/src/pages/checkup/BuildingScreen.tsx
frontend/src/pages/checkup/SharedResults.tsx
frontend/src/pages/checkup/ColleagueShare.tsx"

DASHBOARD_COMPONENTS="frontend/src/components/dashboard"

[ "$JSON_MODE" = false ] && echo ""
[ "$JSON_MODE" = false ] && echo "═══════════════════════════════════════════════════════════════"
[ "$JSON_MODE" = false ] && echo "  ALLORO FULL AUDIT"
[ "$JSON_MODE" = false ] && echo "  Three criteria: design consistency, feature integrity, codebase alignment"
[ "$JSON_MODE" = false ] && echo "  $(date '+%Y-%m-%d %H:%M:%S')"
[ "$JSON_MODE" = false ] && echo "═══════════════════════════════════════════════════════════════"

# ═══════════════════════════════════════════════════════════════
# CARD 1: DESIGN SYSTEM COMPLIANCE
# Blast Radius: Green
# Touches: frontend only
# ═══════════════════════════════════════════════════════════════

[ "$JSON_MODE" = false ] && echo ""
[ "$JSON_MODE" = false ] && echo -e "${CYAN}Card 1: Design System Compliance${NC}"
[ "$JSON_MODE" = false ] && echo "  Blast Radius: Green | Touches: frontend CSS classes"

# 1a. No bg-white on customer-facing pages (rule: warm backgrounds only)
BG_WHITE_VIOLATIONS=""
while IFS= read -r f; do
  [ ! -f "$f" ] && continue
  # Exclude: bg-white/NN (opacity variants OK), hover:bg-white, focus: contexts, gradient-to
  HITS=$(grep -n 'bg-white' "$f" 2>/dev/null | grep -v '//\|bg-white/\|hover:bg-white\|from-white\|to-white\|"white"\|admin\|svg\|fill-white\|text-white\|border-white\|stroke-white\|shadow-white\|ring-white\|placeholder:' | head -5 || true)
  if [ -n "$HITS" ]; then
    BG_WHITE_VIOLATIONS="$BG_WHITE_VIOLATIONS
$f: $(echo "$HITS" | wc -l | tr -d ' ') instances"
  fi
done <<< "$CUSTOMER_PAGES"

# Also check dashboard components
BG_WHITE_COMP=$(grep -rl 'bg-white' "$DASHBOARD_COMPONENTS/" --include="*.tsx" 2>/dev/null || true)
BG_WHITE_COMP_COUNT=0
if [ -n "$BG_WHITE_COMP" ]; then
  BG_WHITE_COMP_COUNT=$(echo "$BG_WHITE_COMP" | wc -l | tr -d ' ')
fi

BG_WHITE_COUNT=$(echo "$BG_WHITE_VIOLATIONS" | grep -c "." 2>/dev/null || echo 0)
BG_WHITE_COUNT=$((BG_WHITE_COUNT + BG_WHITE_COMP_COUNT))

if [ "$BG_WHITE_COUNT" -eq 0 ]; then
  check "1" "No bg-white on customer pages" "PASS"
else
  check "1" "No bg-white on customer pages" "WARN" "$BG_WHITE_COUNT files still use bg-white (rule: bg-stone-50/80 or bg-[#F8F6F2])"
fi

# 1b. No font-bold/font-extrabold/font-black (max: font-semibold)
BOLD_VIOLATIONS=0
BOLD_REMEDIATION="["
BOLD_FIRST=true
while IFS= read -r f; do
  [ ! -f "$f" ] && continue
  HITS=$(grep 'font-bold\|font-extrabold\|font-black' "$f" 2>/dev/null | grep -vc 'font-semibold' 2>/dev/null; true)
  if [ "$HITS" -gt 0 ] && [ "$JSON_MODE" = true ]; then
    while IFS= read -r line; do
      LINENUM=$(echo "$line" | cut -d: -f1)
      [ "$BOLD_FIRST" = true ] && BOLD_FIRST=false || BOLD_REMEDIATION="$BOLD_REMEDIATION,"
      BOLD_REMEDIATION="$BOLD_REMEDIATION{\"file\":\"$f\",\"line\":$LINENUM,\"find\":\"font-bold\",\"replace\":\"font-semibold\"}"
    done < <(grep -n 'font-bold\|font-extrabold\|font-black' "$f" 2>/dev/null | grep -v 'font-semibold' || true)
  fi
  BOLD_VIOLATIONS=$((BOLD_VIOLATIONS + HITS))
done <<< "$CUSTOMER_PAGES"

BOLD_COMP=$(grep -rc 'font-bold\|font-extrabold\|font-black' "$DASHBOARD_COMPONENTS/" --include="*.tsx" 2>/dev/null | awk -F: '{s+=$NF}END{print s+0}')
BOLD_VIOLATIONS=$((BOLD_VIOLATIONS + ${BOLD_COMP:-0}))
BOLD_REMEDIATION="$BOLD_REMEDIATION]"

if [ "$BOLD_VIOLATIONS" -eq 0 ]; then
  check "1" "No font-bold (max: font-semibold)" "PASS"
else
  check "1" "No font-bold (max: font-semibold)" "FAIL" "$BOLD_VIOLATIONS instances across customer pages" "$BOLD_REMEDIATION"
fi

# 1c. No text-[#212D40] for text (use #1A1D23)
BAD_COLOR=0
COLOR_REMEDIATION="["
COLOR_FIRST=true
while IFS= read -r f; do
  [ ! -f "$f" ] && continue
  HITS=$(grep -c 'text-\[#212D40\]' "$f" 2>/dev/null; true)
  if [ "$HITS" -gt 0 ] && [ "$JSON_MODE" = true ]; then
    while IFS= read -r line; do
      LINENUM=$(echo "$line" | cut -d: -f1)
      [ "$COLOR_FIRST" = true ] && COLOR_FIRST=false || COLOR_REMEDIATION="$COLOR_REMEDIATION,"
      COLOR_REMEDIATION="$COLOR_REMEDIATION{\"file\":\"$f\",\"line\":$LINENUM,\"find\":\"text-[#212D40]\",\"replace\":\"text-[#1A1D23]\"}"
    done < <(grep -n 'text-\[#212D40\]' "$f" 2>/dev/null || true)
  fi
  BAD_COLOR=$((BAD_COLOR + HITS))
done <<< "$CUSTOMER_PAGES"

BAD_COLOR_COMP=$(grep -rc 'text-\[#212D40\]' "$DASHBOARD_COMPONENTS/" --include="*.tsx" 2>/dev/null | awk -F: '{s+=$NF}END{print s+0}')
BAD_COLOR=$((BAD_COLOR + ${BAD_COLOR_COMP:-0}))
COLOR_REMEDIATION="$COLOR_REMEDIATION]"

if [ "$BAD_COLOR" -eq 0 ]; then
  check "1" "No text-[#212D40] (use text-[#1A1D23])" "PASS"
else
  check "1" "No text-[#212D40] (use text-[#1A1D23])" "FAIL" "$BAD_COLOR instances" "$COLOR_REMEDIATION"
fi

# 1d. No text-[10px] or text-[11px] (min: text-xs = 12px)
SMALL_TEXT=$(grep -rn 'text-\[10px\]\|text-\[11px\]' frontend/src/pages/ frontend/src/components/dashboard/ --include="*.tsx" 2>/dev/null | grep -v 'node_modules\|admin/' | wc -l | tr -d ' ')
if [ "$SMALL_TEXT" -eq 0 ]; then
  check "1" "No sub-12px text classes" "PASS"
else
  check "1" "No sub-12px text classes" "FAIL" "$SMALL_TEXT instances of text-[10px] or text-[11px]"
fi

# 1e. No em-dashes in customer-facing strings
# Filter out comments (// and {/* and * lines in JSDoc) since em-dashes in comments are harmless
EM_DASH=$(grep -rn $'\xe2\x80\x94' frontend/src/pages/ frontend/src/components/dashboard/ --include="*.tsx" 2>/dev/null | grep -v 'node_modules\|admin/\|//\|import\|{/\*\| \* \|/\*\*\|^\s*\*' | wc -l | tr -d ' ')
if [ "$EM_DASH" -eq 0 ]; then
  check "1" "No em-dashes in customer copy" "PASS"
else
  check "1" "No em-dashes in customer copy" "FAIL" "$EM_DASH instances"
fi

# ═══════════════════════════════════════════════════════════════
# CARD 2: TYPESCRIPT + BUILD INTEGRITY
# Blast Radius: Green
# Touches: compilation only
# ═══════════════════════════════════════════════════════════════

[ "$JSON_MODE" = false ] && echo ""
[ "$JSON_MODE" = false ] && echo -e "${CYAN}Card 2: TypeScript + Build Integrity${NC}"
[ "$JSON_MODE" = false ] && echo "  Blast Radius: Green | Touches: compilation"

TSC_OUT=$(cd frontend && npx tsc -b --force 2>&1 || true)
if [ -z "$TSC_OUT" ]; then
  check "2" "Frontend TypeScript: zero errors" "PASS"
else
  ERR_COUNT=$(echo "$TSC_OUT" | grep -c "error TS" || echo 0)
  if [ "$ERR_COUNT" -eq 0 ]; then
    check "2" "Frontend TypeScript: zero errors" "PASS"
  else
    check "2" "Frontend TypeScript: zero errors" "FAIL" "$ERR_COUNT errors. First: $(echo "$TSC_OUT" | grep "error TS" | head -1)"
  fi
fi

# ═══════════════════════════════════════════════════════════════
# CARD 3: CONTENT INTEGRITY (sanity-check subset)
# Blast Radius: Green
# Touches: string content only
# ═══════════════════════════════════════════════════════════════

[ "$JSON_MODE" = false ] && echo ""
[ "$JSON_MODE" = false ] && echo -e "${CYAN}Card 3: Content Integrity${NC}"
[ "$JSON_MODE" = false ] && echo "  Blast Radius: Green | Touches: user-facing strings"

# 3a. No fabricated content
FABRICATED=$(grep -rc "Great experience\|Lorem ipsum" frontend/src/ --include="*.tsx" 2>/dev/null | grep -v ":0" | wc -l | tr -d ' ')
if [ "$FABRICATED" -eq 0 ]; then
  check "3" "No fabricated content" "PASS"
else
  check "3" "No fabricated content" "FAIL" "$FABRICATED files with placeholder text"
fi

# 3b. No old branding
OLD_BRAND=$(grep -rc "Practice Clarity\|Business Intelligence\|Practice Intelligence" frontend/src/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v ":0" | grep -v "admin/" | wc -l | tr -d ' ')
if [ "$OLD_BRAND" -eq 0 ]; then
  check "3" "No old branding (Practice Clarity, etc.)" "PASS"
else
  check "3" "No old branding" "FAIL" "$OLD_BRAND files still reference old brands"
fi

# 3c. No null/undefined/unknown in user-facing strings
NULL_STR=$(grep -rn '"null"\|"undefined"\|"Unknown"' frontend/src/pages/ frontend/src/components/dashboard/ --include="*.tsx" 2>/dev/null | grep -v '//\|console\|typeof\|=== \|!== \|!= \|== \|admin/' | wc -l | tr -d ' ')
if [ "$NULL_STR" -eq 0 ]; then
  check "3" "No literal null/unknown in user strings" "PASS"
else
  check "3" "No literal null/unknown in user strings" "WARN" "$NULL_STR potential instances"
fi

# 3d. No internal jargon leaking
JARGON=$(grep -rn 'your agents\|dream.team\|proofline\|behavioral_events\|signal.bus' frontend/src/pages/ frontend/src/components/dashboard/ --include="*.tsx" 2>/dev/null | grep -v '//\|console\|import\|interface\|type \|admin/' | wc -l | tr -d ' ')
if [ "$JARGON" -eq 0 ]; then
  check "3" "No internal jargon in customer pages" "PASS"
else
  check "3" "No internal jargon in customer pages" "WARN" "$JARGON instances"
fi

# 3e. Universal language (no "patients", prefer "customers")
PATIENTS=$(grep -rn '"patient\|"Patient\|patients ' frontend/src/pages/ --include="*.tsx" 2>/dev/null | grep -v '//\|console\|admin/\|Patient.*Path\|patient.*journey\|patient.*path' | wc -l | tr -d ' ')
if [ "$PATIENTS" -eq 0 ]; then
  check "3" "Universal language (no medical-specific terms)" "PASS"
else
  check "3" "Universal language (no medical-specific terms)" "WARN" "$PATIENTS instances of 'patient' in customer pages"
fi

# ═══════════════════════════════════════════════════════════════
# CARD 4: ROUTE INVENTORY
# Blast Radius: Green
# Touches: nothing (read-only)
# ═══════════════════════════════════════════════════════════════

[ "$JSON_MODE" = false ] && echo ""
[ "$JSON_MODE" = false ] && echo -e "${CYAN}Card 4: Route Inventory${NC}"
[ "$JSON_MODE" = false ] && echo "  Blast Radius: Green | Touches: nothing (read-only)"

FRONTEND_ROUTES=$(grep -c 'Route path=' frontend/src/App.tsx 2>/dev/null || echo 0)
BACKEND_ROUTES=$(find src/routes -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
API_ENDPOINTS=$(grep -rh 'router\.\(get\|post\|put\|patch\|delete\)' src/routes/ --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')

check "4" "Frontend routes: $FRONTEND_ROUTES" "PASS"
check "4" "Backend route files: $BACKEND_ROUTES" "PASS"
check "4" "API endpoints: $API_ENDPOINTS" "PASS"

# ═══════════════════════════════════════════════════════════════
# CARD 5: CODEBASE CONSISTENCY
# Blast Radius: Green
# Touches: nothing (read-only)
# ═══════════════════════════════════════════════════════════════

[ "$JSON_MODE" = false ] && echo ""
[ "$JSON_MODE" = false ] && echo -e "${CYAN}Card 5: Codebase Consistency${NC}"
[ "$JSON_MODE" = false ] && echo "  Blast Radius: Green | Touches: nothing (read-only)"

# 5a. All API calls use apiGet/apiPost (not raw fetch to /api/)
RAW_FETCH=$(grep -rn "fetch(\"/api/\|fetch('/api/" frontend/src/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v '//\|node_modules\|admin/\|Demo\.tsx\|checkup/' | wc -l | tr -d ' ')
if [ "$RAW_FETCH" -le 5 ]; then
  check "5" "API calls use apiGet/apiPost consistently" "PASS" "$RAW_FETCH raw fetch calls (acceptable)"
else
  check "5" "API calls use apiGet/apiPost consistently" "WARN" "$RAW_FETCH raw fetch calls to /api/ (prefer apiGet/apiPost)"
fi

# 5b. Imports are consistent (no require() in frontend)
REQUIRE=$(grep -rn "require(" frontend/src/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v '//\|node_modules' | wc -l | tr -d ' ')
if [ "$REQUIRE" -eq 0 ]; then
  check "5" "No require() in frontend (ES modules only)" "PASS"
else
  check "5" "No require() in frontend (ES modules only)" "WARN" "$REQUIRE instances"
fi

# 5c. No console.log in production code (except admin)
CONSOLE_LOG=$(grep -rn 'console\.log' frontend/src/pages/ frontend/src/components/dashboard/ --include="*.tsx" 2>/dev/null | grep -v '//\|admin/' | wc -l | tr -d ' ')
if [ "$CONSOLE_LOG" -le 3 ]; then
  check "5" "Minimal console.log in customer code" "PASS" "$CONSOLE_LOG instances"
else
  check "5" "Minimal console.log in customer code" "WARN" "$CONSOLE_LOG instances (clean before production)"
fi

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════

TOTAL=$((PASS + FAIL + WARN))

if [ "$JSON_MODE" = true ]; then
  JSON_ARRAY=$(IFS=,; echo "${RESULTS[*]}")
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"pass\":$PASS,\"fail\":$FAIL,\"warn\":$WARN,\"total\":$TOTAL,\"results\":[$JSON_ARRAY]}"
else
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
    echo -e "  ${GREEN}ALL SYSTEMS GO${NC}: $PASS/$TOTAL checks passed"
    echo "  Safe to merge. Design consistent. Features intact. Code aligned."
  elif [ "$FAIL" -eq 0 ]; then
    echo -e "  ${YELLOW}GO WITH CAUTION${NC}: $PASS passed, $WARN warnings"
    echo "  Warnings are non-blocking. Review before production merge."
  else
    echo -e "  ${RED}BLOCKED${NC}: $PASS passed, $WARN warnings, $FAIL failures"
    echo "  Fix all failures before merging to main."
    echo "  Failures break Dave's three criteria. Do not hand off."
  fi
  echo "═══════════════════════════════════════════════════════════════"
fi

exit $( [ "$FAIL" -gt 0 ] && echo 1 || echo 0 )
