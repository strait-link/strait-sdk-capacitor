import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Contract B25 (shared-spec ADR 0006): the plugin names itself in sdkVersion ("capacitor/<this package's version>")
// on both native sides, and Android passes the app's versionName as appVersion (iOS: StraitSDK's default).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const version = JSON.parse(read('package.json')).version as string;
const java = read('android/src/main/java/dev/strait/capacitor/StraitPlugin.java');
const swift = read('ios/Sources/StraitPlugin/StraitPlugin.swift');

describe('versions sent with opens and installs (B25)', () => {
  it('Android sends capacitor/<package version> and the app versionName', () => {
    expect(java).toContain(`SDK_VERSION = "capacitor/${version}";`);
    expect(java).toMatch(/\(\) -> appVersion\(ctx\),\s*\n\s*SDK_VERSION\s*\n\s*\)\);/);
    expect(java).toMatch(/getPackageInfo\(ctx\.getPackageName\(\), 0\)\.versionName/);
  });

  it('iOS sends capacitor/<package version>', () => {
    expect(swift).toContain(`static let sdkVersion = "capacitor/${version}"`);
    expect(swift).toMatch(/StraitLinksConfig\([^)]*sdkVersion: Self\.sdkVersion\)/);
  });
});

// Contract B26 (shared-spec ADR 0008): the Android core sends the Play install referrer (installReferrer) with the
// install from v0.10.4; the plugin hands it the referrer it reads, so pinning that core is the whole change.
describe('Play install referrer on the install (B26)', () => {
  it('pins strait-sdk-android v0.10.4 or later and passes the referrer it reads into StraitConfig', () => {
    const pin = /straitSdkVersion = 'v(\d+)\.(\d+)\.(\d+)'/.exec(read('android/build.gradle'));
    expect(pin).not.toBeNull();
    const [maj, min, patch] = pin!.slice(1).map(Number);
    expect(maj * 1e6 + min * 1e3 + patch).toBeGreaterThanOrEqual(10_004);
    expect(java).toMatch(/\(\) -> debugReferrer != null \? debugReferrer : readInstallReferrer\(ctx\)/);
  });
});

// Contract B27 (shared-spec ADR 0009): setUserId lives in the native cores from Android v0.10.5 / StraitSDK 0.11.5;
// both plugins forward it (and keep one set before start() for the start).
describe('setUserId (B27)', () => {
  it('pins cores that have setUserId and both plugins forward it', () => {
    const pin = /straitSdkVersion = 'v(\d+)\.(\d+)\.(\d+)'/.exec(read('android/build.gradle'));
    const [maj, min, patch] = pin!.slice(1).map(Number);
    expect(maj * 1e6 + min * 1e3 + patch).toBeGreaterThanOrEqual(10_005);
    const swiftPin = /strait-sdk-swift\.git", from: "(\d+)\.(\d+)\.(\d+)"/.exec(read('Package.swift'));
    expect(swiftPin).not.toBeNull();
    const [smaj, smin, spatch] = swiftPin!.slice(1).map(Number);
    expect(smaj * 1e6 + smin * 1e3 + spatch).toBeGreaterThanOrEqual(11_005);
    expect(java).toMatch(/public synchronized void setUserId\(PluginCall call\)/);
    expect(java).toMatch(/if \(pendingUserId != null\) client\.setUserId\(pendingUserId\);/);
    expect(swift).toContain('CAPPluginMethod(name: "setUserId"');
    expect(swift).toMatch(/if let id = pendingUserId \{ l\.setUserId\(id\) \}/);
  });
});

// Contract B27 v15 (shared-spec ADR 0010): the phone rule that hashes `(+91) …`, no-break spaces, Unicode dashes,
// `tel:`, full-width / Indian digits lives in the native cores from Android v0.10.6 / StraitSDK 0.11.6.
describe('setUserId phone rule v15 (B27)', () => {
  it('pins cores with the v15 rule', () => {
    const [maj, min, patch] = /straitSdkVersion = 'v(\d+)\.(\d+)\.(\d+)'/.exec(read('android/build.gradle'))!.slice(1).map(Number);
    expect(maj * 1e6 + min * 1e3 + patch).toBeGreaterThanOrEqual(10_006);
    const [smaj, smin, spatch] = /strait-sdk-swift\.git", from: "(\d+)\.(\d+)\.(\d+)"/.exec(read('Package.swift'))!.slice(1).map(Number);
    expect(smaj * 1e6 + smin * 1e3 + spatch).toBeGreaterThanOrEqual(11_006);
  });
});

// Contract B27 v16 (shared-spec ADR 0011): one email lower-case rule (İ → i̇, Σ → σ first) lives in the native cores
// from Android v0.10.7 / StraitSDK 0.11.7.
describe('setUserId email lower-case v16 (B27)', () => {
  it('pins cores with the v16 rule', () => {
    const [maj, min, patch] = /straitSdkVersion = 'v(\d+)\.(\d+)\.(\d+)'/.exec(read('android/build.gradle'))!.slice(1).map(Number);
    expect(maj * 1e6 + min * 1e3 + patch).toBeGreaterThanOrEqual(10_007);
    const [smaj, smin, spatch] = /strait-sdk-swift\.git", from: "(\d+)\.(\d+)\.(\d+)"/.exec(read('Package.swift'))!.slice(1).map(Number);
    expect(smaj * 1e6 + smin * 1e3 + spatch).toBeGreaterThanOrEqual(11_007);
  });
});
