import { describe, expect, test } from 'bun:test';
import { decideForegroundSync, retryDelayMs, type AutonomySnapshot } from '../../src/domain/offline-mission/autonomy';
const base: AutonomySnapshot = { online:true, visible:true, authenticated:true, pending:2, review:0, inFlight:false, consecutiveFailures:0, nowMs:100000 };
describe('P29 foreground autonomy safety', () => {
  test('requires explicit usable context', () => expect(decideForegroundSync(base)).toEqual({allowed:true,reason:'ready'}));
  test('never sends offline or hidden', () => {expect(decideForegroundSync({...base,online:false}).allowed).toBe(false);expect(decideForegroundSync({...base,visible:false}).allowed).toBe(false);});
  test('blocks anonymous, empty and busy', () => {for(const change of [{authenticated:false},{pending:0},{inFlight:true}]) expect(decideForegroundSync({...base,...change}).allowed).toBe(false);});
  test('enforces bounded exponential backoff', () => {expect(retryDelayMs(0)).toBe(15000);expect(retryDelayMs(20)).toBe(300000);expect(decideForegroundSync({...base,lastAttemptMs:99000}).allowed).toBe(false);});
  test('review-only queue never syncs', () => expect(decideForegroundSync({...base,pending:0,review:3}).allowed).toBe(false));
});
