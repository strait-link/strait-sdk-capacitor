import { describe, expect, it, vi } from 'vitest';
import { createStrait, type LinkEvent, type LinkStart, type StraitNativePlugin } from '../src/strait.js';

const ev = (over: Partial<LinkEvent> = {}): LinkEvent => ({
  id: 'o1', kind: 'direct', route: 'app_link', appState: 'closed', matched: true,
  url: 'https://example.com/p/42?color=red', path: '/p/42', params: { color: 'red' }, ms: 12, at: 1, ...over,
});

/** A stand-in for the native plugin: records calls and lets the test fire native events. */
function fakeNative(overrides: Partial<StraitNativePlugin> = {}) {
  const handlers: Record<string, Array<(d: unknown) => void>> = { link: [], linkStart: [] };
  const removed: string[] = [];
  const native: StraitNativePlugin = {
    start: vi.fn(async () => {}),
    checkDeferred: vi.fn(async () => ev({ kind: 'deferred', route: 'fingerprint' })),
    trackEvent: vi.fn(async () => ({ accepted: true })),
    pendingOpenReports: vi.fn(async () => ({ count: 2 })),
    flushOpenReports: vi.fn(async () => {}),
    deviceClass: vi.fn(async () => ({ deviceClass: 'phone' as const })),
    openStoreSheet: vi.fn(async () => ({ opened: true, method: 'market', clickId: 'c1', linkId: 'l1' })),
    doctor: vi.fn(async () => ({ ok: true, findings: [{ id: 'key.ok', severity: 'ok' as const, title: 'Publishable key is set', fix: '' }] })),
    addListener: vi.fn(async (name: string, cb: (d: never) => void) => {
      handlers[name]!.push(cb as (d: unknown) => void);
      return { remove: async () => { removed.push(name); } };
    }) as unknown as StraitNativePlugin['addListener'],
    ...overrides,
  };
  const fire = (name: 'link' | 'linkStart', data: unknown) => handlers[name]!.forEach((h) => h(data));
  return { native, fire, removed, handlers };
}

const config = { publishableKey: 'st_pub_live_abc', endpoint: 'https://strait-dev.strait.link' };

describe('createStrait (Capacitor)', () => {
  it('listens to native link events before start, so the launch link is never missed', async () => {
    const { native, handlers } = fakeNative();
    createStrait(config, native);
    await Promise.resolve();
    expect(handlers.link).toHaveLength(1);
    expect(handlers.linkStart).toHaveLength(1);
  });

  it('start() hands the config to the native SDK once, even when called twice', async () => {
    const { native } = fakeNative();
    const s = createStrait({ ...config, linkHosts: ['go.brand.com'] }, native);
    await Promise.all([s.start(), s.start()]);
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(native.start).toHaveBeenCalledWith({
      publishableKey: 'st_pub_live_abc', endpoint: 'https://strait-dev.strait.link', linkHosts: ['go.brand.com'],
    });
  });

  it('onLink gets live events and replays earlier ones to late subscribers (B9)', async () => {
    const { native, fire } = fakeNative();
    const s = createStrait(config, native);
    await Promise.resolve();
    fire('link', ev({ id: 'a' }));
    const seen: string[] = [];
    s.onLink((e) => seen.push(e.id));
    fire('link', ev({ id: 'b' }));
    expect(seen).toEqual(['a', 'b']);
  });

  it('onLinkStart forwards the loading signal; unsubscribe stops delivery', async () => {
    const { native, fire } = fakeNative();
    const s = createStrait(config, native);
    await Promise.resolve();
    const seen: LinkStart[] = [];
    const off = s.onLinkStart((x) => seen.push(x));
    fire('linkStart', { id: 'a', kind: 'direct', appState: 'background', at: 1 });
    off();
    fire('linkStart', { id: 'b', kind: 'direct', appState: 'background', at: 2 });
    expect(seen.map((x) => x.id)).toEqual(['a']);
  });

  it('a throwing subscriber does not stop the others', async () => {
    const { native, fire } = fakeNative();
    const s = createStrait(config, native);
    await Promise.resolve();
    const seen: string[] = [];
    s.onLink(() => { throw new Error('app bug'); });
    s.onLink((e) => seen.push(e.id));
    fire('link', ev({ id: 'x' }));
    expect(seen).toEqual(['x']);
  });

  it('trackEvent passes name + extras and resolves the native answer', async () => {
    const { native } = fakeNative();
    const s = createStrait(config, native);
    await expect(s.trackEvent('purchase', { value: 49.99, currency: 'USD' })).resolves.toBe(true);
    expect(native.trackEvent).toHaveBeenCalledWith({ name: 'purchase', value: 49.99, currency: 'USD' });
  });

  it('never throws: native failures (web, plugin missing) give safe defaults (B10)', async () => {
    const boom = vi.fn(async () => { throw new Error('"Strait" plugin is not implemented on web'); });
    const { native } = fakeNative({
      start: boom, checkDeferred: boom, trackEvent: boom, pendingOpenReports: boom, flushOpenReports: boom, deviceClass: boom, doctor: boom, openStoreSheet: boom,
    });
    const s = createStrait(config, native);
    await expect(s.start()).resolves.toBeUndefined();
    await expect(s.trackEvent('purchase')).resolves.toBe(false);
    await expect(s.pendingOpenReports()).resolves.toBe(0);
    await expect(s.flushOpenReports()).resolves.toBeUndefined();
    await expect(s.deviceClass()).resolves.toBeUndefined();
    await expect(s.doctor()).resolves.toEqual({ ok: false, findings: [] });
    await expect(s.openStoreSheet('https://hilltop.strait.link/promo')).resolves.toEqual({ opened: false, method: 'none', reason: 'unavailable' });
    const e = await s.checkDeferred();
    expect(e).toMatchObject({ kind: 'deferred', matched: false, reason: 'unavailable' });
  });

  it('checkDeferred, pendingOpenReports and deviceClass return the native values', async () => {
    const { native } = fakeNative();
    const s = createStrait(config, native);
    await expect(s.checkDeferred()).resolves.toMatchObject({ kind: 'deferred', route: 'fingerprint', path: '/p/42' });
    await expect(s.pendingOpenReports()).resolves.toBe(2);
    await expect(s.deviceClass()).resolves.toBe('phone');
  });

  it('refuses a secret key: it would ship inside the app (B1)', () => {
    const { native } = fakeNative();
    expect(() => createStrait({ ...config, publishableKey: 'st_live_secret' }, native)).toThrow(/publishable key/);
    expect(() => createStrait({ ...config, publishableKey: 'st_test_secret' }, native)).toThrow(/publishable key/);
    expect(() => createStrait({ ...config, publishableKey: '' }, native)).toThrow(/publishable key/);
  });

  it('stop() removes the native listeners', async () => {
    const { native, removed } = fakeNative();
    const s = createStrait(config, native);
    await Promise.resolve();
    s.stop();
    await new Promise((r) => setTimeout(r, 0));
    expect(removed.sort()).toEqual(['link', 'linkStart']);
  });

  it('doctor() returns the native SDK report (B23) after start', async () => {
    const { native } = fakeNative();
    const s = createStrait(config, native);
    await s.start();
    const r = await s.doctor();
    expect(native.doctor).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: true, findings: [{ id: 'key.ok', severity: 'ok', title: 'Publishable key is set', fix: '' }] });
  });

  it('openStoreSheet passes the link and options to the native store sheet and returns its result', async () => {
    const { native } = fakeNative();
    const s = createStrait(config, native);
    const r = await s.openStoreSheet('https://hilltop.strait.link/promo', { appStoreId: '123456789', style: 'overlay', inline: false });
    expect(native.openStoreSheet).toHaveBeenCalledWith({ url: 'https://hilltop.strait.link/promo', appStoreId: '123456789', style: 'overlay', inline: false });
    expect(r).toEqual({ opened: true, method: 'market', clickId: 'c1', linkId: 'l1' });
  });
});
