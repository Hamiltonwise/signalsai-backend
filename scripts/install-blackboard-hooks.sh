#!/bin/sh
# Install per-clone git hooks for the Notion Blackboard state transition layer.
# Run this once after cloning. Hooks live in .git/hooks/ which is not tracked.

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)
HOOKS_DIR="$REPO_ROOT/.git/hooks"

mkdir -p "$HOOKS_DIR"

# ---------- post-commit ----------
POST_COMMIT="$HOOKS_DIR/post-commit"
cat > "$POST_COMMIT" <<'EOF'
#!/bin/sh
# Blackboard post-commit hook
# Scans the just-created commit message for Card-NN references and triggers
# transitionCard("Dave In Progress"). Best-effort -- never blocks anything.

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$BRANCH" != "sandbox" ]; then
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
SHA=$(git rev-parse HEAD)
MSG_FILE=$(mktemp)
git log -1 --format=%B "$SHA" > "$MSG_FILE" 2>/dev/null || echo "" > "$MSG_FILE"

# Run the transition script in the background so it never delays a commit.
# The script itself exits 0 even on failure.
(
  cd "$REPO_ROOT"
  npx tsx scripts/blackboard-card-ref-transition.ts \
    --commit-sha="$SHA" \
    --commit-message-file="$MSG_FILE" \
    --to-state="Dave In Progress" \
    --actor=GitHook \
    --branch="$BRANCH" \
    >> "$REPO_ROOT/.git/blackboard-post-commit.log" 2>&1
  rm -f "$MSG_FILE"
) &
exit 0
EOF
chmod +x "$POST_COMMIT"

echo "Installed: $POST_COMMIT"
echo ""
echo "Fallback if hooks don't fire:"
echo "  - CI workflow .github/workflows/blackboard-main-merge.yml runs on main pushes."
echo "  - npx tsx scripts/blackboard-card-ref-transition.ts ... can be run manually."
