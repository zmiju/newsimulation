import { Injectable, inject } from '@angular/core';
import {
  collection, doc, getDocs, setDoc, deleteDoc, addDoc,
  query, orderBy, writeBatch, getDoc, setDoc as fsSetDoc,
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { Scenario, ScenarioBundle } from '../models/scenario.model';
import { Risk, CounterRisk } from '../models/risk.model';

/** A scenario as stored in Firestore — no runtime-only fields. */
export interface FirestoreScenario {
  firestoreId?: string;
  sortOrder: number;
  name: string;
  nameEn?: string;
  description?: string;
  descriptionEn?: string;
  type?: string;
  tasks: unknown[];
  resources: unknown[];
  taskGroups?: { name: string; taskIds: number[] }[];
  risks?: number[];
  counterRisks?: unknown[];
  multitaskingPenalty: number;
  crashingPenalty: number;
}

@Injectable({ providedIn: 'root' })
export class AdminScenarioService {
  private readonly firebase = inject(FirebaseService);

  private get db() { return this.firebase.firestore; }
  private get scenariosCol() { return collection(this.db, 'scenarios'); }
  private get catalogDocRef() { return doc(this.db, 'config', 'catalog'); }

  async getScenarios(): Promise<FirestoreScenario[]> {
    const snap = await getDocs(query(this.scenariosCol, orderBy('sortOrder')));
    return snap.docs.map((d) => ({ ...(d.data() as FirestoreScenario), firestoreId: d.id }));
  }

  async saveScenario(scenario: FirestoreScenario): Promise<string> {
    const { firestoreId, ...data } = scenario;
    // Firestore SDK throws on undefined values — strip them via JSON round-trip.
    const clean = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    if (firestoreId) {
      await setDoc(doc(this.scenariosCol, firestoreId), clean);
      return firestoreId;
    }
    const ref = await addDoc(this.scenariosCol, clean);
    return ref.id;
  }

  async deleteScenario(firestoreId: string): Promise<void> {
    await deleteDoc(doc(this.scenariosCol, firestoreId));
  }

  /** Update sortOrder for all scenarios in a single batch. */
  async reorder(scenarios: FirestoreScenario[]): Promise<void> {
    const batch = writeBatch(this.db);
    scenarios.forEach((s, i) => {
      if (s.firestoreId) {
        batch.update(doc(this.scenariosCol, s.firestoreId), { sortOrder: i });
      }
    });
    await batch.commit();
  }

  /** Import all scenarios (and risks catalog) from a ScenarioBundle. */
  async importBundle(bundle: ScenarioBundle): Promise<void> {
    const existing = await getDocs(this.scenariosCol);
    const deleteBatch = writeBatch(this.db);
    existing.docs.forEach((d) => deleteBatch.delete(d.ref));
    await deleteBatch.commit();

    for (let i = 0; i < bundle.projects.length; i++) {
      const s = bundle.projects[i];
      const { id, plan, symulation, result, counterRisksBought, ...rest } = s as Scenario & { [k: string]: unknown };
      const clean = JSON.parse(JSON.stringify({ ...rest, sortOrder: i })) as Record<string, unknown>;
      await addDoc(this.scenariosCol, clean);
    }

    await fsSetDoc(this.catalogDocRef, {
      risks: bundle.risks ?? [],
      counterRisks: bundle.counterRisks ?? [],
    });
  }

  /** Load the global risks/counterRisks catalog from Firestore. Returns null if not found. */
  async getCatalog(): Promise<{ risks: Risk[]; counterRisks: CounterRisk[] } | null> {
    const snap = await getDoc(this.catalogDocRef);
    if (!snap.exists()) return null;
    return snap.data() as { risks: Risk[]; counterRisks: CounterRisk[] };
  }

  /** Save (overwrite) the global risks/counterRisks catalog. */
  async saveCatalog(risks: Risk[], counterRisks: CounterRisk[]): Promise<void> {
    await fsSetDoc(this.catalogDocRef, { risks, counterRisks });
  }

  toFirestoreScenario(s: Scenario, sortOrder: number): FirestoreScenario {
    const { id, plan, symulation, result, counterRisksBought, ...rest } = s as Scenario & { [k: string]: unknown };
    return { ...(rest as Omit<FirestoreScenario, 'sortOrder'>), sortOrder };
  }
}
