#!/usr/bin/env bash
#
# Constitution Compliance Check -- Layer 2 (Semantic)
# Catches what Layer 1 (grep patterns) misses:
#   - Broken promises (copy referencing features that don't exist)
#   - Vertical-specific terms in generic contexts
#   - Old brand names
#   - Hardcoded URLs that should be environment-aware
#   - Dead feature references
#   - Copy/UX issues that break trust
#
# Layer 1: pattern matches (font-bold, #212D40, em-dashes)
# Layer 2: semantic matches (promises, terminology, URLs, dead refs)
#
# Usage: ./scripts/constitution-check-layer2.sh [--customer-only]
#   --customer-only: skip admin, v1 dashboard, and internal pages
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
FAILURES=0
PASSES=0
WARNINGS=0

CUSTOMER_ONLY=false
if [[ "${1:-}" == "--customer-only" ]]; then
  CUSTOMER_ONLY=true
fi

# ── Customer-reachable page files ────────────────────────────────
# These are the files a customer can see. Admin, v1 dashboard, and
# internal pages are excluded when --customer-only is used.

CHECKUP_FILES=(
  "$FRONTEND/pages/checkup/EntryScreen.tsx"
  "$FRONTEND/pages/checkup/ScanningTheater.tsx"
  "$FRONTEND/pages/checkup/ResultsScreen.tsx"
  "$FRONTEND/pages/checkup/BuildingScreen.tsx"
  "$FRONTEND/pages/checkup/UploadPrompt.tsx"
  "$FRONTEND/pages/checkup/ColleagueShare.tsx"
  "$FRONTEND/pages/checkup/SharedResults.tsx"
  "$FRONTEND/pages/checkup/CheckupLayout.tsx"
  "$FRONTEND/pages/checkup/conferenceFallback.ts"
)

DASHBOARD_V2_FILES=(
  "$FRONTEND/pages/dashboard-v2/HomePage.tsx"
  "$FRONTEND/pages/dashboard-v2/ComparePage.tsx"
  "$FRONTEND/pages/dashboard-v2/ReviewsPage.tsx"
  "$FRONTEND/pages/dashboard-v2/PresencePage.tsx"
  "$FRONTEND/pages/dashboard-v2/ProgressReport.tsx"
  "$FRONTEND/pages/dashboard-v2/HelpPage.tsx"
)

AUTH_ONBOARDING_FILES=(
  "$FRONTEND/pages/Signup.tsx"
  "$FRONTEND/pages/Signin.tsx"
  "$FRONTEND/pages/ForgotPassword.tsx"
  "$FRONTEND/pages/OwnerProfile.tsx"
  "$FRONTEND/pages/NewAccountOnboarding.tsx"
  "$FRONTEND/pages/OnboardingPaymentSuccess.tsx"
  "$FRONTEND/pages/OnboardingPaymentCancelled.tsx"
)

MARKETING_FILES=(
  "$FRONTEND/pages/marketing/HomePage.tsx"
  "$FRONTEND/pages/marketing/ProductPage.tsx"
  "$FRONTEND/pages/marketing/HowItWorks.tsx"
  "$FRONTEND/pages/marketing/WhoItsFor.tsx"
  "$FRONTEND/pages/marketing/RisePage.tsx"
  "$FRONTEND/pages/marketing/AboutPage.tsx"
  "$FRONTEND/pages/marketing/Story.tsx"
  "$FRONTEND/pages/marketing/PricingPage.tsx"
  "$FRONTEND/pages/marketing/Blog.tsx"
)

SHARED_COMPONENTS=(
  "$FRONTEND/components/PMS/PMSUploadModal.tsx"
  "$FRONTEND/components/PMS/PMSUploadWizardModal.tsx"
  "$FRONTEND/components/PMS/PMSVisualPillars.tsx"
  "$FRONTEND/components/PMS/TopReferralSources.tsx"
  "$FRONTEND/components/PMS/ReferralMatrices.tsx"
  "$FRONTEND/components/onboarding-wizard/wizardConfig.ts"
  "$FRONTEND/components/onboarding/OnboardingContainer.tsx"
  "$FRONTEND/components/onboarding/Step0_UserInfo.tsx"
  "$FRONTEND/components/onboarding/Step1_PracticeInfo.tsx"
  "$FRONTEND/components/onboarding/Step2_DomainInfo.tsx"
  "$FRONTEND/components/onboarding/Step3_PlanChooser.tsx"
  "$FRONTEND/components/marketing/MarketingHeader.tsx"
  "$FRONTEND/components/marketing/MarketingFooter.tsx"
  "$FRONTEND/components/dashboard/TrialBanner.tsx"
  "$FRONTEND/components/dashboard/OneActionCard.tsx"
  "$FRONTEND/components/dashboard/CompetitorDrawer.tsx"
)

LEGAL_FILES=(
  "$FRONTEND/pages/legal/TermsOfService.tsx"
  "$FRONTEND/pages/legal/PrivacyPolicy.tsx"
)

# Also check backend files that produce customer-visible output
BACKEND_CUSTOMER_FILES=(
  "$BACKEND/jobs/mondayEmail.ts"
  "$BACKEND/emails/templates/MondayBriefEmail.ts"
  "$BACKEND/emails/templates/WelcomeEmail.ts"
  "$BACKEND/emails/templates/CheckupResultEmail.ts"
  "$BACKEND/emails/templates/base.ts"
  "$BACKEND/routes/checkup.ts"
  "$BACKEND/routes/auth/gbp.ts"
)

pass() {
  echo -e "  ${GREEN}PASS${NC} $1"
  PASSES=$((PASSES + 1))
}

fail() {
  echo -e "  ${RED}FAIL${NC} $1"
  if [ -n "${2:-}" ]; then
    echo -e "       $2"
  fi
  FAILURES=$((FAILURES + 1))
}

warn() {
  echo -e "  ${YELLOW}WARN${NC} $1"
  WARNINGS=$((WARNINGS + 1))
}

section() {
  echo ""
  echo -e "${CYAN}$1${NC}"
}

# Collect target files
ALL_FILES=()
ALL_FILES+=("${CHECKUP_FILES[@]}")
ALL_FILES+=("${DASHBOARD_V2_FILES[@]}")
ALL_FILES+=("${AUTH_ONBOARDING_FILES[@]}")
ALL_FILES+=("${MARKETING_FILES[@]}")
ALL_FILES+=("${SHARED_COMPONENTS[@]}")
ALL_FILES+=("${LEGAL_FILES[@]}")
ALL_FILES+=("${BACKEND_CUSTOMER_FILES[@]}")

# Filter to only existing files
EXISTING_FILES=()
for f in "${ALL_FILES[@]}"; do
  if [ -f "$f" ]; then
    EXISTING_FILES+=("$f")
  fi
done

echo "Constitution Check Layer 2 (Semantic)"
echo "Scanning ${#EXISTING_FILES[@]} customer-reachable files"
echo ""

# ═══════════════════════════════════════════════════════════════════
# CHECK 1: BROKEN PROMISES
# Copy that promises something the backend doesn't deliver
# ═══════════════════════════════════════════════════════════════════
section "Check 1: Broken Promises"

PROMISE_PATTERNS=(
  "we'll notify"
  "we will notify"
  "notify you"
  "we'll email"
  "we will email"
  "we'll text"
  "we'll send you"
  "we will send you"
  "coming soon"
  "in development"
  "launching soon"
  "stay tuned"
  "we'll let you know"
  "we will let you know"
  "be the first to know"
  "get notified"
  "alert you when"
  "remind you when"
)

promise_hits=""
for pattern in "${PROMISE_PATTERNS[@]}"; do
  for f in "${EXISTING_FILES[@]}"; do
    # Skip legal pages (standard legal language) and auth (real features)
    if [[ "$f" == *"TermsOfService"* || "$f" == *"PrivacyPolicy"* || "$f" == *"ForgotPassword"* ]]; then continue; fi
    result=$(grep -in "$pattern" "$f" 2>/dev/null \
      | grep -v "^[[:space:]]*//" \
      | grep -v "^\s*\*" \
      | grep -v "INTERNAL_EMAIL_DOMAINS" \
      || true)
    if [ -n "$result" ]; then
      promise_hits+="$f: $result
"
    fi
  done
done

if [ -z "$promise_hits" ]; then
  pass "No broken promises found"
else
  fail "Broken promises detected (copy promises features that may not exist)"
  echo "$promise_hits" | sort -u | head -20 | while read -r line; do
    echo -e "       $line"
  done
fi

# ═══════════════════════════════════════════════════════════════════
# CHECK 2: DENTAL-SPECIFIC TERMS IN GENERIC CONTEXTS
# Terms that would confuse a non-dental customer
# Excludes vertical-specific landing pages (those SHOULD be dental)
# ═══════════════════════════════════════════════════════════════════
section "Check 2: Dental terms in generic pages"

# These files are ALLOWED to have dental terms (vertical-specific pages, vertical listings)
DENTAL_ALLOWED=(
  "EndodontistMarketing"
  "DentalMarketing"
  "OrthodontistMarketing"
  "PediatricDentistMarketing"
  "GPReferralIntelligence"
  "WhoItsFor"
)

DENTAL_PATTERNS=(
  "patient"
  "dental"
  "dentist"
  "endodont"
  "orthodont"
  "DDS"
  "DMD"
  "periodon"
  "oral surg"
  "hygienist"
  "operatory"
  "chair time"
)

dental_hits=""
for f in "${EXISTING_FILES[@]}"; do
  # Skip dental-specific pages
  skip=false
  for allowed in "${DENTAL_ALLOWED[@]}"; do
    if [[ "$f" == *"$allowed"* ]]; then
      skip=true
      break
    fi
  done
  if $skip; then continue; fi

  for pattern in "${DENTAL_PATTERNS[@]}"; do
    # Search visible strings only. Exclude:
    #   - Code comments (// and * lines -- accounting for grep -n line numbers)
    #   - Import statements and type definitions
    #   - Backend specialty detection code (maps, keyword arrays, regex patterns)
    #   - Vertical listing pages that legitimately name all industries
    #   - Healthcare-context legal language (privacy, HIPAA)
    #   - JS property names from data models (uniquePatients, etc.)
    #   - PMS software names (Open Dental, Dentrix, Eaglesoft)
    #   - Conference fallback constants
    #   - Story/testimonial content
    #   - Template strings with dynamic specialty variables
    result=$(grep -in "$pattern" "$f" 2>/dev/null \
      | grep -v "[[:space:]]*//" \
      | grep -v "[[:space:]]*\* " \
      | grep -v "[[:space:]]*import " \
      | grep -v "interface \|type \|source_type" \
      | grep -v "CATEGORY_MAP\|SPECIALTY_KEYWORDS\|PLACE_TYPE_MAP" \
      | grep -v "specialty:" \
      | grep -v 'keywords:' \
      | grep -v '/i,' \
      | grep -v "dental.*medical.*legal\|dental.*veterinary\|dental, medical" \
      | grep -v "endodontists.*orthodontists\|endodontists.*oral surgeons" \
      | grep -v "Endodontist.*Orthodontist.*General Dentist" \
      | grep -v "patient information\|patient-identifiable\|patient records\|patient data\|No PII" \
      | grep -v "patientTerm\|customerTerm\|uniquePatients\|firstPatientAttribution\|patientpath" \
      | grep -v "opendental\|Open Dental\|Dentrix\|Eaglesoft" \
      | grep -v "CONFERENCE_PLACE\|CONFERENCE_ANALYSIS\|Wasatch\|conf-\|pmsProcessing:" \
      | grep -v "hipaaReport\|console\.\|getMindsQueue\|queue\.add" \
      | grep -v "Valley Endodontics\|valleyendodontics\|artfulorthodontics" \
      | grep -v "practiceSearchString\|displayString\|domain:" \
      | grep -v "She had a new endodontist\|I'm not a dentist" \
      | grep -v "Endodontist, Virginia\|Endodontist, New York\|Endodontist, Texas" \
      | grep -v "oral_surgeon\|pediatric_dentist\|dental_clinic" \
      | grep -v 'broadeningCategory\|${specialty}' \
      | grep -v "\.ts\"" \
      | grep -v 'orthodontist: "\|endodontist: "\|periodontist: "\|dentist: "\|category: "' \
      | grep -v "toLowerCase.*dentist\|\.includes(kw)" \
      | grep -v 'term\.includes\|\.includes("ortho")\|\.includes("endo")\|\.includes("dentist")' \
      | grep -v '"health".*"doctor".*"dentist"\|"dentist".*"doctor"' \
      | grep -v "some((kw)" \
      || true)
    if [ -n "$result" ]; then
      dental_hits+="$f:
$result
"
    fi
  done
done

if [ -z "$dental_hits" ]; then
  pass "No dental-specific terms in generic pages"
else
  fail "Dental-specific terms found in generic pages"
  echo "$dental_hits" | sort -u | head -30 | while read -r line; do
    echo -e "       $line"
  done
fi

# ═══════════════════════════════════════════════════════════════════
# CHECK 3: OLD BRAND NAMES
# ═══════════════════════════════════════════════════════════════════
section "Check 3: Old brand names"

OLD_BRAND_PATTERNS=(
  "Business Clarity Score"
  "SignalsAI"
)

# "Business Clarity" as a marketing concept is a Corey decision.
# Only flag "Business Clarity Score" (K6 violation) and "SignalsAI" (old company).
# PatientPath in backend is an internal pipeline name -- can't rename without breaking infra.

brand_hits=""
for pattern in "${OLD_BRAND_PATTERNS[@]}"; do
  for f in "${EXISTING_FILES[@]}"; do
    result=$(grep -n "$pattern" "$f" 2>/dev/null \
      | grep -v "^[[:space:]]*//" \
      | grep -v "^\s*\*" \
      | grep -v "^[[:space:]]*import " \
      || true)
    if [ -n "$result" ]; then
      brand_hits+="$f: $result
"
    fi
  done
done

if [ -z "$brand_hits" ]; then
  pass "No old brand names found"
else
  fail "Old brand names detected"
  echo "$brand_hits" | sort -u | head -20 | while read -r line; do
    echo -e "       $line"
  done
fi

# ═══════════════════════════════════════════════════════════════════
# CHECK 4: HARDCODED URLS
# URLs that should read from environment
# ═══════════════════════════════════════════════════════════════════
section "Check 4: Hardcoded production URLs"

HARDCODED_URL_PATTERNS=(
  "https://app.getalloro.com"
  "https://sandbox.getalloro.com"
)

url_hits=""
for pattern in "${HARDCODED_URL_PATTERNS[@]}"; do
  for f in "${EXISTING_FILES[@]}"; do
    result=$(grep -n "$pattern" "$f" 2>/dev/null \
      | grep -v "APP_URL\|process\.env\|window\.location" \
      | grep -v "^[[:space:]]*//" \
      | grep -v "^\s*\*" \
      | grep -v '||\|fallback\|Default to\|? "\|: "' \
      | grep -v "schema\.org\|structuredData\|jsonLd" \
      || true)
    if [ -n "$result" ]; then
      url_hits+="$f: $result
"
    fi
  done
done

# Known exception: gbp.ts OAuth callback requires Google Console change (Dave Card 8)
GBP_KNOWN="src/routes/auth/gbp.ts"
url_hits_filtered=$(echo "$url_hits" | grep -v "$GBP_KNOWN" || true)
url_hits_known=$(echo "$url_hits" | grep "$GBP_KNOWN" || true)

if [ -n "$url_hits_known" ]; then
  warn "Known: GBP OAuth callback hardcoded (Dave Card 8 -- requires Google Console)"
fi

if [ -z "$url_hits_filtered" ]; then
  pass "No hardcoded production URLs (outside env fallbacks and known exceptions)"
else
  fail "Hardcoded production URLs found (should read from env)"
  echo "$url_hits_filtered" | sort -u | head -20 | while read -r line; do
    echo -e "       $line"
  done
fi

# ═══════════════════════════════════════════════════════════════════
# CHECK 5: DEAD FEATURE REFERENCES
# Copy referencing features/pages that don't exist in v2
# ═══════════════════════════════════════════════════════════════════
section "Check 5: Dead feature references"

# Only check frontend customer-visible files for dead feature references.
# Backend queue/pipeline names (patientpath-build, gbp_post) are internal infrastructure.
DEAD_REFS=(
  "PatientPath"
  "patient journey"
  "auto-post"
  "SEO content publish"
)

DEAD_REF_FILES=()
DEAD_REF_FILES+=("${CHECKUP_FILES[@]}")
DEAD_REF_FILES+=("${DASHBOARD_V2_FILES[@]}")
DEAD_REF_FILES+=("${AUTH_ONBOARDING_FILES[@]}")
DEAD_REF_FILES+=("${MARKETING_FILES[@]}")
DEAD_REF_FILES+=("${SHARED_COMPONENTS[@]}")

dead_hits=""
for pattern in "${DEAD_REFS[@]}"; do
  for f in "${DEAD_REF_FILES[@]}"; do
    if [ ! -f "$f" ]; then continue; fi
    result=$(grep -in "$pattern" "$f" 2>/dev/null \
      | grep -v "^[[:space:]]*//" \
      | grep -v "^\s*\*" \
      | grep -v "^[[:space:]]*import " \
      | grep -v "NOT BUILT" \
      || true)
    if [ -n "$result" ]; then
      dead_hits+="$f: $result
"
    fi
  done
done

if [ -z "$dead_hits" ]; then
  pass "No dead feature references found"
else
  fail "Dead feature references detected"
  echo "$dead_hits" | sort -u | head -20 | while read -r line; do
    echo -e "       $line"
  done
fi

# ═══════════════════════════════════════════════════════════════════
# CHECK 6: PLACEHOLDER/TEST DATA
# ═══════════════════════════════════════════════════════════════════
section "Check 6: Placeholder or test data"

PLACEHOLDER_PATTERNS=(
  "Lorem"
  "TODO"
  "FIXME"
  "HACK"
  "test@"
  "example\.com"
  "John Doe"
  "Jane Doe"
  "foo@"
  "bar@"
  "123 Main"
  "Acme Corp"
)

placeholder_hits=""
for pattern in "${PLACEHOLDER_PATTERNS[@]}"; do
  for f in "${EXISTING_FILES[@]}"; do
    result=$(grep -in "$pattern" "$f" 2>/dev/null \
      | grep -v "^[[:space:]]*//" \
      | grep -v "^\s*\*" \
      | grep -v "test(" \
      | grep -v "\.test\." \
      | grep -v "\.spec\." \
      | grep -v "e\.g\.\|for example\|valid domain" \
      | grep -v "INTERNAL_EMAIL_DOMAINS\|blocklist\|block list" \
      | grep -v "usually \"123 Main" \
      | grep -v "TODO:" \
      || true)
    if [ -n "$result" ]; then
      placeholder_hits+="$f: $result
"
    fi
  done
done

if [ -z "$placeholder_hits" ]; then
  pass "No placeholder or test data found"
else
  fail "Placeholder or test data detected"
  echo "$placeholder_hits" | sort -u | head -20 | while read -r line; do
    echo -e "       $line"
  done
fi

# ═══════════════════════════════════════════════════════════════════
# CHECK 7: LAYER 1 VIOLATIONS (re-check in customer files only)
# Catches any regressions in the specific files customers see
# ═══════════════════════════════════════════════════════════════════
section "Check 7: Layer 1 regressions in customer files"

l1_hits=""
for f in "${EXISTING_FILES[@]}"; do
  # Skip .ts files (non-JSX) for visual checks
  if [[ "$f" != *.tsx ]]; then continue; fi

  result=$(grep -n 'text-\[#212D40\]\|font-bold\|font-extrabold\|font-black\|text-\[10px\]\|text-\[11px\]' "$f" 2>/dev/null || true)
  if [ -n "$result" ]; then
    l1_hits+="$f:
$result
"
  fi
done

if [ -z "$l1_hits" ]; then
  pass "No Layer 1 regressions"
else
  fail "Layer 1 regressions found in customer files"
  echo "$l1_hits" | head -20 | while read -r line; do
    echo -e "       $line"
  done
fi

# ═══════════════════════════════════════════════════════════════════
# CHECK 8: EMPTY STATE QUALITY
# Empty states must explain what's happening, when to expect data,
# and what to do if it doesn't work (Known 14, design system rules)
# ═══════════════════════════════════════════════════════════════════
section "Check 8: Empty state patterns"

# Just flag files that have "no data" / "nothing here" patterns without helpful context
empty_hits=""
for f in "${DASHBOARD_V2_FILES[@]}"; do
  if [ ! -f "$f" ]; then continue; fi
  result=$(grep -in "no data\|nothing here\|no results\|empty\|no .* yet\|no .* found" "$f" 2>/dev/null \
    | grep -v "^[[:space:]]*//" \
    | grep -v "^\s*\*" \
    || true)
  if [ -n "$result" ]; then
    empty_hits+="$f:
$result
"
  fi
done

if [ -z "$empty_hits" ]; then
  pass "No bare empty states in dashboard v2"
else
  warn "Empty state patterns found -- verify they include what/when/help context"
  echo "$empty_hits" | head -15 | while read -r line; do
    echo -e "       $line"
  done
fi

# ═══════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════

echo ""
echo -e "─────────────────────────────────"
echo -e "  Layer 2 (Semantic)"
echo -e "  ${GREEN}${PASSES} passed${NC}, ${RED}${FAILURES} failed${NC}, ${YELLOW}${WARNINGS} warnings${NC}"
echo -e "─────────────────────────────────"

if [ "$FAILURES" -gt 0 ]; then
  exit 1
else
  echo ""
  echo "Layer 2 check passed."
  exit 0
fi
