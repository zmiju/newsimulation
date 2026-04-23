import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp, getApps } from 'firebase/app';
import {
  AppCheck,
  initializeAppCheck,
  ReCaptchaV3Provider,
} from 'firebase/app-check';
import { Analytics, getAnalytics } from 'firebase/analytics';
import { Database, getDatabase } from 'firebase/database';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Auth, getAuth, signInAnonymously } from 'firebase/auth';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp;
  readonly appCheck?: AppCheck;
  readonly analytics: Analytics;
  readonly database: Database;
  readonly firestore: Firestore;
  readonly auth: Auth;

  constructor() {
    this.app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);

    // App Check must be initialized BEFORE Firestore / RTDB / Analytics so the
    // SDK can attach App Check tokens to every outbound request.
    this.appCheck = this.tryInitAppCheck(this.app);

    this.analytics = getAnalytics(this.app);
    this.database = getDatabase(this.app);
    this.firestore = getFirestore(this.app);

    // Sign in anonymously so Firestore rules that require request.auth != null pass.
    // The app uses its own email-based identity (localStorage) for the game UI;
    // this anonymous token is only needed to satisfy Firestore security rules.
    this.auth = getAuth(this.app);
    signInAnonymously(this.auth).catch((err) => {
      console.warn('[FirebaseService] Anonymous sign-in failed', err);
    });
  }

  private tryInitAppCheck(app: FirebaseApp): AppCheck | undefined {
    const siteKey = (environment as { appCheckRecaptchaSiteKey?: string })
      .appCheckRecaptchaSiteKey;
    const debug = (environment as { appCheckDebug?: boolean }).appCheckDebug;

    // Enable debug provider in dev so localhost / ng serve keeps working
    // without a real reCAPTCHA challenge. Copy the printed token from the
    // browser console into Firebase console -> App Check -> Manage debug tokens.
    if (debug) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean })
        .FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    if (!siteKey) {
      // Not configured yet — skip silently so the app still boots.
      return undefined;
    }

    try {
      return initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      console.warn('[FirebaseService] App Check init failed', err);
      return undefined;
    }
  }
}
