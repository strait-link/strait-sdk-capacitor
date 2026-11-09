# Changelog

## 0.4.2 (9 Nov 2026)

Needs strait-sdk-android v0.10.1 and StraitSDK 0.11.2 (pinned by the plugin).

- iPhone install matching across IPv4 / IPv6 (contract B24, engine ADR 0101): when Safari tapped the link over IPv4 and the app's first launch asks over IPv6, StraitSDK 0.11.2 asks the engine's IPv4-only URL once more with the same request (nothing new collected). A match there is `probable`, never `exact`. Re-pinned iOS to `from: "0.11.2"`.

## 0.4.1 (8 Nov 2026)

Needs strait-sdk-android v0.10.1 and StraitSDK 0.11.1 (pinned by the plugin).

- `doctor()`: on a Strait link domain before Dashboard → Apps & stores is filled in (it answers 404 `{"error":"not configured"}`), the finding is now `app.none` with "Fill in Dashboard → Apps & stores (package name and SHA-256 fingerprint / Team ID and bundle ID), wait a minute, then check again", not "use your Strait link domain" (shared-spec ADR 0002 amendment). Comes from the native SDKs: Android v0.10.1 is now pinned (iOS `from: "0.11.0"` already resolved 0.11.1 on a fresh install; now the floor).

## 0.4.0 (7 Nov 2026)

Needs strait-sdk-android v0.10.0 and StraitSDK 0.11.0 (pinned by the plugin); install time passed by the plugin, no app code.

- README: starts with a guided setup section (no `strait init` for this platform yet: the three steps in the quick start, or the Strait MCP `get_started` prompt), before the manual quick start.
- `setEnabled(enabled)` / `isEnabled()`: the opt-out switch for consent flows (India's DPDP Act, GDPR), the
  same contract as every Strait app SDK, run by the native SDKs. While off: no open reports, events or install
  matching, nothing remembered, and reports saved on the phone are deleted; a short link is looked up through
  `/v1/lookup`, which records nothing, so it still routes. Kept across launches; default on. Works before
  `start()` (applied before anything is sent). ADR `docs/adr/0002-opt-out.md`.
- Fix (privacy, F7, from StraitSDK): switching off during the first-launch check no longer reads the iPhone
  clipboard (no paste prompt for an opted-out person).
- Fix: reinstalls from a link are no longer lost (Android Auto Backup / restored iPhones brought the
  once-per-install flag back). The Android side passes `firstInstallTime` to the SDK; iOS gets the
  SDK's backup-excluded install marker (contract B6a).
- `trackEvent(name, { eventId })`: your order id, stored once by the engine; left out, the SDK makes
  one. Events that can't be sent (offline, 429, 5xx) are kept and sent later (contract B13a).
- Fix (from the native SDKs, no plugin code): when the server is busy (429 or 5xx) the saved queue no
  longer sends its whole backlog on every resume. It stops at the first 429/5xx and waits 15–30 s,
  doubling each time in a row up to 1 hour, and at least the server's `Retry-After` (contract B14
  backoff, C1). `flushOpenReports()` also waits while the server asked to.

## 0.3.0 (24 Oct 2026)
- `openStoreSheet(url, options)`: the app store inside your app for one of your links (another app
  you want people to install), keeping the deep link through the install. Android opens Google Play's
  inline sheet, then the Play app, then the web listing; iPhone shows the App Store product page or an
  overlay card. Same options and result as `@straitlink/react-native`.
- Sample app: an "Open store sheet" button.

## 0.2.0 (24 Oct 2026)
- `doctor()` (contract B23): a setup check for debug builds. Checks the key, the endpoint, and whether
  your link domain's `assetlinks.json` / `apple-app-site-association` lists this app. On Android it
  also checks this build's signing certificate, the most common reason App Links open the browser.
  Same finding ids and wording as every Strait SDK.
- Native SDKs: strait-sdk-android v0.8.3, StraitSDK 0.9.4+.
- Sample app: a "Check setup" button.

## 0.1.0 (24 Oct 2026)
- First release: `@straitlink/capacitor`, a Capacitor 8 plugin over strait-sdk-android v0.8.1 (JitPack)
  and StraitSDK 0.9.3 (Swift Package Manager).
- `createStrait` with the React Native SDK's API: `start`, `onLink` (replays earlier events),
  `onLinkStart`, `checkDeferred`, `trackEvent`, `pendingOpenReports`, `flushOpenReports`,
  `deviceClass`, `stop`. Never throws after creation; refuses a secret key.
- Links arrive with no app code: Android intents (launch + `onNewIntent`), iOS Universal Links and
  custom schemes through Capacitor's AppDelegate / SceneDelegate proxy.
- Proven on the Android emulator (deferred via the Play referrer, App Link closed / background,
  Chrome hand-off, purchase event) and the iOS Simulator (Universal Link closed / background,
  first-launch deferred check) against prod links.
