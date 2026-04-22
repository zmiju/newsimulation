import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, map, of } from 'rxjs';

import { ConfigService } from './config.service';
import {
  Scenario,
  ScenarioBundle,
} from '../models/scenario.model';
import { Risk, CounterRisk } from '../models/risk.model';
import { Dependency, DependencyType, Task } from '../models/task.model';

/**
 * Loads scenarios (plus risk catalog) from scenario.json once, caches the result,
 * and exposes helpers to fetch individual scenarios. Matches the original
 * `scenarioService` API; ported to RxJS instead of `$q`.
 *
 * NOTE: the `translateScenario` path from the AngularJS service handled an older
 * XML-derived scenario format ("ProjectNameXML", "Zadanie", "Zasob"). It is preserved
 * here but is only invoked for objects that look like that legacy shape.
 */
@Injectable({ providedIn: 'root' })
export class ScenarioService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);

  private scenarios$?: Observable<Scenario[]>;

  readonly risks        = signal<Risk[]>([]);
  readonly counterRisks = signal<CounterRisk[]>([]);

  /** Load-and-cache the full scenario bundle. */
  loadScenarios(): Observable<Scenario[]> {
    if (!this.scenarios$) {
      this.scenarios$ = this.http.get<ScenarioBundle>(this.config.scenarioUrl).pipe(
        map((bundle) => {
          const scenarios = this.normalizeScenarios(bundle.projects);
          this.risks.set(this.applyIds(bundle.risks ?? []));
          this.counterRisks.set(this.applyIds(bundle.counterRisks ?? []));
          return scenarios;
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

  // ── Normalization helpers ────────────────────────────────────────────

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

  /** Convert any legacy `number[]` dependency entries to `Dependency` objects. */
  private normalizeDependencies(tasks: Task[]): void {
    tasks.forEach((task) => {
      task.dependants = (task.dependants as unknown as Array<number | Dependency>).map(
        (d): Dependency => typeof d === 'number' ? { id: d, type: 'FS' } : d,
      );
      task.dependsOn = (task.dependsOn as unknown as Array<number | Dependency>).map(
        (d): Dependency => typeof d === 'number' ? { id: d, type: 'FS' } : d,
      );
    });
  }

  private looksLegacy(obj: unknown): obj is LegacyScenario {
    return !!obj && typeof obj === 'object' && 'ProjectNameXML' in (obj as Record<string, unknown>);
  }

  /**
   * Convert an older XML-style scenario (ProjectNameXML / Zadanie / Zasob) into
   * the modern Scenario shape. Preserved byte-for-byte from the original service.
   */
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

    // Back-link dependencies (dependants -> dependsOn)
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

// Legacy (XML-derived) scenario shape — kept as a local type, not exported.
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
