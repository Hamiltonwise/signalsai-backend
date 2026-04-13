#!/usr/bin/env bash
#
# Data Flow Audit
# Catches logic bugs where data exists but is consumed incorrectly.
# Unlike constitution-check.sh (catches copy issues) and vertical-sweep.sh
# (catches language issues), this catches DATA ACCURACY issues.
#
# Exit 0 = clean. Exit 1 = issues found.
#

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$REPO_ROOT/frontend/src"
BACKEND="$REPO_ROOT/src"
ISSUES=0

issue() {
  echo -e "  ${RED}ISSUE${NC} $1"
  echo -e "        $2"
  ISSUES=$((ISSUES + 1))
}

pass() {
  echo -e "  ${GREEN}PASS${NC} $1"
}

warn() {
  echo -e "  ${YELLOW}WARN${NC} $1"
}

# ── 1. Location context propagation ─────────────────────────────────
echo ""
echo -e "${CYAN}1. Location context: every dashboard page must use selectedLocation${NC}"

DASHBOARD_PAGES=(
  "$FRONTEND/pages/HomePage.tsx"
  "$FRONTEND/pages/RankingsScreen.tsx"
  "$FRONTEND/pages/PresencePage.tsx"
  "$FRONTEND/pages/ReferralIntelligence.tsx"
  "$FRONTEND/pages/TasksPage.tsx"
)

for page in "${DASHBOARD_PAGES[@]}"; do
  name=$(basename "$page")
  if [[ -f "$page" ]]; then
    if grep -q "useLocationContext\|selectedLocation" "$page"; then
      pass "$name uses location context"
    else
      issue "$name MISSING location context" "Page does not read selectedLocation. Multi-location accounts will see wrong data."
    fi
  fi
done

# ── 2. QueryKey scoping ─────────────────────────────────────────────
echo ""
echo -e "${CYAN}2. React Query keys: must include orgId and locationId for scoped data${NC}"

for page in "${DASHBOARD_PAGES[@]}"; do
  name=$(basename "$page")
  if [[ -f "$page" ]]; then
    # Count queryKeys that have no orgId or locationId
    unscoped=$(grep -c 'queryKey: \["[^"]*"\]$' "$page" 2>/dev/null || true)
    unscoped="${unscoped:-0}"
    unscoped=$(echo "$unscoped" | tr -d '[:space:]')
    if [[ "$unscoped" -gt 0 ]]; then
      issue "$name has $unscoped unscoped queryKeys" "QueryKeys without orgId/locationId will return cached data from wrong account/location."
    else
      pass "$name queryKeys are scoped"
    fi
  fi
done

# ── 3. Competitor selection: never use competitors[0] ────────────────
echo ""
echo -e "${CYAN}3. Competitor selection: must use topCompetitor, never competitors[0]${NC}"

hits=$(grep -rn "competitors\[0\]" "$FRONTEND" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v "\.test\.\|// " || true)
if [[ -z "$hits" ]]; then
  pass "No competitors[0] usage found"
else
  echo "$hits" | while IFS= read -r line; do
    file=$(echo "$line" | cut -d: -f1)
    lineno=$(echo "$line" | cut -d: -f2)
    issue "competitors[0] at $(basename "$file"):$lineno" "Use raw.topCompetitor or sort by reviewCount first. Unsorted array picks wrong competitor."
  done
fi

# ── 4. Field name consistency: review counts ─────────────────────────
echo ""
echo -e "${CYAN}4. Field name consistency: review count field names${NC}"

# Check for the 4+ different names used for the same field
review_fields=$(grep -rn "reviewCount\|userRatingCount\|totalReviews\|review_count\|client_review_count" "$FRONTEND/pages" "$FRONTEND/components/dashboard" --include="*.tsx" 2>/dev/null | grep -v "import\|// \|interface\|type " | wc -l | tr -d ' ')
if [[ "$review_fields" -gt 0 ]]; then
  warn "$review_fields references to review count fields across 4+ naming conventions"
  # Check for defensive fallback chains (these mask the real bug)
  chains=$(grep -rn "reviewCount.*||\|??\|userRatingCount\|totalReviews" "$FRONTEND/pages" "$FRONTEND/components/dashboard" --include="*.tsx" 2>/dev/null | grep -c "||.*||" || echo "0")
  if [[ "$chains" -gt 0 ]]; then
    warn "$chains triple-fallback chains (A || B || C) -- indicates field naming inconsistency"
  fi
fi

# ── 5. Silent zeros: || 0 on display values ──────────────────────────
echo ""
echo -e "${CYAN}5. Silent zeros: values that show 0 instead of 'no data'${NC}"

for page in "${DASHBOARD_PAGES[@]}"; do
  name=$(basename "$page")
  if [[ -f "$page" ]]; then
    zeros=$(grep -c '|| 0\b\|?? 0\b' "$page" 2>/dev/null || true)
    zeros="${zeros:-0}"
    zeros=$(echo "$zeros" | tr -d '[:space:]')
    if [[ "$zeros" -gt 5 ]]; then
      warn "$name has $zeros zero-fallbacks. Some may show '0' where 'no data' would be more honest."
    fi
  fi
done

# ── 6. Comparison direction: review/rating gaps ──────────────────────
echo ""
echo -e "${CYAN}6. Comparison direction: verify subtraction order in gaps${NC}"

# Check all subtraction patterns involving reviews or ratings
gaps=$(grep -rn "reviewCount.*-\|Reviews.*-\|rating.*-\|Rating.*-" "$FRONTEND/pages" "$FRONTEND/components/dashboard" --include="*.tsx" 2>/dev/null | grep -v "import\|// \|className\|px\|rem\|duration\|delay" | grep -v "node_modules" || true)
gap_count=$(echo "$gaps" | grep -c "." 2>/dev/null || echo "0")
if [[ "$gap_count" -gt 0 ]]; then
  warn "$gap_count comparison operations found. Manual verification needed for subtraction direction."
fi

# ── 7. Stale data: pages with no freshness indicator ─────────────────
echo ""
echo -e "${CYAN}7. Freshness: customer-facing pages should show when data was last updated${NC}"

for page in "${DASHBOARD_PAGES[@]}"; do
  name=$(basename "$page")
  if [[ -f "$page" ]]; then
    if grep -qi "last updated\|as of\|updated at\|refreshed\|last scanned\|last checked" "$page"; then
      pass "$name has freshness indicator"
    else
      warn "$name has no freshness indicator. Customer cannot tell if data is fresh or stale."
    fi
  fi
done

# ── 8. API endpoint coverage: frontend calls vs backend routes ───────
echo ""
echo -e "${CYAN}8. API coverage: check for frontend calls to non-existent endpoints${NC}"

# Extract frontend API paths
frontend_paths=$(grep -roh '"/api/[^"]*\|/api/[^"]*' "$FRONTEND" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v node_modules | sort -u | head -30)
missing=0
for path in $frontend_paths; do
  # Normalize: remove query params and path params
  normalized=$(echo "$path" | sed 's/\?.*//' | sed 's/\/:[^/]*/\/PARAM/g' | sed 's/"//g')
  # Check if a route file handles this path
  route_segment=$(echo "$normalized" | sed 's|/api/||' | cut -d/ -f1)
  if ! grep -rq "$route_segment" "$BACKEND/routes/" "$BACKEND/index.ts" 2>/dev/null; then
    issue "Frontend calls $path but no matching backend route found" "Check if route is registered in index.ts"
    missing=$((missing + 1))
  fi
done
if [[ "$missing" -eq 0 ]]; then
  pass "All frontend API calls have matching backend routes"
fi

# ── Summary ──────────────────────────────────────────────────────────
echo ""
echo "========================================="
if [[ $ISSUES -eq 0 ]]; then
  echo -e "  ${GREEN}CLEAN: No data flow issues found.${NC}"
  exit 0
else
  echo -e "  ${RED}$ISSUES data flow issues found.${NC}"
  echo "  These are logic bugs, not copy bugs. Each one means"
  echo "  a customer could see wrong data."
  exit 1
fi
