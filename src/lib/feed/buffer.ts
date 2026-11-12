import type { FeedEntry } from '../content/schemas';

interface Options {
  max?: number;
  flushMs?: number;
  write: (entries: FeedEntry[]) => Promise<void>;
  read: () => Promise<FeedEntry[]>;
}

export interface FeedBuffer {
  push(e: FeedEntry): Promise<void>;
  flush(): Promise<void>;
}

// At most one write per window keeps Firestore far below the free tier. Writes happen inside the
// ingest request when possible, because Cloud Run throttles CPU between requests and timers stall.
export function createFeedBuffer({ max = 30, flushMs = 10_000, write, read }: Options): FeedBuffer {
  let entries: FeedEntry[] = [];
  let loaded = false;
  let pending = false;
  let lastWrite = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    timer ??= setTimeout(flush, Math.max(0, lastWrite + flushMs - Date.now()));
  };

  async function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    lastWrite = Date.now();
    try {
      // A cold instance must not replace the stored feed with only what it has seen.
      if (!loaded) {
        const stored = await read();
        entries = [...entries, ...stored].slice(0, max);
        loaded = true;
      }
      pending = false;
      await write(entries);
    } catch (err) {
      pending = true;
      console.error('feed flush failed', err);
    }
    if (pending) schedule();
  }

  return {
    async push(e) {
      entries = [e, ...entries].slice(0, max);
      pending = true;
      if (Date.now() - lastWrite >= flushMs) await flush();
      else schedule();
    },
    flush,
  };
}

interface Signals {
  once(event: 'SIGTERM', listener: () => void): unknown;
  exit(code: number): void;
}

// Cloud Run sends SIGTERM before stopping an instance; registering a listener replaces Node's default exit.
export function flushOnSigterm(buffer: FeedBuffer, proc: Signals = process) {
  proc.once('SIGTERM', () => void buffer.flush().finally(() => proc.exit(0)));
}
