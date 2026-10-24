import type { PluginListenerHandle } from '@capacitor/core';

/** One link the app received (B9): the same shape as @straitlink/react-native. */
export interface LinkEvent {
  /** Unique per open; also the id Strait records this open under. */
  id: string;
  /** direct = the app was opened by a link; deferred = link tapped before install. */
  kind: 'direct' | 'deferred';
  /** app_link · custom_scheme · install_referrer · fingerprint · clipboard. */
  route: 'app_link' | 'custom_scheme' | 'install_referrer' | 'fingerprint' | 'clipboard';
  /** What the app was doing when the link arrived. */
  appState: 'closed' | 'background' | 'foreground';
  matched: boolean;
  /** Why it didn't match: not_found, expired, password_protected, network, no_match, unavailable, … */
  reason?: string;
  /** The URL the OS gave the app (direct links). */
  rawUrl?: string;
  /** The destination to navigate to. */
  url?: string;
  path?: string;
  params?: Record<string, string>;
  linkId?: string;
  /** Deferred links only: the referral code the tap carried (preview, B21). */
  referralCode?: string;
  /** Time spent resolving, ms. */
  ms: number;
  at: number;
}

/** A link just arrived and is being resolved: show a loading state until the LinkEvent with the same id. */
export interface LinkStart {
  id: string;
  kind: 'direct' | 'deferred';
  appState: 'closed' | 'background' | 'foreground';
  rawUrl?: string;
  at: number;
}

export type DeviceClass = 'phone' | 'tablet';

export interface CreateStraitConfig {
  /** Your workspace's publishable key (`st_pub_live_…`), Dashboard → Get started. Never the secret key. */
  publishableKey: string;
  /** Your workspace's link domain, e.g. https://<your-handle>.strait.link */
  endpoint: string;
  /** Extra hosts that serve your short links (custom domains, old `<x>.page.link`). */
  linkHosts?: string[];
}

export interface TrackEventExtra {
  value?: number;
  currency?: string;
  linkId?: string;
  clickId?: string;
}

/** The native side (Android: StraitPlugin.java over strait-sdk-android; iOS: StraitPlugin.swift over StraitSDK). */
export interface StraitNativePlugin {
  start(options: { publishableKey: string; endpoint: string; linkHosts: string[] }): Promise<void>;
  checkDeferred(): Promise<LinkEvent>;
  trackEvent(options: { name: string } & TrackEventExtra): Promise<{ accepted: boolean }>;
  pendingOpenReports(): Promise<{ count: number }>;
  flushOpenReports(): Promise<void>;
  deviceClass(): Promise<{ deviceClass?: DeviceClass }>;
  addListener(event: 'link', cb: (e: LinkEvent) => void): Promise<PluginListenerHandle>;
  addListener(event: 'linkStart', cb: (s: LinkStart) => void): Promise<PluginListenerHandle>;
}

export interface Strait {
  /** Reads the launch link, listens for new ones, runs the deferred check once per install. */
  start(): Promise<void>;
  /** Every link event, including ones that happened before you subscribed. Returns an unsubscribe. */
  onLink(cb: (event: LinkEvent) => void): () => void;
  /** A link just arrived and is being resolved (for a loading state). Returns an unsubscribe. */
  onLinkStart(cb: (start: LinkStart) => void): () => void;
  /** Re-run the deferred check now (debugging); doesn't touch the once-per-install flag. */
  checkDeferred(): Promise<LinkEvent>;
  /** Conversion / revenue event, on the tap of the last attributed open (≤7 days, B15). True when accepted. */
  trackEvent(name: string, extra?: TrackEventExtra): Promise<boolean>;
  /** Open reports saved while offline, waiting to be sent (debugging). */
  pendingOpenReports(): Promise<number>;
  /** Send saved open reports now (also happens on start and on resume). */
  flushOpenReports(): Promise<void>;
  /** What the app runs on, as sent with open reports (B14): iPad / sw600dp = tablet. */
  deviceClass(): Promise<DeviceClass | undefined>;
  /** Stop delivering events to this object. */
  stop(): void;
}

export function createStrait(config: CreateStraitConfig, native: StraitNativePlugin): Strait {
  const key = config.publishableKey ?? '';
  if (!key.startsWith('st_pub_')) {
    throw new TypeError(
      'Strait: use your publishable key (st_pub_…, Dashboard → Get started). A secret key must never ship inside an app.',
    );
  }
  const events: LinkEvent[] = [];
  const linkCbs = new Set<(e: LinkEvent) => void>();
  const startCbs = new Set<(s: LinkStart) => void>();
  const each = <T>(cbs: Set<(x: T) => void>, x: T) => {
    for (const cb of [...cbs]) {
      try {
        cb(x);
      } catch {
        // an app's handler must not stop the others
      }
    }
  };
  // Subscribe before start(), so the link that launched the app is never missed.
  const handles = [
    native.addListener('link', (e) => {
      events.push(e);
      each(linkCbs, e);
    }),
    native.addListener('linkStart', (s) => each(startCbs, s)),
  ];
  let started: Promise<void> | undefined;
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  return {
    start() {
      started ??= safe(async () => {
        await Promise.all(handles);
        await native.start({ publishableKey: key, endpoint: config.endpoint, linkHosts: config.linkHosts ?? [] });
      }, undefined);
      return started;
    },
    onLink(cb) {
      linkCbs.add(cb);
      for (const e of [...events]) each(new Set([cb]), e);
      return () => linkCbs.delete(cb);
    },
    onLinkStart(cb) {
      startCbs.add(cb);
      return () => startCbs.delete(cb);
    },
    checkDeferred: () =>
      safe(() => native.checkDeferred(), {
        id: '', kind: 'deferred', route: 'fingerprint', appState: 'foreground',
        matched: false, reason: 'unavailable', ms: 0, at: Date.now(),
      } as LinkEvent),
    trackEvent: (name, extra = {}) => safe(async () => (await native.trackEvent({ name, ...extra })).accepted === true, false),
    pendingOpenReports: () => safe(async () => (await native.pendingOpenReports()).count ?? 0, 0),
    flushOpenReports: () => safe(() => native.flushOpenReports(), undefined),
    deviceClass: () => safe(async () => (await native.deviceClass()).deviceClass, undefined),
    stop() {
      linkCbs.clear();
      startCbs.clear();
      for (const h of handles) void h.then((x) => x.remove()).catch(() => {});
    },
  };
}
