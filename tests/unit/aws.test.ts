import { describe, expect, it, vi } from 'vitest';
import { createSecretStore, resolveAwsConfig } from '../../src/lib/aws';

describe('resolveAwsConfig', () => {
  it('uses local defaults when the DynamoDB endpoint is set', () => {
    expect(resolveAwsConfig({ AWS_ENDPOINT_URL_DYNAMODB: 'http://localhost:8000' })).toEqual({
      region: 'us-east-2',
      table: 'juanalmaraz-site-local',
      bucket: 'juanalmaraz-media-local',
      local: true,
    });
  });

  it('requires table and bucket outside local services', () => {
    expect(() => resolveAwsConfig({})).toThrow('TABLE_NAME and MEDIA_BUCKET must be set outside local services');
  });

  it('reads table and bucket from the environment', () => {
    expect(resolveAwsConfig({ TABLE_NAME: 't', MEDIA_BUCKET: 'b' })).toEqual({
      region: 'us-east-2',
      table: 't',
      bucket: 'b',
      local: false,
    });
  });
});

describe('createSecretStore', () => {
  it('caches a value and shares one in-flight fetch', async () => {
    const fetch = vi.fn(async () => 'v');
    const secret = createSecretStore(fetch);
    const [a, b] = await Promise.all([secret('session-key'), secret('session-key')]);
    expect([a, b, await secret('session-key')]).toEqual(['v', 'v', 'v']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing value', async () => {
    const secret = createSecretStore(async () => '');
    await expect(secret('session-key')).rejects.toThrow('Missing secret session-key');
  });
});
