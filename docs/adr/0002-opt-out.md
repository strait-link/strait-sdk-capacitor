# 0002: Opt-out switch `setEnabled(false)` through the native SDKs

5 Nov 2026. Status: accepted. Follow-up F6 (`ops/run-1105/sdk-privacy-followups.md`). Same contract as
strait-sdk-react-native ADR 0002 and the Android / Swift opt-out ADRs (td2-27, E3, F4, F5).

## Problem
Every other Strait app SDK has a consent switch; Capacitor's JS layer exposed none, although the native SDKs
it wraps (strait-sdk-android, StraitSDK) have one on main. An Ionic app with a consent screen could only skip
`start()`, losing direct-link routing and the install's deferred link.

## Options
1. **Do nothing**: the privacy promise is untrue for Capacitor.
2. **Re-implement the switch in TS** (gate calls in JS): the native SDKs send open reports, the deferred check
   and the retry queue on their own (launch, resume), which JS can't see. It would not hold.
3. **Bridge to the native SDKs' own `setEnabled` / `isEnabled`** (chosen, ADR 0001's rule: link logic lives in
   the native SDKs; the plugin only wires). The native side already gates every call, deletes the saved
   queue and tap, routes short links through `/v1/lookup`, persists `strait.enabled` and re-runs a skipped
   first-launch check.

## Design
- JS: `setEnabled(enabled)` -> `native.setEnabled({ enabled })`; `isEnabled()` -> `native.isEnabled()`.
  Never throw (B10): failure = nothing / `true` (unreadable = on, as in every SDK).
- Before `start()` (a first-launch consent screen calls it first): the native client does not exist yet, so the
  plugin writes `strait.enabled` to the SDK's own store (Android SharedPreferences `strait`, iOS UserDefaults,
  which `StraitLinks` uses by default) and applies the value to the client right after it is created, before
  `start` and before any lifecycle call. So nothing is sent, and the saved queue and tap are cleared as in a
  later call. `isEnabled()` before `start()` reads the same key.
- After `start()`: the SDK's `setEnabled`; the call resolves after the SDK's clearing / re-run (Android: on the
  SDK's single executor; iOS: the completion).
- Native pins: `setEnabled` is on the native SDKs' main but in no tag yet (android v0.9.0 and swift v0.10.0
  were cut before it). The plugin pins the main commits (JitPack `278eb41434`, SwiftPM `revision: 3ba01f8…`)
  so CI's sample builds compile against the real code; **the release re-pins to the next native tags**
  (sdk-release-plan step 8). A revision pin is fine for apps that consume the plugin by path (Capacitor's
  `CapApp-SPM`), and the Release workflow refuses a tag while either pin is not a release tag (a `revision:` or commit pin
  would break apps that add the package to SwiftPM by URL and version).

## Security lens
Spoofing / tampering: none new (a local flag in the app's sandbox). Data exposure: the point of the change.
The pre-start write uses the same key and store the native SDK reads, so there is no second source of truth.
Accepted risk (as in every SDK): a store that can't be read counts as on.

## Architecture lens
No engine or wire change. Open PR #5 (B6a/B13a) also edits the native pins; whoever merges it keeps pins that
contain `setEnabled` (main commits now, the next tags at release), or the sample builds fail.
