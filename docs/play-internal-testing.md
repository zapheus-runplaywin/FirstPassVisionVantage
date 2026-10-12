# Google Play internal testing

Test tablets install Vantage (and later Vision) from the Play Store through Play's internal testing track. Testers get updates like any other app, with no "unknown source" warnings, and the app is registered with Google for Android's developer verification.

## One-time setup

Do these steps once per app. They need the Play Console and Google Cloud, so a person has to do them.

1. **Create the app in Play Console.** Choose *Create app*, name it "FirstPass Vantage", choose *App* and *Free*.
2. **Build the first app bundle.** In GitHub, go to **Actions → EAS build → Run workflow** and choose app `vantage`, platform `android`, profile `production`, with *Send to Google Play* left unticked. Download the `.aab` file from the build page on expo.dev when the build finishes.
3. **Upload it by hand.** Google only accepts automatic uploads after the first one. In Play Console go to **Testing → Internal testing**:
    1. Under **Testers**, create an email list of the testers' Google accounts.
    2. Choose **Create new release** and upload the `.aab`.
    3. Choose **Save**, then **Review release**, then **Start rollout to Internal testing**.

   This step also locks the app's package name.
4. **Let EAS upload future builds.**
    1. In Google Cloud Console, create a service account in any project and make a JSON key for it.
    2. Enable the *Google Play Android Developer API* in that project.
    3. In Play Console, go to **Users and permissions**, invite the service account's email address, and give it the *Release apps to testing tracks* permission for the app.
    4. On expo.dev, open the project's **Credentials → Android**. Under *Google Service Account Key for submissions*, upload the JSON key.
5. **Send testers the link.** It is under **Testing → Internal testing → Testers → Copy link**. Each tester opens it once on the tablet and accepts.

## Every build after that

Run **Actions → EAS build** with profile `production`, platform `android`, and *Send to Google Play* ticked. EAS builds the app, raises the version code and uploads the bundle to internal testing as a draft release. In Play Console, open the draft under **Testing → Internal testing** and choose **Start rollout**. Testers then get the update from the Play Store.

Releases are uploaded as drafts because Google rejects finished releases from an app that has never been published. Once the app has a published release, `releaseStatus` in `apps/<app>/eas.json` can change to `completed` to skip the rollout click.
