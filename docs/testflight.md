# iPad and Mac builds (TestFlight)

Vantage runs on an iPad, and on a Mac with Apple silicon as the iPad app. The Mac is what the [Stream Deck keys](../plugins/vantage-deck/README.md) need, and a Mac's keyboard gives the [keyboard shortcuts](../apps/vantage/README.md#keyboard-shortcuts). Both get the app from TestFlight. It needs the paid Apple Developer account that FirstPass HQ already uses.

The store id is `au.pivt.firstpass.vantage` (`apps/vantage/app.json`). On an iPad the app asks to fill the screen and stay in landscape (`ios.requireFullScreen`). Expo's SDK 58 notes say iOS 27 no longer lets an app refuse resizing, so on an iPad with iOS 27 the window may still turn or resize; check this on the first build.

## One-time setup

Do these once per app. Apple asks questions that GitHub can't answer, so the first build starts from a computer.

1. **First build, from your computer.** In a clone of this repository:

   ```bash
   corepack enable && pnpm install
   cd apps/vantage
   npx eas-cli@latest build --platform ios --profile production --auto-submit
   ```

   Sign in with your Apple ID when asked and let EAS make the certificates. EAS creates the app in App Store Connect, turns on Sign in with Apple for the store id, and saves an App Store Connect API key so later builds can go to TestFlight without you.
2. **Put the app's number in `eas.json`.** App Store Connect shows it under **App Information → Apple ID** (digits only). It goes in `apps/vantage/eas.json`:

   ```json
   "submit": { "production": { "ios": { "ascAppId": "1234567890" } } }
   ```

   The workflow refuses to send an iOS build to TestFlight until it is there.
3. **Let the club accept this app's Apple sign-ins.** In each club's Supabase project (test and live), under **Authentication → Providers → Apple → Client IDs**, add `au.pivt.firstpass.vantage` after the ones already there, separated by commas. Without it, Sign in with Apple in Vantage fails with "Unacceptable audience in id_token". Google sign-in needs nothing new.
4. **Add testers.** In App Store Connect under **TestFlight**. People in your Apple team can test straight away; anyone else needs Apple's short beta review first.

## Every build after that

**Actions → EAS build → Run workflow**: app `vantage`, platform `ios`, profile `production`, *Send to testers* ticked. Apple processes the build for a few minutes before it shows in TestFlight.

## On a Mac

Install **TestFlight** from the Mac App Store, sign in with a tester's Apple ID and install FirstPass Vantage. It appears because iPad apps are offered to Apple silicon Macs unless that is turned off in App Store Connect (**Pricing and Availability → iPhone and iPad Apps on Apple Silicon Macs**).

## Vision

Coaches use Vision in a browser, so it has no TestFlight build today. The same steps work for it with `apps/vision` and the store id `au.pivt.firstpass.vision`, which then also goes on the clubs' Apple Client IDs list.
