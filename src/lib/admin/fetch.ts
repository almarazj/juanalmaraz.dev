// CloudFront OAC signs requests to the Lambda Function URL, which needs the body hash from the client.
export async function adminFetch(url: string, init: RequestInit & { body?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(init.body));
    headers.set('x-amz-content-sha256', Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''));
  }
  return fetch(url, { ...init, headers });
}
