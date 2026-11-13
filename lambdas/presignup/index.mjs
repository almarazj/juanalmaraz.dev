// Cognito pre sign-up trigger: only the owner's Google account may become a user. The app's allowlist stays authoritative.
/**
 * @template {{ request: { userAttributes: { email?: string } } }} E
 * @param {E} event
 * @returns {Promise<E>}
 */
export async function handler(event) {
  const admin = process.env.ADMIN_EMAIL?.toLowerCase();
  const email = event.request.userAttributes.email?.toLowerCase();
  if (!admin || email !== admin) throw new Error('Not allowed');
  return event;
}
