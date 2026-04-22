import { Injectable, inject } from '@angular/core';
import { ConfigService, GeneratorLevel } from './config.service';
import { Scenario } from '../models/scenario.model';
import { Task } from '../models/task.model';
import { Dependency, DependencyType } from '../models/task.model';
import { Resource } from '../models/resource.model';

/**
 * Generates random scenarios at a given difficulty level.
 * Direct port of the original `scenarioGeneratorService`.
 */
@Injectable({ providedIn: 'root' })
export class ScenarioGeneratorService {
  private readonly config = inject(ConfigService);

  generateScenario(levelNmb: number): Scenario {
    const level = this.config.generator.levels[levelNmb];
    const effortRange = this.config.generator.effort;
    const startRange  = this.config.generator.start;

    const scenario = this.generateEmptyScenario();
    scenario.levelNmb = levelNmb;

    // Tasks -----------------------------------------------------------------
    const taskCount = this.randomInt(level.tasks);
    for (let i = 0; i < taskCount; i++) {
      scenario.tasks.push({
        id: i,
        effort: this.randomNum(effortRange),
        start:  this.randomNum(startRange),
        dependants: [],
        dependsOn:  [],
      });
    }

    // Dependencies ---------------------------------------------------------
    const depCount = this.randomInt(level.dependencies);
    for (let i = 0; i < depCount; i++) {
      let a = 0, b = 0;
      let guard = 0;
      do {
        a = this.randomInt({ min: 0, max: scenario.tasks.length - 1 });
        b = this.randomInt({ min: 0, max: scenario.tasks.length - 1 });
        if (++guard > 1000) break; // safety
      } while (a === b || this.areTasksAlreadyDependent(scenario.tasks[a], scenario.tasks[b]));

      let master = scenario.tasks[a];
      let slave  = scenario.tasks[b];
      if (master.start <= slave.start) { const t = master; master = slave; slave = t; }

      if (this.areTasksMakingCycle(scenario.tasks, master, slave)) { i--; continue; }

      // ~50% FS, ~25% SS, ~25% FF
      const depType = this.randomDepType();

      this.fixStartTime(scenario, master, slave, depType);
      master.dependants.push({ id: slave.id, type: depType });
      slave.dependsOn.push({ id: master.id, type: depType });
    }

    // Resources ------------------------------------------------------------
    const resourceCount = this.randomInt(level.resources);
    for (let i = 0; i < resourceCount; i++) {
      const resource: Resource = {
        id: i,
        speed: this.randomSpeed(),
        cost:  this.randomCost(),
        color: this.config.resourceColors[i] ?? '#cccccc',
        name:  this.config.resourceNames[i]   ?? `R${i}`,
      };
      scenario.resources.push(resource);
    }

    this.normalizeStartTime(scenario);
    return scenario;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private fixStartTime(scenario: Scenario, master: Task, slave: Task, depType: DependencyType): void {
    if (depType === 'FS') {
      if (slave.start < master.start + master.effort) {
        slave.start = master.start + master.effort;
        slave.dependants.forEach((dep) => {
          this.fixStartTime(scenario, slave, scenario.tasks[dep.id], dep.type);
        });
      }
    } else if (depType === 'SS') {
      if (slave.start < master.start) {
        slave.start = master.start;
        slave.dependants.forEach((dep) => {
          this.fixStartTime(scenario, slave, scenario.tasks[dep.id], dep.type);
        });
      }
    } else {
      // FF: slave.end >= master.end
      const masterEnd = master.start + master.effort;
      const slaveEnd  = slave.start + slave.effort;
      if (slaveEnd < masterEnd) {
        slave.start += masterEnd - slaveEnd;
        slave.dependants.forEach((dep) => {
          this.fixStartTime(scenario, slave, scenario.tasks[dep.id], dep.type);
        });
      }
    }
  }

  private generateEmptyScenario(): Scenario {
    return {
      id: -1,
      name: '',
      tasks: [],
      resources: [],
      counterRisks: [],
      isRandom: true,
      multitaskingPenalty: this.config.generator.multitaskingPenalty,
      crashingPenalty:     this.config.generator.crashingPenalty,
    };
  }

  private normalizeStartTime(scenario: Scenario): void {
    if (scenario.tasks.length === 0) return;
    let min = scenario.tasks[0].start;
    scenario.tasks.forEach((t) => { if (t.start < min) min = t.start; });
    scenario.tasks.forEach((t) => (t.start -= min));
  }

  private areTasksAlreadyDependent(t1: Task, t2: Task): boolean {
    return t1.dependants.some((d) => d.id === t2.id) || t2.dependants.some((d) => d.id === t1.id);
  }

  private areTasksMakingCycle(all: Task[], t1: Task, t2: Task): boolean {
    for (const dep of t1.dependants) {
      if (dep.id === t2.id) return true;
      if (this.areTasksMakingCycle(all, all[dep.id], t2)) return true;
    }
    return false;
  }

  private randomDepType(): DependencyType {
    const r = Math.random();
    if (r < 0.5) return 'FS';
    if (r < 0.75) return 'SS';
    return 'FF';
  }

  private randomSpeed(): number {
    const r = this.randomInt({ min: -1, max: 1 });
    if (r > 0) return this.config.resources.fast;
    if (r < 0) return this.config.resources.slow;
    return 1;
  }

  private randomCost(): number {
    const r = this.randomInt({ min: -1, max: 1 });
    if (r > 0) return this.config.resources.expensive;
    if (r < 0) return this.config.resources.cheap;
    return 1;
  }

  private randomInt(range: GeneratorLevel['tasks'] | { min: number; max: number }): number {
    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  }

  private randomNum(range: { min: number; max: number }): number {
    return Math.random() * (range.max - range.min) + range.min;
  }
}
