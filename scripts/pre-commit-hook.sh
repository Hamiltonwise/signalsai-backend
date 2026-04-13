#!/bin/sh
# ─────────────────────────────────────────────────────────────────────
# ALLORO PRE-COMMIT GATE
#
# Runs the 4 sweep scripts against staged files BEFORE every commit.
# If any script finds errors (exit 1), the commit is blocked.
# Warnings (exit 0 with output) are shown but don't block.
#
# Scripts:
#   1. constitution-check.sh  -- Known compliance (brand, copy, promises)
#   2. vertical-sweep.sh      -- Dental/vertical leakage into generic code
#   3. data-flow-audit.sh     -- Logic bugs (wrong data consumed)
#   4. content-quality-lint.sh -- Placeholders, zero defaults, dollar figures
#
# Override: git commit --no-verify (use only when you know what you're skipping)
#
# Installed: April 13, 2026
# ─────────────────────────────────────────────────────────────────────

# Only run when frontend/src or src/ files are staged
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(tsx|ts)$' | grep -v node_modules || true)
if [ -z "$STAGED" ]; then
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
FAILED=0

echo ""
echo "========================================"
echo " Alloro Pre-Commit Gate"
echo "========================================"

# ── HARD GATES (block on failure) ────────────────────────────────
# These scripts currently pass clean. Any failure is a new regression.

# ── Script 1: Data Flow Audit ────────────────────────────────────
if [ -x "$REPO_ROOT/scripts/data-flow-audit.sh" ]; then
  echo ""
  echo "[1/4] Data flow audit (HARD GATE)..."
  if ! bash "$REPO_ROOT/scripts/data-flow-audit.sh" 2>&1; then
    FAILED=$((FAILED + 1))
  fi
else
  echo "[1/4] data-flow-audit.sh not found -- skipping"
fi

# ── Script 2: Content Quality Lint ───────────────────────────────
if [ -x "$REPO_ROOT/scripts/content-quality-lint.sh" ]; then
  echo ""
  echo "[2/4] Content quality lint (HARD GATE)..."
  if ! bash "$REPO_ROOT/scripts/content-quality-lint.sh" 2>&1; then
    FAILED=$((FAILED + 1))
  fi
else
  echo "[2/4] content-quality-lint.sh not found -- skipping"
fi

# ── ADVISORY GATES (warn, don't block) ──────────────────────────
# These have known pre-existing issues. Promote to HARD once clean.

# ── Script 3: Constitution Check ─────────────────────────────────
if [ -x "$REPO_ROOT/scripts/constitution-check.sh" ]; then
  echo ""
  echo "[3/4] Constitution compliance (ADVISORY)..."
  if ! bash "$REPO_ROOT/scripts/constitution-check.sh" 2>&1; then
    echo "  ^ Known pre-existing failures. Does not block commit."
  fi
else
  echo "[3/4] constitution-check.sh not found -- skipping"
fi

# ── Script 4: Vertical Sweep ────────────────────────────────────
if [ -x "$REPO_ROOT/scripts/vertical-sweep.sh" ]; then
  echo ""
  echo "[4/4] Vertical language sweep (ADVISORY)..."
  if ! bash "$REPO_ROOT/scripts/vertical-sweep.sh" --customer-only 2>&1; then
    echo "  ^ Known pre-existing findings. Does not block commit."
  fi
else
  echo "[4/4] vertical-sweep.sh not found -- skipping"
fi

# ── TypeScript check ─────────────────────────────────────────────
echo ""
echo "[+] TypeScript check..."
if [ -f "$REPO_ROOT/frontend/tsconfig.json" ]; then
  if ! (cd "$REPO_ROOT/frontend" && npx tsc -b --force 2>&1); then
    echo "TypeScript errors found. Fix before committing."
    FAILED=$((FAILED + 1))
  fi
fi

# ── Gate ─────────────────────────────────────────────────────────
echo ""
echo "========================================"
if [ "$FAILED" -gt 0 ]; then
  echo " BLOCKED: $FAILED gate(s) failed."
  echo " Fix the errors above, then commit again."
  echo " Override: git commit --no-verify"
  echo "========================================"
  exit 1
else
  echo " CLEAR: All gates passed."
  echo "========================================"
  exit 0
fi
