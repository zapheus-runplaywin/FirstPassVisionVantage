#!/usr/bin/env bash
# Copy the public pages' words from the FirstPass HQ repo into apps/site.
#
# The words are written once, in HQ's docs/store/public-pages/, next to the
# store answers they must agree with. This copies them verbatim, records the
# HQ commit they came from, and builds the site to check they still render.
#
#   scripts/sync-public-pages.sh [path to a FirstPassHQ checkout]
#
# The checkout defaults to ../FirstPassHQ next to this repo.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
hq="${1:-$repo_root/../FirstPassHQ}"
src="$hq/docs/store/public-pages"
dest="$repo_root/apps/site/content"
pages=(privacy.md support.md delete-account.md)

if [[ ! -d "$src" ]]; then
  echo "No $src. Pass the path to a FirstPassHQ checkout that has docs/store/public-pages/." >&2
  exit 1
fi
for page in "${pages[@]}"; do
  if [[ ! -f "$src/$page" ]]; then
    echo "Missing $src/$page" >&2
    exit 1
  fi
done

for page in "${pages[@]}"; do
  cp "$src/$page" "$dest/$page"
done

commit="$(git -C "$hq" rev-parse --short HEAD 2>/dev/null || echo unknown)"
dirty=""
if ! git -C "$hq" diff --quiet -- docs/store/public-pages 2>/dev/null; then
  dirty=" (with uncommitted changes)"
fi
cat > "$dest/SOURCE.md" <<SRC
Copied from FirstPassHQ \`docs/store/public-pages/\` at commit \`$commit\`$dirty by \`scripts/sync-public-pages.sh\`. Change the words there, then run the script again.
SRC

(cd "$repo_root/apps/site" && pnpm --silent build:publish)
echo "Copied ${pages[*]} from HQ $commit$dirty."
