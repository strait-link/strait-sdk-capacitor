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
