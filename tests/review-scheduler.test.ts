import { afterEach, describe, expect, it, vi } from 'vitest';
import { LatestReviewScheduler, sameReviewRevision } from '../src/domain/reviewScheduler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
afterEach(() => vi.useRealTimers());

describe('bounded proofreading scheduling', () => {
  it('debounces continuous edits and invokes only the most recent text', async () => {
    vi.useFakeTimers();
    const scheduler = new LatestReviewScheduler();
    const review = vi.fn(async (text: string) => text);
    const first = scheduler.schedule(() => review('viejo'), 1200);
    await vi.advanceTimersByTimeAsync(1100);
    const latest = scheduler.schedule(() => review('actual'), 1200);
    await expect(first.result).resolves.toEqual({ status: 'cancelled' });
    await vi.advanceTimersByTimeAsync(1199);
    expect(review).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(latest.result).resolves.toEqual({ status: 'completed', value: 'actual' });
    expect(review.mock.calls).toEqual([['actual']]);
  });

  it('keeps a cancelled native call in its slot and retains one latest successor', async () => {
    const scheduler = new LatestReviewScheduler();
    const running = deferred<string>();
    const calls: string[] = [];
    const old = scheduler.schedule(() => { calls.push('running'); return running.promise; });
    old.cancel();
    const skipped = scheduler.schedule(async () => { calls.push('obsolete pending'); return 'obsolete'; });
    const latest = scheduler.schedule(async () => { calls.push('latest'); return 'fresh'; });
    await expect(old.result).resolves.toEqual({ status: 'cancelled' });
    await expect(skipped.result).resolves.toEqual({ status: 'cancelled' });
    expect(calls).toEqual(['running']);
    running.resolve('old result');
    await expect(latest.result).resolves.toEqual({ status: 'completed', value: 'fresh' });
    expect(calls).toEqual(['running', 'latest']);
  });

  it('honors the full debounce even when the previous native request finishes first', async () => {
    vi.useFakeTimers();
    const scheduler = new LatestReviewScheduler();
    const native = deferred<number>();
    scheduler.schedule(() => native.promise);
    const review = vi.fn(async () => 2);
    const next = scheduler.schedule(review, 1200);
    native.resolve(1);
    await flush();
    await vi.advanceTimersByTimeAsync(1199);
    expect(review).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(next.result).resolves.toEqual({ status: 'completed', value: 2 });
  });

  it('cancels a queued review on unmount without starting it after the active check', async () => {
    const scheduler = new LatestReviewScheduler();
    const native = deferred<number>();
    scheduler.schedule(() => native.promise);
    const review = vi.fn(async () => 2);
    const queued = scheduler.schedule(review);
    queued.cancel();
    native.resolve(1);
    await flush();
    await expect(queued.result).resolves.toEqual({ status: 'cancelled' });
    expect(review).not.toHaveBeenCalled();
  });

  it('releases the concurrency slot after failures and ignores cancelled failures', async () => {
    const scheduler = new LatestReviewScheduler();
    const failed = scheduler.schedule(async () => { throw new Error('native unavailable'); });
    await expect(failed.result).rejects.toThrow('native unavailable');
    await flush();
    const native = deferred<number>();
    const cancelled = scheduler.schedule(() => native.promise);
    cancelled.cancel();
    const next = scheduler.schedule(async () => 3);
    native.reject(new Error('obsolete failure'));
    await expect(cancelled.result).resolves.toEqual({ status: 'cancelled' });
    await expect(next.result).resolves.toEqual({ status: 'completed', value: 3 });
  });

  it('never runs two native requests concurrently during rapid tab changes', async () => {
    const scheduler = new LatestReviewScheduler();
    let active = 0, maximum = 0;
    const native = deferred<number>();
    const old = scheduler.schedule(async () => {
      maximum = Math.max(maximum, ++active);
      try { return await native.promise; } finally { active--; }
    });
    old.cancel();
    let latest;
    for (let i = 0; i < 100; i++) {
      latest = scheduler.schedule(async () => {
        maximum = Math.max(maximum, ++active);
        active--;
        return i;
      });
    }
    native.resolve(-1);
    await expect(latest!.result).resolves.toEqual({ status: 'completed', value: 99 });
    expect(maximum).toBe(1);
  });
});

describe('proofreading revision identity', () => {
  it('rejects results after an A→B→A edit, despite identical final text', () => {
    const old = { documentId: 'one', revision: 1, text: 'A' };
    expect(sameReviewRevision(old, { ...old })).toBe(true);
    expect(sameReviewRevision(old, { ...old, revision: 3 })).toBe(false);
    expect(sameReviewRevision(old, { ...old, documentId: 'two' })).toBe(false);
    expect(sameReviewRevision(old, { ...old, text: 'B' })).toBe(false);
  });
});
