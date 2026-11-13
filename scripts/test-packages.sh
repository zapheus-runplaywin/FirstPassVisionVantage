#!/usr/bin/env bash
# Tests @firstpass/schema and @firstpass/engine exactly as npm users get them: builds them, packs them
# the way the publish workflow does (pnpm pack swaps workspace:* for the real version and applies
# publishConfig), installs the tarballs into an empty project, and runs scripts/package-tests there with
# plain Node, through require() and import. Usage: scripts/test-packages.sh [folder to leave the tarballs in]
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
packs=${1:-$(mktemp -d)}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$packs"

for name in schema engine; do
  (cd "$root/packages/$name" && pnpm run build >/dev/null && pnpm pack --pack-destination "$packs" >/dev/null)
done

for tarball in "$packs"/firstpass-*.tgz; do
  listing=$(tar -tzf "$tarball")
  if grep -q '\.ts$' <<<"$(grep -v '\.d\.ts$' <<<"$listing")"; then
    echo "$tarball holds TypeScript source:" >&2; echo "$listing" >&2; exit 1
  fi
  if grep -q 'test' <<<"$listing"; then
    echo "$tarball holds tests:" >&2; echo "$listing" >&2; exit 1
  fi
done

engine_json=$(tar -xzOf "$packs"/firstpass-engine-*.tgz package/package.json)
schema_version=$(node -p "require('$root/packages/schema/package.json').version")
node -e '
  const pkg = JSON.parse(process.argv[1]);
  const want = process.argv[2];
  if (pkg.dependencies["@firstpass/schema"] !== want) throw new Error(`engine depends on schema ${pkg.dependencies["@firstpass/schema"]}, not ${want}`);
  if (pkg.main !== "dist/index.js" || !pkg.exports) throw new Error("publishConfig was not applied");
' "$engine_json" "$schema_version"

cp "$root"/scripts/package-tests/* "$work/"
(cd "$work" && npm init -y >/dev/null && npm install --no-audit --no-fund "$packs"/firstpass-schema-*.tgz "$packs"/firstpass-engine-*.tgz >/dev/null)
(cd "$work" && node --test require.test.cjs import.test.mjs)

# The type files work for a strict TypeScript project using Node's module resolution.
node "$(cd "$root/packages/engine" && node -p "require.resolve('typescript/bin/tsc')")" \
  --strict --noEmit --module node16 --moduleResolution node16 --target es2022 \
  "$work/consumer.ts"
echo "Packed packages pass."
