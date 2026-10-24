import { registerPlugin } from '@capacitor/core';
import { createStrait as createWith, type CreateStraitConfig, type Strait, type StraitNativePlugin } from './strait.js';

/** The native plugin (registered as "Strait"). Most apps use `createStrait` instead. */
export const StraitNative = registerPlugin<StraitNativePlugin>('Strait');

/**
 * Create one client when the app starts, subscribe with `onLink`, then call `start()`.
 * Android and iOS only; on the web every call resolves a safe default (use @straitlink/web there).
 */
export function createStrait(config: CreateStraitConfig, native: StraitNativePlugin = StraitNative): Strait {
  return createWith(config, native);
}

export type {
  CreateStraitConfig,
  DeviceClass,
  LinkEvent,
  LinkStart,
  Strait,
  StraitNativePlugin,
  TrackEventExtra,
} from './strait.js';
