import { describe, expect, it } from 'vitest';
import { resolveFirebaseConfig } from '../../src/lib/firebase';

describe('resolveFirebaseConfig', () => {
  it('uses demo project and bucket under the emulator', () => {
    expect(resolveFirebaseConfig({ FIRESTORE_EMULATOR_HOST: 'localhost:8080' })).toMatchObject({
      emulated: true, projectId: 'demo-juanalmaraz', storageBucket: 'demo-juanalmaraz.appspot.com',
    });
  });
  it('requires project and bucket in production', () => {
    expect(() => resolveFirebaseConfig({})).toThrow(/GOOGLE_CLOUD_PROJECT/);
    expect(() => resolveFirebaseConfig({ GOOGLE_CLOUD_PROJECT: 'p' })).toThrow(/STORAGE_BUCKET/);
    expect(resolveFirebaseConfig({ GOOGLE_CLOUD_PROJECT: 'p', STORAGE_BUCKET: 'p.firebasestorage.app' }))
      .toEqual({ emulated: false, projectId: 'p', storageBucket: 'p.firebasestorage.app' });
  });
});
