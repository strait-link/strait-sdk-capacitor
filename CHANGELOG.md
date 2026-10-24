# Changelog

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
