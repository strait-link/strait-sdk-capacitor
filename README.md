<!-- Header: the same in every Strait SDK README (design system v5). -->
<p align="center">
  <a href="https://straitlink.in">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/strait-lockup-dark.svg">
      <img src=".github/assets/strait-lockup.svg" alt="Strait" width="160" height="53">
    </picture>
  </a>
</p>

<h1 align="center">Strait SDK for Capacitor and Ionic</h1>

<p align="center"><strong>Straight to the screen. On the record.</strong><br>
A tap opens the exact screen, and every link open and install is recorded in your Strait dashboard.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@straitlink/capacitor"><img alt="npm" src="https://img.shields.io/npm/v/@straitlink/capacitor?style=flat-square&labelColor=0F0D0A&color=423B33"></a>
  <a href="https://straitlink.in/platform-status/"><img alt="SDK: New" src="https://img.shields.io/badge/SDK-new-423B33?style=flat-square&labelColor=0F0D0A"></a>
  <a href="https://github.com/strait-link/strait-sdk-capacitor/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/strait-link/strait-sdk-capacitor/ci.yml?branch=main&label=CI&style=flat-square&labelColor=0F0D0A"></a>
  <a href="LICENSE"><img alt="Licence: MIT" src="https://img.shields.io/badge/licence-MIT-423B33?style=flat-square&labelColor=0F0D0A"></a>
</p>

<p align="center">
  <a href="https://straitlink.in/docs/sdks/capacitor/">Docs</a> ·
  <a href="https://straitlink.in/platform-status/">Platform status</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="#docs-and-support">Talk to the Strait team</a>
</p>

`@straitlink/capacitor` gives a Capacitor 8 app (Ionic, Vue, React, Angular or plain JS) direct
links (App Links, Universal Links, custom schemes), deferred links that survive the install, and
link-open analytics. It wraps the Strait [Android](https://github.com/strait-link/strait-sdk-android)
and [iOS](https://github.com/strait-link/strait-sdk-swift) SDKs, and its API matches
[`@straitlink/react-native`](https://github.com/strait-link/strait-sdk-react-native).

## Quick start (60 seconds)

You need: a Capacitor 8 app with `android/` and/or `ios/` added, and from
**Dashboard → Get started** your publishable key (`st_pub_live_…`) and link domain
(`https://<your-handle>.strait.link`).

**1. Install and sync**

```sh
npm install @straitlink/capacitor
npx cap sync
```

**2. Start it when your app starts** (for example in `main.ts`)

```ts
import { createStrait } from '@straitlink/capacitor';

const strait = createStrait({
  publishableKey: 'st_pub_live_…',            // safe in apps; never the secret key
  endpoint: 'https://<your-handle>.strait.link',
});
strait.onLink((e) => {
  console.log('Strait link:', e.kind, e.route, e.matched, e.path);
  if (e.matched && e.path) router.push({ path: e.path, query: e.params }); // your router
});
strait.start();
```

**3. Let the app claim your link domain**

- Android, `android/app/src/main/AndroidManifest.xml`, inside the main `<activity>`:

  ```xml
  <intent-filter android:autoVerify="true">
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:scheme="https" android:host="<your-handle>.strait.link" />
  </intent-filter>
  ```

- iOS, Xcode → App target → Signing & Capabilities → **+ Associated Domains** →
  `applinks:<your-handle>.strait.link`.
- In **Dashboard → Settings → App**: your Android package name + signing SHA-256, and your
  Apple Team ID + bundle ID. Strait then serves `assetlinks.json` and the
  `apple-app-site-association` file for you.

**You should see:** run the app on a phone or emulator, then open one of your links:

```sh
adb shell am start -a android.intent.action.VIEW -d "https://<your-handle>.strait.link/<code>"
xcrun simctl openurl booted "https://<your-handle>.strait.link/<code>"
```

The app opens on the link's screen and the console prints
`Strait link: direct app_link true /p/42` (your path). The open shows up in the dashboard's
Analytics within a minute. On a fresh install the first launch prints a `deferred` event instead.

## Platform features

| Feature | Status | Notes |
|---|---|---|
| Android: direct links and deferred links | ● Live | Deferred = exact match through the Play Install Referrer (read for you). |
| iPhone links (Universal Links, custom schemes) | ● Live | Through Capacitor's AppDelegate / SceneDelegate proxy: no extra code. |
| iPhone: install matching (deferred links) | Opt-in | Your choice in Dashboard → Settings → iPhone installs, read at runtime. See the [iOS SDK](https://github.com/strait-link/strait-sdk-swift#iphone-you-choose-the-deferred-link-method). |
| iOS with CocoaPods | – Not yet | Swift Package Manager only (the Capacitor 8 default for new apps). |
| Web | – | Every call resolves a safe default; use [`@straitlink/web`](https://www.npmjs.com/package/@straitlink/web) for websites. |
| Published on npm | ● Live | `npm install @straitlink/capacitor` |

● Live · Opt-in: off until you switch it on · – Not yet. The same words as the
[platform status](https://straitlink.in/platform-status/) page.

## API

| Call | What it does |
|---|---|
| `createStrait({ publishableKey, endpoint, linkHosts? })` | One client per app. Throws only for a missing or secret key. `linkHosts` adds custom short-link hosts or old `<x>.page.link` hosts. |
| `start()` | Reads the link that launched the app, listens for new ones, runs the deferred check once per install, sends saved open reports. Call it once, after `onLink`. |
| `onLink(cb)` | Every link event, including ones from before you subscribed. Returns an unsubscribe. |
| `onLinkStart(cb)` | A link just arrived and is being resolved: show a loading state. |
| `checkDeferred()` | Asks for the deferred link again (settings or debug screens). Doesn't add an install. |
| `trackEvent(name, { value, currency, linkId, clickId })` | Conversion or revenue event, placed on the tap of the last attributed open (7 days). Resolves `true` when accepted. |
| `pendingOpenReports()` / `flushOpenReports()` | Open reports saved while offline (sent again on start and resume). |
| `deviceClass()` | `phone` or `tablet` (iPad / 600 dp and up), as sent with open reports. |
| `stop()` | Stops delivering events to this object. |

`LinkEvent`: `id, kind (direct|deferred), route (app_link|custom_scheme|install_referrer|fingerprint|clipboard),
appState (closed|background|foreground), matched, reason, rawUrl, url, path, params, linkId, referralCode, ms, at`.
After `createStrait`, nothing throws: a failure resolves `matched: false` with a `reason`, `false`, `0` or nothing.

## How it works

The plugin is a thin layer. All link logic (resolving short links, the once-per-install deferred
check, open reports and their retry queue, app-state labels) runs in the native SDKs, which share
golden test vectors with the Strait engine:

- **Android:** `strait-sdk-android` **v0.8.1** from JitPack. The plugin adds JitPack to your Gradle
  repositories, limited to the `com.github.strait-link` group, so nothing else is ever fetched from
  it. It reads the Play Install Referrer (`com.android.installreferrer:installreferrer:2.2`), the launch
  intent and `onNewIntent`, and keeps state in SharedPreferences (`strait`).
- **iOS:** `StraitSDK` **0.9.3+** through Swift Package Manager. Links come from Capacitor's
  `capacitorOpenURL` / `capacitorOpenUniversalLink` notifications; state lives in `UserDefaults`.

What gets recorded, the privacy details and the match methods are the same as the native SDKs:
see [Android](https://github.com/strait-link/strait-sdk-android#what-strait-records-automatically-no-extra-code)
and [iOS](https://github.com/strait-link/strait-sdk-swift#what-strait-records-automatically-no-extra-code).

### Testing a deferred link on an Android emulator

A sideloaded app never gets a Play Install Referrer. **Debug builds only** accept a stand-in on the
first launch after install (release builds ignore it):

```sh
adb shell am start -n <your.package>/.MainActivity \
  --es strait.debugReferrer "'strait_link=lnk_…&strait_click=…'"
```

Take both values from the Play Store URL your link redirects an Android phone to (its `referrer=`).

## Sample app

[`examples/capacitor-app`](examples/capacitor-app): a plain-JS Capacitor app with two screens
(Home and Product), a "Check deferred link" button and a "Log a purchase" button. CI builds it for
Android and the iOS Simulator on every pull request.

```sh
cd examples/capacitor-app && npm install
STRAIT_PUBLISHABLE_KEY=st_pub_live_… STRAIT_ENDPOINT=https://<your-handle>.strait.link npm run sync
npx cap run android    # or: npx cap run ios
```

## Docs and support

- **Docs:** [straitlink.in/docs/sdks/capacitor/](https://straitlink.in/docs/sdks/capacitor/) · [platform status](https://straitlink.in/platform-status/) · [troubleshooting](https://straitlink.in/docs/troubleshooting/)
- **Talk to the Strait team:** [support@straitlink.in](mailto:support@straitlink.in) (replies within 1 working day, IST) or call +91 81218 61890.
- **Bugs and feature requests:** [open an issue](https://github.com/strait-link/strait-sdk-capacitor/issues) on this repo.
- **Security:** never in a public issue. Write to security@straitlink.in (see [SECURITY.md](SECURITY.md)).
