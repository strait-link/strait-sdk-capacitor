# 0001: A Capacitor plugin that wraps the native SDKs

24 Oct 2026. Status: accepted (Track C, run-1024).

## Problem
Ionic / Capacitor teams can't use Strait today: `@straitlink/react-native` needs React Native, and
`@straitlink/web` can't see App Links, Universal Links or the Play Install Referrer. Branch and
Linkrunner both ship Capacitor plugins; it's a gap in our platform list.

## Customer
A web developer with a Capacitor 8 app. They want one npm install, two native config lines (the
link domain), and `onLink` giving them a path to route to. Same shape as our React Native SDK.

## Options
1. **Do nothing.** Capacitor apps keep going to Branch/Linkrunner.
2. **Pure JS on top of `@capacitor/app` (appUrlOpen)** plus a re-implementation of resolve, deferred
   match, open reports and the retry queue in TS (like the RN SDK). A third copy of the contract
   logic, plus our own native module for the Play referrer anyway.
3. **Thin native plugin over the existing native SDKs** (chosen). `strait-sdk-android` (JitPack) and
   `StraitSDK` (SwiftPM) already implement contracts B1-B22 and are tested against the shared
   vectors; the plugin only wires Capacitor's intent/URL delivery, storage, the Play referrer and
   lifecycle into them and forwards `link` / `linkStart` events to JS.

## Prior art (teardown of the public npm tarballs, 24 Oct)
`capacitor-branch-deep-links@10.0.0` and `capacitor-linkrunner@2.3.2` use the standard
`@capacitor/create-plugin` layout: `Package.swift` with an SPM dependency on the vendor iOS SDK
(+ a podspec), `android/build.gradle` with a Maven dependency on the vendor Android SDK,
`registerPlugin()` in JS. Branch listens to Capacitor's open-URL notifications and
`handleOnNewIntent` and emits events with `retainUntilConsumed`; Linkrunner makes the app call
`handleDeeplink(url)` itself. We follow Branch's automatic delivery (no app code per link).

## Decisions
- **API:** `createStrait({publishableKey, endpoint, linkHosts})` → `start / onLink / onLinkStart /
  checkDeferred / trackEvent / pendingOpenReports / flushOpenReports / deviceClass / stop`, the RN
  names. Never throws after creation (B10); a secret key (`st_live_` / `st_test_`) is refused at
  creation because it would ship inside the app (B1).
- **Delivery:** the JS object subscribes to native events before `start()`; native events use
  `retainUntilConsumed`; the JS side keeps a replay buffer for late `onLink` subscribers (B9).
  Android: launch intent at `start()`, `handleOnNewIntent` after (old intents replayed from the
  recents screen are skipped). iOS: `capacitorOpenURL` / `capacitorOpenUniversalLink` notifications,
  buffered until `start()`, plus `ApplicationDelegateProxy.lastURL` for the cold start.
- **iOS distribution:** Swift Package Manager only (Capacitor 8's default). `StraitSDK` has no
  CocoaPods spec, so CocoaPods projects aren't supported in 0.1.0 (said in the README).
- **Android distribution:** `com.github.strait-link:strait-sdk-android:v0.8.1` from JitPack. Gradle
  resolves a library's dependencies with the *app's* repositories, so the plugin adds JitPack to all
  projects, **limited by a content filter to the `com.github.strait-link` group** (nothing else is
  ever fetched from JitPack). Moves to Maven Central (`in.straitlink`) when the SDK is published there.
- **Testing deferred on an emulator:** debug builds only accept a launch extra
  `strait.debugReferrer` in place of the Play Install Referrer (a sideloaded app never gets one).
  Release builds ignore it (checked with `FLAG_DEBUGGABLE`).
- **Java, not Kotlin,** for the Android plugin: no Kotlin Gradle plugin requirement on the app.

## Security lens
- Spoofing: the publishable key is public by design; the secret-key guard stops the dangerous mistake.
- Tampering: links resolve through the engine (`/v1/resolve`); the plugin trusts nothing from the URL
  beyond what the native SDK already validates. The debug referrer works only in debuggable builds,
  which an attacker could inspect anyway.
- Data exposure: open reports carry host + path + utm_source only (B18, in the native SDKs).
- Supply chain: JitPack is limited to our own group; the plugin adds one Google dependency
  (`com.android.installreferrer:installreferrer:2.2`, the same one the native SDK docs use);
  JS has zero runtime dependencies (`@capacitor/core` is a peer).

## Architecture lens
No server change. Coupling: plugin version pins the native SDK minor (`v0.8.1` / `from: "0.9.3"`).
Failure modes: no network → native SDK queues reports and retries (B14); web platform → every call
resolves a safe default. Scale: per-device work only.

## Cost
None (npm, GitHub Actions minutes on a public repo).
