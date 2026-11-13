# FirstPass

Live netball stats. **FirstPass Vantage** is the statistician's tablet app for entering stats during a game; **FirstPass Vision** is the coach's live view on phone, tablet or web.

## Layout

| Path | What it is |
| --- | --- |
| `apps/vantage` | Expo tablet app for the statistician (Android first, then iPad), landscape |
| `apps/vision` | Expo app for coaches: phone, tablet and web, portrait and landscape |
| `packages/engine` | Pure stats engine shared by both apps: fold events into game state |
| `packages/schema` | Event model shared by the apps and the database |
| `packages/ui` | Brand colours and shared UI |
| `packages/playhq` | PlayHQ client and one fixture/line-up model, shared with Studio (published to GitHub Packages) |
| `supabase` | Database migrations and Edge Functions (from Phase 3) |

`apps/hq` (admin web app) and `packages/config` (Net Points values, thresholds) arrive in later phases.

## Getting started

Needs Node 22 and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm check            # typecheck and test everything
pnpm vantage          # start the Vantage dev server
pnpm vision           # start the Vision dev server (press w for web)
```

Add an Expo package to an app with `pnpm --filter @firstpass/vantage exec expo install <package>` so its version matches the Expo SDK.

## Shared packages for Studio

Packages that other FirstPass repos use are published to GitHub Packages when a merge to main bumps their version (the **Publish packages** workflow). GitHub Packages names them after the repository owner, so `@firstpass/playhq` is published as `@zapheus-runplaywin/playhq` and Studio installs it with an npm alias. See [packages/playhq/README.md](packages/playhq/README.md) and `scripts/publish-packages.mjs`. Vantage and Vision always use the packages from source through the workspace.

## Test builds

Builds run on Expo Application Services (EAS). `preview` makes an Android APK that installs directly on a tablet.

From GitHub: **Actions → EAS build → Run workflow**, pick the app, platform and profile. The run summary links to the build on expo.dev, where the APK downloads when it finishes. It needs the repository secret `EXPO_TOKEN` (an Expo access token).

For the test tablets, builds go to Google Play internal testing instead: see [docs/play-internal-testing.md](docs/play-internal-testing.md).

From a terminal:

```bash
cd apps/vantage
npx eas-cli build --profile preview --platform android
```

## Design documents

- [Build plan](https://claude.ai/code/artifact/16d36552-7dab-4301-8280-ff02ce0f42c5)
- [Architecture](https://claude.ai/code/artifact/dbe32d48-8bae-490b-bfab-aac7d8d27bc8)
- [Vantage UI](https://claude.ai/code/artifact/3549aa2e-b657-4996-a019-a8abe8f8c632)
- [Vision UI](https://claude.ai/code/artifact/a1453da0-971a-4205-966a-3b75187bffea)
- [System design](https://claude.ai/code/artifact/2dc70ba4-1bb4-43a9-a2e2-aa9a59f7bda5)
