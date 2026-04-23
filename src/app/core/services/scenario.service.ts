import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, shareReplay, map, of, from, switchMap } from 'rxjs';
import {
  collection, getDocs, query, orderBy, getDoc, doc,
} from 'firebase/firestore';

import { ConfigService } from './config.service';
import { FirebaseService } from './firebase.service';
import {
  Scenario,
  ScenarioBundle,
} from '../models/scenario.model';
import { Risk, CounterRisk } from '../models/risk.model';
import { Dependency, DependencyType, Task } from '../models/task.model';

/**
 * Loads scenarios from Firestore (primary) with automatic fallback to the
 * bundled `scenario.json` when Firestore is empty. This lets the app work
 * out-of-the-box before an admin has imported the catalog, while allowing
 * Firestore to become the single source of truth afterward.
 */
@Injectable({ providedIn: 'root' })
export class ScenarioService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private readonly firebase = inject(FirebaseService);

  private scenarios$?: Observable<Scenario[]>;
  private bundleFetchSeq = 0;

  readonly risks        = signal<Risk[]>([]);
  readonly counterRisks = signal<CounterRisk[]>([]);

  invalidateBundleCache(): void {
    this.scenarios$ = undefined;
    this.bundleFetchSeq++;
  }

  loadScenarios(): Observable<Scenario[]> {
    if (!this.scenarios$) {
      this.scenarios$ = from(this.tryLoadFromFirestore()).pipe(
        switchMap((firestoreResult) => {
          if (firestoreResult) {
            this.risks.set(this.applyIds(firestoreResult.risks));
            this.counterRisks.set(this.applyIds(firestoreResult.counterRisks));
            return of(firestoreResult.scenarios);
          }
          return this.loadFromJson();
        }),
        shareReplay(1),
      );
    }
    return this.scenarios$;
  }

  getAllScenarios(): Observable<Scenario[]> {
    return this.loadScenarios();
  }

  getScenarioById(id: number): Observable<Scenario | undefined> {
    return this.loadScenarios().pipe(map((list) => list[id]));
  }

  getRandomScenario(): Observable<Scenario | undefined> {
    return this.loadScenarios().pipe(map((list) => list[0]));
  }

  getByType(type: string): Observable<Scenario[]> {
    return this.loadScenarios().pipe(
      map((list) => list.filter((s) => s.type === type)),
    );
  }

  // ── Firestore loading ────────────────────────────────────────────────────

  private async tryLoadFromFirestore(): Promise<{
    scenarios: Scenario[];
    risks: Risk[];
    counterRisks: CounterRisk[];
  } | null> {
    try {
      const db = this.firebase.firestore;
      const snap = await getDocs(query(collection(db, 'scenarios'), orderBy('sortOrder')));
      if (snap.empty) return null;

      const raw = snap.docs.map((d) => d.data() as Scenario);
      const scenarios = this.normalizeScenarios(raw);

      // Load global risks catalog from config/catalog if it exists
      let risks: Risk[] = [];
      let counterRisks: CounterRisk[] = [];
      try {
        const catalogSnap = await getDoc(doc(db, 'config', 'catalog'));
        if (catalogSnap.exists()) {
          const catalog = catalogSnap.data() as { risks?: Risk[]; counterRisks?: CounterRisk[] };
          risks = catalog.risks ?? [];
          counterRisks = catalog.counterRisks ?? [];
        }
      } catch {
        // catalog missing — risks stay empty; user can still play without risks
      }

      return { scenarios, risks, counterRisks };
    } catch (err) {
      console.warn('[ScenarioService] Firestore load failed, falling back to JSON', err);
      return null;
    }
  }

  // ── JSON fallback ────────────────────────────────────────────────────────

  private loadFromJson(): Observable<Scenario[]> {
    const sep = this.config.scenarioUrl.includes('?') ? '&' : '?';
    const url = `${this.config.scenarioUrl}${sep}t=${this.bundleFetchSeq}`;
    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache',
      Pragma:         'no-cache',
    });
    return this.http.get<ScenarioBundle>(url, { headers }).pipe(
      map((bundle) => {
        const scenarios = this.normalizeScenarios(bundle.projects);
        this.risks.set(this.applyIds(bundle.risks ?? []));
        this.counterRisks.set(this.applyIds(bundle.counterRisks ?? []));
        return scenarios;
      }),
    );
  }

  // ── Normalization helpers ────────────────────────────────────────────────

  private normalizeScenarios(raw: unknown[]): Scenario[] {
    return raw.map((r, i) => {
      const scenario = this.looksLegacy(r)
        ? this.translateLegacyScenario(r as LegacyScenario)
        : (r as Scenario);
      scenario.id = i;
      if (scenario.tasks)         this.applyIds(scenario.tasks);
      if (scenario.tasks)         this.normalizeDependencies(scenario.tasks);
      if (scenario.resources)     this.applyIds(scenario.resources);
      if (scenario.counterRisks)  this.applyIds(scenario.counterRisks);
      return scenario;
    });
  }

  private applyIds<T extends { id?: number }>(items: T[]): T[] {
    items.forEach((item, i) => (item.id = i));
    return items;
  }

  private normalizeDependencies(tasks: Task[]): void {
    const toDep = (d: number | string | Dependency): Dependency =>
      (typeof d === 'number' || typeof d === 'string') ? { id: Number(d), type: 'FS' } : d;
    tasks.forEach((task) => {
      task.dependants = (task.dependants as unknown as Array<number | string | Dependency>).map(toDep);
      task.dependsOn  = (task.dependsOn  as unknown as Array<number | string | Dependency>).map(toDep);
    });
  }

  private looksLegacy(obj: unknown): obj is LegacyScenario {
    return !!obj && typeof obj === 'object' && 'ProjectNameXML' in (obj as Record<string, unknown>);
  }

  private translateLegacyScenario(scenario: LegacyScenario): Scenario {
    const newScenario: Scenario = {
      id: -1,
      name: scenario.ProjectNameXML,
      description: scenario.ProjectDescriptionXML,
      multitaskingPenalty: scenario.KaraPowtorzenieZasobowXML,
      crashingPenalty: scenario.KaraLiczbaZasobowZadanieXML,
      tasks: [],
      resources: [],
    };

    scenario.Zadanie.forEach((zad) => {
      const task: Task = {
        id: -1,
        start:  zad.I[1] / 50,
        effort: zad.I[2] / 50 - zad.I[1] / 50,
        dependants: [],
        dependsOn:  [],
      };
      if (zad.I[3] !== undefined && zad.I[3] !== null) {
        task.dependants.push({ id: zad.I[3], type: 'FS' });
      }
      newScenario.tasks.push(task);
    });

    newScenario.tasks.forEach((task, i) => {
      task.dependants.forEach((dep) => {
        if (dep.id > newScenario.tasks.length - 1) {
          task.dependants = [];
          return;
        }
        newScenario.tasks[dep.id].dependsOn.push({ id: i, type: 'FS' });
      });
    });

    scenario.Zasob.forEach((zasob, k) => {
      let cost = 1;
      if (zasob.I[0] > 1) cost = this.config.resources.expensive;
      else if (zasob.I[0] < 1) cost = this.config.resources.cheap;

      let speed = 1;
      if (zasob.I[1] > 1) speed = this.config.resources.fast;
      else if (zasob.I[1] < 1) speed = this.config.resources.slow;

      newScenario.resources.push({
        id: -1,
        name: zasob.Nazwa,
        cost,
        speed,
        color: this.config.resourceColors[k] ?? '#cccccc',
      });
    });

    return newScenario;
  }
}

interface LegacyZadanie { I: number[]; }
interface LegacyZasob   { Nazwa: string; I: number[]; }
interface LegacyScenario {
  ProjectNameXML: string;
  ProjectDescriptionXML: string;
  KaraPowtorzenieZasobowXML: number;
  KaraLiczbaZasobowZadanieXML: number;
  IloscZasobowXML?: number;
  IloscZadanXML?: number;
  KwotaXML?: number;
  SzybkoscAnimacjiXML?: number;
  OpoznienieProjektuXML?: number;
  Zadanie: LegacyZadanie[];
  Zasob:   LegacyZasob[];
}
