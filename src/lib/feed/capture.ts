import { putEntry } from './store';
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
    if (entry) await put(entry);
  } catch (err) {
    console.error(`feed write failed: ${err instanceof Error ? err.name : 'unknown'}`);
  }
}
