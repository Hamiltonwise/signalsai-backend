#!/usr/bin/env bash
#
# Vertical Language Sweep
# Finds dental-specific terms in customer-facing code.
# Exit 0 = clean. Exit 1 = dental terms found.
#
# Usage: ./scripts/vertical-sweep.sh [--customer-only]
#   --customer-only: skip admin, legal, content marketing pages
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

CUSTOMER_ONLY=false
if [[ "${1:-}" == "--customer-only" ]]; then
  CUSTOMER_ONLY=true
fi

# Customer-facing paths (what a prospect or paying user sees)
CUSTOMER_PATHS=(
  "$FRONTEND/pages/checkup"
  "$FRONTEND/pages/HomePage.tsx"
  "$FRONTEND/pages/PresencePage.tsx"
  "$FRONTEND/pages/ReferralIntelligencePage.tsx"
  "$FRONTEND/pages/Dashboard.tsx"
  "$FRONTEND/components/onboarding"
  "$FRONTEND/components/onboarding-wizard"
  "$FRONTEND/components/PMS"
  "$FRONTEND/components/dashboard"
  "$FRONTEND/components/SetupProgressWizard"
  "$BACKEND/emails/templates"
  "$BACKEND/services/trialEmailService.ts"
  "$BACKEND/jobs/mondayEmail.ts"
  "$BACKEND/jobs/csPulse.ts"
  "$BACKEND/jobs/winbackEmails.ts"
)

TOTAL=0
CATEGORIES=()

search_term() {
  local label="$1"
  local pattern="$2"
  local count=0

  echo ""
  echo -e "${CYAN}--- $label ---${NC}"

  if $CUSTOMER_ONLY; then
    for p in "${CUSTOMER_PATHS[@]}"; do
      if [[ -e "$p" ]]; then
        local hits
        if [[ -d "$p" ]]; then
          hits=$(grep -rn "$pattern" "$p" --include="*.tsx" --include="*.ts" 2>/dev/null \
            | grep -v "node_modules\|\.test\.\|// \|/\*\|import \|interface \|type \|export type\|console\.\|practiceName\|practiceRanking\|PatientPath" || true)
        else
          hits=$(grep -n "$pattern" "$p" 2>/dev/null \
            | grep -v "// \|/\*\|import \|interface \|type \|export type\|console\.\|practiceName\|practiceRanking\|PatientPath" || true)
        fi
        if [[ -n "$hits" ]]; then
          echo "$hits" | while IFS= read -r line; do
            # Trim to relative path
            local rel="${line#$REPO_ROOT/}"
            echo -e "  ${RED}HIT${NC} $rel"
          done
          local c
          c=$(echo "$hits" | wc -l | tr -d ' ')
          count=$((count + c))
        fi
      fi
    done
  else
    local hits
    hits=$(grep -rn "$pattern" "$FRONTEND" "$BACKEND" --include="*.tsx" --include="*.ts" 2>/dev/null \
      | grep -v "node_modules\|\.test\.\|// \|/\*\|import \|interface \|type \|export type\|console\.\|practiceName\|practiceRanking\|PatientPath\|/admin/\|/legal/" || true)
    if [[ -n "$hits" ]]; then
      echo "$hits" | while IFS= read -r line; do
        local rel="${line#$REPO_ROOT/}"
        echo -e "  ${RED}HIT${NC} $rel"
      done
      local c
      c=$(echo "$hits" | wc -l | tr -d ' ')
      count=$((count + c))
    fi
  fi

  if [[ $count -eq 0 ]]; then
    echo -e "  ${GREEN}CLEAN${NC}"
  else
    echo -e "  ${YELLOW}$count hits${NC}"
  fi
  TOTAL=$((TOTAL + count))
}

echo "Vertical Language Sweep"
if $CUSTOMER_ONLY; then
  echo "Mode: CUSTOMER-FACING ONLY"
else
  echo "Mode: FULL CODEBASE (excluding admin, legal)"
fi
echo ""

search_term "patient/patients (should be customer)" 'patient'
search_term "practice (as business term)" '"practice\|your practice\|the practice\|Practice Hub\|practice management'
search_term "PMS (user-facing)" 'PMS'
search_term "doctor referral / referring doctor" 'doctor referral\|referring doctor\|Dr\. \|Doctor Smith'
search_term "production (as revenue)" 'production report\|production value\|docProduction\|mktProduction'
search_term "case/cases (as clinical term)" '"case"\|"cases"\| case[s]\? '

echo ""
echo "========================================="
if [[ $TOTAL -eq 0 ]]; then
  echo -e "  ${GREEN}CLEAN: No dental-specific terms found.${NC}"
  exit 0
else
  echo -e "  ${RED}$TOTAL dental-specific terms found.${NC}"
  echo "  Wire useVocab() or replace with universal defaults."
  exit 1
fi
