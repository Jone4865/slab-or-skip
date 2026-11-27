import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import { DEFAULT_FEES, parseFeeTable, type FeeTable } from './domain/fees';

// Public web config (identifiers, not secrets). Access is protected by App Check.
const firebaseConfig = {
  apiKey: 'AIzaSyB1uDVuF0sNP_b8OCpdf3B5r_avzmClfuA',
  authDomain: 'slab-or-skip.firebaseapp.com',
  projectId: 'slab-or-skip',
  storageBucket: 'slab-or-skip.firebasestorage.app',
  messagingSenderId: '826120086361',
  appId: '1:826120086361:web:5c7335951b3021fa3a2248',
};

export const app = initializeApp(firebaseConfig);

// App Check is enforced for Firebase AI Logic. Local dev uses a debug token that never
// ships in production builds; the hosted app uses reCAPTCHA v3.
const debugToken = import.meta.env.DEV ? import.meta.env.VITE_APPCHECK_DEBUG_TOKEN : undefined;
if (debugToken) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
// reCAPTCHA (Essentials tier, score-based) proves requests come from this site. The site key is public by
// design; it only works on the domains registered for it (the GitHub Pages host and localhost).
const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '6LeUnTQuAAAAACBi4GoqGqifwrHTTEBEk_Tvv-yt';
export const appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });

// Remote Config: grading fees change often, so they live server-side with a safe default.
const rc = getRemoteConfig(app);
rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 60_000 : 3_600_000;
rc.defaultConfig = {
  grading_fees_json: JSON.stringify(DEFAULT_FEES),
  cloud_model: 'gemini-3.5-flash-lite',
};

export interface RuntimeConfig {
  fees: FeeTable;
  cloudModel: string;
  source: 'remote' | 'default';
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  let source: RuntimeConfig['source'] = 'default';
  try {
    await Promise.race([fetchAndActivate(rc), new Promise((_, rej) => setTimeout(() => rej(new Error('rc timeout')), 4000))]);
    source = getValue(rc, 'grading_fees_json').getSource() === 'remote' ? 'remote' : 'default';
  } catch {
    // Offline or blocked: keep defaults.
  }
  return {
    fees: parseFeeTable(getValue(rc, 'grading_fees_json').asString()),
    cloudModel: getValue(rc, 'cloud_model').asString() || 'gemini-3.5-flash-lite',
    source,
  };
}
