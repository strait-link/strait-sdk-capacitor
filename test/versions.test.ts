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
