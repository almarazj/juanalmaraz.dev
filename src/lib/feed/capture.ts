import { FEED_WRITE_TIMEOUT_MS, putEntry } from './store';
import { sanitize, type RequestFacts } from './sanitize';

let cold = true;

// LWA runs one Node process per execution environment, so the first request this process handles is the cold one.
export function takeColdFlag(): boolean {
  const was = cold;
  cold = false;
  return was;
}

// Awaited before the response returns because Lambda may freeze the process right after; a failed write never fails the visitor.
export async function recordRequest(facts: RequestFacts, put = putEntry): Promise<void> {
  try {
    const entry = sanitize(facts);
    if (!entry) return;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), FEED_WRITE_TIMEOUT_MS);
    });
    await Promise.race([put(entry), deadline]).finally(() => clearTimeout(timer));
  } catch (err) {
    console.error(`feed write failed: ${err instanceof Error ? err.name : 'unknown'}`);
  }
}
