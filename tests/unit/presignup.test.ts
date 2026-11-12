import { afterEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../../lambdas/presignup/index.mjs';

const event = (email?: string) => ({
  triggerSource: 'PreSignUp_ExternalProvider',
  request: { userAttributes: email === undefined ? {} : { email } },
  response: {},
});
afterEach(() => vi.unstubAllEnvs());

describe('pre sign-up trigger', () => {
  it('lets the owner through in any case', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'Owner@Example.com');
    const e = event('OWNER@example.COM');
    await expect(handler(e)).resolves.toBe(e);
  });

  it('rejects anyone else', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'owner@example.com');
    await expect(handler(event('someone@example.com'))).rejects.toThrow('Not allowed');
    await expect(handler(event())).rejects.toThrow('Not allowed');
  });

  it('fails closed without ADMIN_EMAIL', async () => {
    vi.stubEnv('ADMIN_EMAIL', '');
    await expect(handler(event(''))).rejects.toThrow('Not allowed');
  });
});
