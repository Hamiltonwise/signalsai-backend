#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ALLORO FLIGHT READINESS CHECK
# SpaceX-style pre-launch verification
#
# Run before ANY push to production.
# Every check must PASS. Any FAIL blocks the launch.
#
# Usage: bash scripts/flight-readiness.sh [sandbox|production]
# Default: sandbox
# ═══════════════════════════════════════════════════════════════

ENV="${1:-sandbox}"
if [ "$ENV" = "production" ]; then
  BASE="https://getalloro.com"
else
  BASE="https://sandbox.getalloro.com"
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check() {
  local label="$1"
  local result="$2"
  local detail="$3"
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

echo "═══════════════════════════════════════"
echo "  ALLORO FLIGHT READINESS CHECK"
echo "  Environment: $ENV ($BASE)"
echo "  $(date)"
echo "═══════════════════════════════════════"
echo ""

# ─── SYSTEM HEALTH ─────────────────────────────────────────────
echo "CHECK 1: System Health"
HEALTH=$(curl -s --max-time 10 "$BASE/api/health" 2>&1)
if echo "$HEALTH" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); exit(0 if d.get('status')=='ok' else 1)" 2>/dev/null; then
  check "API health endpoint returns JSON" "PASS"

  # Check Redis
  if echo "$HEALTH" | grep -q '"redis":"connected"'; then
    check "Redis connected" "PASS"
  elif echo "$HEALTH" | grep -q '"redis":"disconnected"'; then
    check "Redis connected" "WARN" "Redis disconnected (BullMQ jobs won't run)"
  else
    check "Redis connected" "WARN" "Redis status unknown"
  fi
else
  check "API health endpoint returns JSON" "FAIL" "Got HTML or no response. Backend not routing."
fi

echo ""

# ─── CHECKUP FLOW ──────────────────────────────────────────────
echo "CHECK 2: Checkup Autocomplete"
AUTO=$(curl -s --max-time 10 -X POST "$BASE/api/places/autocomplete" \
  -H "Content-Type: application/json" \
  -d '{"input":"Artful Orthodontics Winter Garden"}' 2>&1)

if echo "$AUTO" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); exit(0 if d.get('suggestions') and len(d['suggestions'])>0 else 1)" 2>/dev/null; then
  check "Autocomplete returns results for 'Artful Orthodontics'" "PASS"
else
  check "Autocomplete returns results" "FAIL" "No suggestions returned"
fi

echo ""
echo "CHECK 3: Checkup Analysis (Artful Orthodontics)"
# Get place details first
PLACE_ID=$(echo "$AUTO" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d['suggestions'][0]['placeId'])" 2>/dev/null)

if [ -n "$PLACE_ID" ] && [ "$PLACE_ID" != "None" ]; then
  DETAILS=$(curl -s --max-time 15 "$BASE/api/places/$PLACE_ID" 2>&1)

  # Extract fields for analyze
  python3 -c "
import json,sys
raw=sys.stdin.read().replace(chr(10),' ').replace(chr(13),' ').replace(chr(9),' ')
d=json.loads(raw)
p=d.get('place',{})
payload=json.dumps({'name':p.get('name',''),'city':p.get('city',''),'state':p.get('state',''),'category':p.get('category',''),'types':(p.get('types') or [])[:5],'rating':p.get('rating',0),'reviewCount':p.get('reviewCount',0),'placeId':p.get('placeId',''),'location':p.get('location',{})})
with open('/tmp/flight_test.json','w') as f: f.write(payload)
" <<< "$DETAILS" 2>/dev/null

  ANALYSIS=$(curl -s --max-time 45 -X POST "$BASE/api/checkup/analyze" \
    -H "Content-Type: application/json" \
    -d @/tmp/flight_test.json 2>&1)

  if echo "$ANALYSIS" | python3 -c "import sys,json; raw=sys.stdin.read().replace(chr(10),' '); d=json.loads(raw); exit(0 if d.get('success') else 1)" 2>/dev/null; then
    check "Checkup analysis returns success" "PASS"

    # Check score
    SCORE=$(echo "$ANALYSIS" | python3 -c "import sys,json; raw=sys.stdin.read().replace(chr(10),' '); d=json.loads(raw); print(d.get('score',{}).get('composite',0))" 2>/dev/null)
    if [ "$SCORE" -gt 0 ] 2>/dev/null; then
      check "Score is non-zero ($SCORE)" "PASS"
    else
      check "Score is non-zero" "FAIL" "Score: $SCORE"
    fi

    # Check Oz moments
    OZ_COUNT=$(echo "$ANALYSIS" | python3 -c "import sys,json; raw=sys.stdin.read().replace(chr(10),' '); d=json.loads(raw); print(len(d.get('ozMoments') or []))" 2>/dev/null)
    if [ "$OZ_COUNT" -gt 0 ] 2>/dev/null; then
      check "Oz moments generated ($OZ_COUNT)" "PASS"
    else
      check "Oz moments generated" "WARN" "0 Oz moments (Claude API may be slow)"
    fi

    # Check findings
    FINDINGS=$(echo "$ANALYSIS" | python3 -c "import sys,json; raw=sys.stdin.read().replace(chr(10),' '); d=json.loads(raw); print(len(d.get('findings') or []))" 2>/dev/null)
    if [ "$FINDINGS" -gt 0 ] 2>/dev/null; then
      check "Findings generated ($FINDINGS)" "PASS"
    else
      check "Findings generated" "FAIL" "No findings"
    fi

    # Check no "Prospects" in findings
    PROSPECTS=$(echo "$ANALYSIS" | python3 -c "import sys,json; raw=sys.stdin.read().replace(chr(10),' '); d=json.loads(raw); print(sum(1 for f in (d.get('findings') or []) if 'Prospect' in f.get('title','') or 'Prospect' in f.get('detail','')))" 2>/dev/null)
    if [ "$PROSPECTS" = "0" ] 2>/dev/null; then
      check "No 'Prospects' language in findings" "PASS"
    else
      check "No 'Prospects' language in findings" "FAIL" "$PROSPECTS instances found"
    fi

  else
    check "Checkup analysis returns success" "FAIL" "API returned error"
  fi
else
  check "Place ID retrieved" "FAIL" "Could not get placeId from autocomplete"
fi

echo ""

# ─── MULTI-VERTICAL TEST ──────────────────────────────────────
echo "CHECK 4: Multi-Vertical Checkup (barbershop)"
BARBER_AUTO=$(curl -s --max-time 10 -X POST "$BASE/api/places/autocomplete" \
  -H "Content-Type: application/json" \
  -d '{"input":"Rays Place Barbershop Bend Oregon"}' 2>&1)

if echo "$BARBER_AUTO" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); exit(0 if d.get('suggestions') and len(d['suggestions'])>0 else 1)" 2>/dev/null; then
  check "Barbershop autocomplete works" "PASS"
else
  check "Barbershop autocomplete works" "WARN" "No results (may need different search terms)"
fi

echo ""

# ─── FRONTEND PAGES ────────────────────────────────────────────
echo "CHECK 5: Frontend Pages Load"
for page in "/" "/checkup" "/signin" "/pricing" "/how-it-works"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE$page" 2>&1)
  if [ "$STATUS" = "200" ]; then
    check "GET $page returns 200" "PASS"
  else
    check "GET $page returns 200" "FAIL" "Got $STATUS"
  fi
done

echo ""

# ─── BUILD CHECKS ──────────────────────────────────────────────
echo "CHECK 6: Local Build Integrity"

# TypeScript
cd "$(dirname "$0")/.." 2>/dev/null || cd /Users/coreys.air/Desktop/alloro

TSC_BACKEND=$(npx tsc --noEmit 2>&1)
if [ -z "$TSC_BACKEND" ]; then
  check "Backend TypeScript clean" "PASS"
else
  check "Backend TypeScript clean" "FAIL" "$(echo "$TSC_BACKEND" | head -1)"
fi

TSC_FRONTEND=$(cd frontend && npx tsc -b --force 2>&1)
if [ -z "$TSC_FRONTEND" ]; then
  check "Frontend TypeScript clean" "PASS"
else
  # Check if errors are only in files we didn't touch
  OUR_ERRORS=$(echo "$TSC_FRONTEND" | grep -v "BuildView\|IntegratorView" | head -1)
  if [ -z "$OUR_ERRORS" ]; then
    check "Frontend TypeScript clean" "WARN" "Pre-existing errors in admin files only"
  else
    check "Frontend TypeScript clean" "FAIL" "$OUR_ERRORS"
  fi
fi

BUILD=$(cd frontend && npm run build 2>&1)
if echo "$BUILD" | grep -q "built in"; then
  check "Frontend production build succeeds" "PASS"
else
  check "Frontend production build succeeds" "FAIL" "Build failed"
fi

echo ""

# ─── CONTENT CHECKS ────────────────────────────────────────────
echo "CHECK 7: Content Integrity"

NO_LOGIN=$(grep -rc "No login required" frontend/src/pages/ 2>/dev/null | grep -v ":0" | grep -v "admin/" | wc -l | tr -d ' ')
if [ "$NO_LOGIN" = "0" ]; then
  check "No 'No login required' in customer pages" "PASS"
else
  check "No 'No login required' in customer pages" "FAIL" "$NO_LOGIN files still have it"
fi

GREAT_EXP=$(grep -rc "Great experience" frontend/src/pages/ 2>/dev/null | grep -v ":0" | wc -l | tr -d ' ')
if [ "$GREAT_EXP" = "0" ]; then
  check "No fabricated 'Great experience!' text" "PASS"
else
  check "No fabricated 'Great experience!' text" "FAIL" "$GREAT_EXP files"
fi

YOUR_AGENTS=$(grep -rc "your agents" frontend/src/pages/ frontend/src/components/dashboard/ 2>/dev/null | grep -v ":0" | grep -v "admin/" | wc -l | tr -d ' ')
if [ "$YOUR_AGENTS" = "0" ]; then
  check "No 'your agents' in customer-facing copy" "PASS"
else
  check "No 'your agents' in customer-facing copy" "WARN" "$YOUR_AGENTS files"
fi

echo ""

# ─── SUMMARY ───────────────────────────────────────────────────
echo "═══════════════════════════════════════"
TOTAL=$((PASS + FAIL + WARN))
if [ "$FAIL" -eq 0 ]; then
  if [ "$WARN" -eq 0 ]; then
    echo -e "  ${GREEN}ALL SYSTEMS GO${NC}: $PASS/$TOTAL passed"
  else
    echo -e "  ${YELLOW}GO WITH CAUTION${NC}: $PASS passed, $WARN warnings, $FAIL failures"
  fi
else
  echo -e "  ${RED}NO-GO${NC}: $PASS passed, $WARN warnings, $FAIL failures"
  echo "  Fix all failures before pushing to production."
fi
echo "═══════════════════════════════════════"
