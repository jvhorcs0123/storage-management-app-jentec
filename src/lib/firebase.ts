import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

const envConfig: FirebaseConfig = {
  apiKey:
    process.env.FIREBASE_STAGING_API_KEY ??
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    "",
  authDomain:
    process.env.FIREBASE_STAGING_AUTH_DOMAIN ??
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    "",
  projectId:
    process.env.FIREBASE_STAGING_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    "",
  storageBucket:
    process.env.FIREBASE_STAGING_STORAGE_BUCKET ??
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "",
  messagingSenderId:
    process.env.FIREBASE_STAGING_MESSAGING_SENDER_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
    "",
  appId:
    process.env.FIREBASE_STAGING_APP_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
    "",
  measurementId:
    process.env.FIREBASE_STAGING_MEASUREMENT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ??
    "",
};

const injectedConfig = (globalThis as { firebaseConfig?: FirebaseConfig })
  .firebaseConfig;

const firebaseConfig = injectedConfig ?? envConfig;

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// In the browser, keep a local cache (IndexedDB, shared across tabs) so a
// listener reopened within ~30 minutes is billed only for documents that
// changed, not the whole result again. The server render has no IndexedDB.
function createFirestore(): Firestore {
  if (typeof window === "undefined") return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Already initialized (e.g. after a hot reload).
    return getFirestore(app);
  }
}

export const db = createFirestore();
