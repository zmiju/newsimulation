import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp, getApps } from 'firebase/app';
import { Analytics, getAnalytics } from 'firebase/analytics';
import { Database, getDatabase } from 'firebase/database';
import { Firestore, getFirestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp;
  readonly analytics: Analytics;
  readonly database: Database;
  readonly firestore: Firestore;

  constructor() {
    this.app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
    this.analytics = getAnalytics(this.app);
    this.database = getDatabase(this.app);
    this.firestore = getFirestore(this.app);
  }
}
