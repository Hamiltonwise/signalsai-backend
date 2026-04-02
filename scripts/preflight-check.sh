#!/bin/bash
#
# Alloro Pre-Flight Check
#
# Run this before ANY commit, push, or "keep moving" declaration.
# Catches vocabulary violations, category errors, human-support language,
# em-dashes, and other standing rule violations automatically.
#
# Usage: bash scripts/preflight-check.sh
# Exit code 0 = clean, 1 = violations found
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VIOLATIONS=0
WARNINGS=0

echo "========================================="
echo "  ALLORO PRE-FLIGHT CHECK"
echo "========================================="
echo ""

# ─── CHECK 1: Category Language ───────────────────────────────────
echo "CHECK 1: Category Language (Business Clarity, not Business Intelligence)"
HITS=$(grep -rn "Business Intelligence" frontend/src/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v ".d.ts" | grep -v "//" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
    echo -e "  ${RED}FAIL${NC}: $HITS instances of 'Business Intelligence' found"
    grep -rn "Business Intelligence" frontend/src/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v ".d.ts" | grep -v "//"
    VIOLATIONS=$((VIOLATIONS + HITS))
else
    echo -e "  ${GREEN}PASS${NC}: No 'Business Intelligence' found"
fi
echo ""

# ─── CHECK 2: Practice in Pre-Login Surfaces ─────────────────────
echo "CHECK 2: 'Practice' in pre-login/universal surfaces"
HITS=$(grep -rn '"[Pp]ractice"' frontend/src/pages/marketing/ frontend/src/pages/checkup/ frontend/src/components/onboarding/ frontend/src/pages/BusinessClarity.tsx frontend/src/pages/ThankYou.tsx --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v "//" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
    echo -e "  ${YELLOW}WARN${NC}: $HITS instances of 'Practice' in pre-login surfaces"
    grep -rn '"[Pp]ractice"' frontend/src/pages/marketing/ frontend/src/pages/checkup/ frontend/src/components/onboarding/ --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v "//"
    WARNINGS=$((WARNINGS + HITS))
else
    echo -e "  ${GREEN}PASS${NC}: No 'Practice' in pre-login surfaces"
fi
echo ""

# ─── CHECK 3: Human Support Language ─────────────────────────────
echo "CHECK 3: Human support language (our team, let us know, contact us, we'll get back)"
# Exclude "your team" (refers to customer's team, not Alloro's team)
HITS=$(grep -rn "our team\|let us know\|contact us\|we'll get back\|reach out to help\|support team\|we can help" frontend/src/ --include="*.tsx" --include="*.ts" -i 2>/dev/null | grep -v node_modules | grep -v ".d.ts" | grep -v "//" | grep -v "admin/" | grep -v "your team" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
    echo -e "  ${RED}FAIL${NC}: $HITS instances of human support language in client-facing code"
    grep -rn "our team\|let us know\|contact us\|we'll get back\|reach out to help\|support team\|we can help" frontend/src/ --include="*.tsx" --include="*.ts" -i 2>/dev/null | grep -v node_modules | grep -v ".d.ts" | grep -v "//" | grep -v "admin/"
    VIOLATIONS=$((VIOLATIONS + HITS))
else
    echo -e "  ${GREEN}PASS${NC}: No human support language in client-facing code"
fi
echo ""

# ─── CHECK 4: Em-Dashes in Customer-Facing Strings ───────────────
echo "CHECK 4: Em-dashes in customer-facing strings"
HITS=$(grep -rn '—' frontend/src/pages/ frontend/src/components/ --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v admin/ | grep -v "//" | grep -v "*.d.ts" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
    echo -e "  ${YELLOW}WARN${NC}: $HITS em-dashes found in frontend (some may be in admin)"
    WARNINGS=$((WARNINGS + HITS))
else
    echo -e "  ${GREEN}PASS${NC}: No em-dashes in customer-facing code"
fi
echo ""

# ─── CHECK 5: PatientPath in Customer-Facing Strings ─────────────
echo "CHECK 5: 'PatientPath' in customer-visible strings"
# Exclude: component names, type definitions, imports, comments, filenames in routes, admin pages
HITS=$(grep -rn "PatientPath" frontend/src/ --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v ".d.ts" | grep -v "import\|export\|type \|interface\|//\|PatientPathPreview\|PatientPathWebsite\|PatientPathBreadcrumb\|PatientPathStatus\|patientpath\|patientPath\|Route:\|route:" | grep -v "admin/" | grep -v "\.tsx:[0-9]*: \*" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
    echo -e "  ${RED}FAIL${NC}: $HITS instances of 'PatientPath' brand name in client-facing code"
    grep -rn "PatientPath" frontend/src/ --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v ".d.ts" | grep -v "import\|export\|type \|interface\|//\|PatientPathPreview\|PatientPathWebsite\|patientpath\|patientPath" | grep -v "admin/"
    VIOLATIONS=$((VIOLATIONS + HITS))
else
    echo -e "  ${GREEN}PASS${NC}: No 'PatientPath' in client-facing strings"
fi
echo ""

# ─── CHECK 6: Practice Health Score (should be Business Clarity Score) ─
echo "CHECK 6: 'Practice Health Score' (should be 'Business Clarity Score')"
# Exclude migration files (historical, don't re-run) and comments
HITS=$(grep -rn "Practice Health Score" frontend/src/ src/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v ".d.ts" | grep -v "//" | grep -v "migrations/" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
    echo -e "  ${RED}FAIL${NC}: $HITS instances of 'Practice Health Score'"
    grep -rn "Practice Health Score" frontend/src/ src/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v ".d.ts" | grep -v "//"
    VIOLATIONS=$((VIOLATIONS + HITS))
else
    echo -e "  ${GREEN}PASS${NC}: No 'Practice Health Score' found"
fi
echo ""

# ─── CHECK 7: Hardcoded model strings in agent files ─────────────
echo "CHECK 7: Hardcoded model strings in agent frontmatter"
HITS=$(grep -rn "^model:" .claude/agents/ --include="*.md" 2>/dev/null | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
    echo -e "  ${RED}FAIL${NC}: $HITS agent files have hardcoded model strings (should use global default)"
    grep -rn "^model:" .claude/agents/ --include="*.md" 2>/dev/null
    VIOLATIONS=$((VIOLATIONS + HITS))
else
    echo -e "  ${GREEN}PASS${NC}: No hardcoded model strings in agent files"
fi
echo ""

# ─── CHECK 8: TypeScript ─────────────────────────────────────────
echo "CHECK 8a: Backend TypeScript compilation"
if npx tsc --noEmit 2>/dev/null; then
    echo -e "  ${GREEN}PASS${NC}: Backend zero TypeScript errors"
else
    echo -e "  ${RED}FAIL${NC}: Backend TypeScript errors found"
    npx tsc --noEmit 2>&1 | head -10
    VIOLATIONS=$((VIOLATIONS + 1))
fi

echo "CHECK 8b: Frontend TypeScript + Vite build"
if cd frontend && npx tsc -b --force 2>/dev/null && npm run build 2>/dev/null 1>/dev/null; then
    echo -e "  ${GREEN}PASS${NC}: Frontend build clean"
    cd ..
else
    echo -e "  ${RED}FAIL${NC}: Frontend build failed"
    cd frontend && npm run build 2>&1 | grep -i "error" | head -10
    cd ..
    VIOLATIONS=$((VIOLATIONS + 1))
fi
echo ""

# ─── CHECK 9: Vocabulary Hook Coverage ───────────────────────────
echo "CHECK 9: VocabularyProvider in App.tsx"
if grep -q "VocabularyProvider" frontend/src/App.tsx 2>/dev/null; then
    echo -e "  ${GREEN}PASS${NC}: VocabularyProvider is wired in App.tsx"
else
    echo -e "  ${RED}FAIL${NC}: VocabularyProvider missing from App.tsx"
    VIOLATIONS=$((VIOLATIONS + 1))
fi
echo ""

# ─── CHECK 10: dangerously-skip-permissions ──────────────────────
echo "CHECK 10: No dangerously-skip-permissions references (excluding rule files that reference it to prohibit it)"
HITS=$(grep -rn "dangerously-skip-permissions\|dangerouslySkipPermissions" . --include="*.ts" --include="*.tsx" --include="*.json" 2>/dev/null | grep -v node_modules | grep -v ".git/" | grep -v ".claude/rules" | grep -v "CLAUDE.md" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
    echo -e "  ${RED}FAIL${NC}: $HITS references to skip-permissions"
    VIOLATIONS=$((VIOLATIONS + HITS))
else
    echo -e "  ${GREEN}PASS${NC}: No skip-permissions references"
fi
echo ""

# ─── CHECK 11: Single-Source Data Enforcement ────────────────────
echo "CHECK 11: No ORG_MONTHLY_RATE definitions outside businessMetrics.ts"
HITS=$(grep -rn "ORG_MONTHLY_RATE" src/ frontend/src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v "businessMetrics.ts" | grep -v "import " | grep -v "export " | grep -v "// " | grep "Record<number" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
    echo -e "  ${RED}FAIL${NC}: $HITS duplicate ORG_MONTHLY_RATE definitions found"
    grep -rn "ORG_MONTHLY_RATE" src/ frontend/src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v "businessMetrics.ts" | grep -v "import " | grep -v "export " | grep "Record<number"
    VIOLATIONS=$((VIOLATIONS + HITS))
else
    echo -e "  ${GREEN}PASS${NC}: ORG_MONTHLY_RATE only in businessMetrics.ts"
fi
echo ""

echo "CHECK 12: No REVIEW_VOLUME_BENCHMARKS definitions outside businessMetrics.ts"
HITS=$(grep -rn "REVIEW_VOLUME_BENCHMARKS" src/ frontend/src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v "businessMetrics.ts" | grep -v "import " | grep -v "export " | grep -v "// " | grep "Record<string" | grep -v "constants/businessMetrics" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
    echo -e "  ${RED}FAIL${NC}: $HITS duplicate REVIEW_VOLUME_BENCHMARKS definitions found"
    VIOLATIONS=$((VIOLATIONS + HITS))
else
    echo -e "  ${GREEN}PASS${NC}: REVIEW_VOLUME_BENCHMARKS only in businessMetrics.ts"
fi
echo ""

# ─── SUMMARY ─────────────────────────────────────────────────────
echo "========================================="
if [ "$VIOLATIONS" -gt 0 ]; then
    echo -e "  ${RED}FAILED${NC}: $VIOLATIONS violations, $WARNINGS warnings"
    echo "  Fix violations before proceeding."
    echo "========================================="
    exit 1
elif [ "$WARNINGS" -gt 0 ]; then
    echo -e "  ${YELLOW}PASSED WITH WARNINGS${NC}: $WARNINGS warnings"
    echo "  Review warnings. Proceed with caution."
    echo "========================================="
    exit 0
else
    echo -e "  ${GREEN}ALL CLEAR${NC}: 0 violations, 0 warnings"
    echo "  Cleared hot."
    echo "========================================="
    exit 0
fi
