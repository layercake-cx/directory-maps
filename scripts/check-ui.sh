#!/usr/bin/env bash
# UI system checks for the Discover UI rollout (docs/design/discover-ui/BUILD_BRIEF.md §9).
#
# Run from anywhere:  scripts/check-ui.sh      (or: npm run check:ui)
# Exit code 1 if any "must be zero" check finds something; the two "report" checks only print numbers.
#
# Scope: src/pages/admin, src/pages/client and src/components, minus the files the brief marks out of scope
# (published/public maps, pricing, auth, marketing, claim pages, and previews of a client's own site, which
# render in the client's theme and must not use the admin kit). If you add a new out-of-scope file, add it to
# EXCLUDES below with a reason.

set -u
cd "$(dirname "$0")/.."

PATHS=(src/pages/admin src/pages/client src/components)
EXCLUDES=(
  --exclude-dir=claim              # claim pages render in the client's own brand
  --exclude=PublishedMapView.jsx   # public map
  --exclude=DirectoryMap.jsx       # public/embedded map
  --exclude=PricingPlans.jsx       # marketing
  --exclude=SiteHeader.jsx         # marketing
  --exclude=SiteFooter.jsx         # marketing
  --exclude=AuthForm.jsx           # auth pages
  --exclude=SitePreview.jsx        # previews a client's site in their theme
  --exclude=MapMessageDrawer.jsx   # the map preview's own message drawer: mirrors the public map's markup (global .btn)
  --exclude=EntryPreviewBlock.jsx  # previews a client's site in their theme
  --exclude=EntryCardPreview.jsx   # previews a client's site in their theme
  --exclude=ErrorBoundary.jsx      # renders before the shell exists
)

fail=0
ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; fail=1; }

# must_be_zero <label> <grep -E pattern> [extra grep args...]
must_be_zero() {
  local label="$1" pattern="$2"; shift 2
  local hits
  hits=$(grep -rEn "$pattern" "$@" "${PATHS[@]}" "${EXCLUDES[@]}" 2>/dev/null)
  if [ -z "$hits" ]; then ok "$label"; else bad "$label"; printf '%s\n' "$hits" | head -20 | sed 's/^/          /'; fi
}

echo "Discover UI checks"

must_be_zero "legacy buttons (.btn, .btn-primary, .btn-sm, .btn-danger, .xp-btn)" \
  'className="([^"]* )?(btn|btn-primary|btn-sm|btn-danger|xp-btn)( [^"]*)?"' --include='*.jsx'

must_be_zero "legacy containers and tables (admin-card, panel-section, admin-table, xp-card)" \
  'admin-card|panel-section|admin-table|xp-card' --include='*.jsx'

must_be_zero "xp-* classes" '\bxp-[a-z]' --include='*.jsx' --include='*.js'

# Mantine: only src/components/ui/ (and main.jsx's provider) may import it.
mantine=$(grep -rln '@mantine/core' src 2>/dev/null | grep -v '^src/components/ui/' | grep -v '^src/main.jsx$')
if [ -z "$mantine" ]; then ok "no @mantine/core imports outside src/components/ui/"; else bad "@mantine/core imported outside src/components/ui/"; printf '%s\n' "$mantine" | sed 's/^/          /'; fi

# Native dialogs. The kit's useConfirm falls back to window.confirm outside a provider, so ui/ is exempt.
dialogs=$(grep -rEn 'window\.(confirm|alert)\(|(^|[^.A-Za-z_])(confirm|alert)\(' --include='*.jsx' --include='*.js' "${PATHS[@]}" "${EXCLUDES[@]}" 2>/dev/null | grep -v '^src/components/ui/' | grep -v 'await confirm(')
if [ -z "$dialogs" ]; then ok "no window.confirm / alert (use useConfirm / Dialog)"; else bad "native dialogs (use useConfirm / Dialog)"; printf '%s\n' "$dialogs" | head -20 | sed 's/^/          /'; fi

# Emoji used as UI. -P is not available in every grep (macOS), so skip quietly if it isn't.
emoji=$(grep -rnP '[\x{2300}-\x{23FF}\x{2600}-\x{27BF}\x{1F300}-\x{1FAFF}]' --include='*.jsx' "${PATHS[@]}" "${EXCLUDES[@]}" 2>/dev/null)
if [ -z "$emoji" ]; then ok "no emoji in UI"; else bad "emoji in UI"; printf '%s\n' "$emoji" | head -20 | sed 's/^/          /'; fi

# Report-only numbers.
inline=$(grep -rEo 'style=\{\{' --include='*.jsx' "${PATHS[@]}" "${EXCLUDES[@]}" 2>/dev/null | wc -l | tr -d ' ')
hex=$(grep -rEn '#[0-9a-fA-F]{3,6}\b' --include='*.jsx' "${PATHS[@]}" "${EXCLUDES[@]}" 2>/dev/null | wc -l | tr -d ' ')
echo "  info  inline styles in scope: $inline (target: under 150, all dynamic)"
echo "  info  hex colours in JSX lines: $hex (only user-data colours: swatches, themes, defaults, brand logo fills)"
if [ "$inline" -ge 150 ]; then bad "inline styles in scope should be under 150 (found $inline)"; fi

if [ "$fail" -eq 0 ]; then echo "All UI checks passed."; else echo "UI checks failed."; fi
exit "$fail"
