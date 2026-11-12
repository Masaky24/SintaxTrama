export type ReviewOutcome<T> = { status: 'completed'; value: T } | { status: 'cancelled' };
export interface ReviewJob<T> { result: Promise<ReviewOutcome<T>>; cancel: () => void }

interface Work {
  ready: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  execute: () => Promise<void>;
  cancel: () => void;
}

// Native IPC cannot abort a running COM check. Keep its slot occupied until it
// actually settles, while retaining only the latest requested successor.
export class LatestReviewScheduler {
  private active: Work | null = null;
  private pending: Work | null = null;

  schedule<T>(review: () => Promise<T>, delay = 0): ReviewJob<T> {
    this.pending?.cancel();
    let cancelled = false;
    let resolve!: (value: ReviewOutcome<T>) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<ReviewOutcome<T>>((accept, fail) => { resolve = accept; reject = fail; });
    const work: Work = {
      ready: delay <= 0,
      timer: null,
      execute: async () => {
        if (cancelled) return;
        try {
          const value = await review();
          if (!cancelled) resolve({ status: 'completed', value });
        } catch (error) {
          if (!cancelled) reject(error);
        }
      },
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        if (work.timer !== null) clearTimeout(work.timer);
        if (this.pending === work) this.pending = null;
        resolve({ status: 'cancelled' });
      },
    };
    this.pending = work;
    if (!work.ready) {
      work.timer = setTimeout(() => {
        work.timer = null;
        work.ready = true;
        this.drain();
      }, delay);
    }
    this.drain();
    return { result, cancel: work.cancel };
  }

  private drain() {
    if (this.active || !this.pending?.ready) return;
    const work = this.pending;
    this.pending = null;
    this.active = work;
    void work.execute().finally(() => {
      this.active = null;
      this.drain();
    });
  }
}

// Shared across tab changes and unmount/remount cycles of the correction panel.
export const reviewScheduler = new LatestReviewScheduler();

export interface ReviewSnapshot { documentId: string; revision: number; text: string }
export function sameReviewRevision(left: ReviewSnapshot, right: ReviewSnapshot) {
  return left.documentId === right.documentId && left.revision === right.revision && left.text === right.text;
}
