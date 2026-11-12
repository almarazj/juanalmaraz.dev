import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

type Env = Record<string, string | undefined>;
export interface FirebaseConfig { projectId: string; storageBucket: string; emulated: boolean }

export function resolveFirebaseConfig(env: Env): FirebaseConfig {
  const emulated = Boolean(env.FIRESTORE_EMULATOR_HOST);
  if (emulated) {
    return {
      emulated,
      projectId: env.GOOGLE_CLOUD_PROJECT ?? 'demo-juanalmaraz',
      storageBucket: env.STORAGE_BUCKET ?? 'demo-juanalmaraz.appspot.com',
    };
  }
  const projectId = env.GOOGLE_CLOUD_PROJECT;
  const storageBucket = env.STORAGE_BUCKET;
  if (!projectId || !storageBucket) {
    throw new Error('GOOGLE_CLOUD_PROJECT and STORAGE_BUCKET must be set outside the emulator');
  }
  return { emulated, projectId, storageBucket };
}

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const { emulated, ...config } = resolveFirebaseConfig(process.env);
  // Emulators need no credentials; production uses ADC.
  return initializeApp({ ...config, ...(emulated ? {} : { credential: applicationDefault() }) });
}

let firestore: Firestore | undefined;
export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore(app());
    // zod keeps optional keys as undefined, which Firestore would otherwise reject.
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}
export const bucket = () => getStorage(app()).bucket();
export const auth = () => getAuth(app());
