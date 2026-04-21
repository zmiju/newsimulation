import { Injectable, inject } from '@angular/core';
import { ConfigService, GeneratorLevel } from './config.service';
import { Scenario } from '../models/scenario.model';
import { Task } from '../models/task.model';
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

      this.fixStartTime(scenario, master, slave);
      master.dependants.push(slave.id);
      slave.dependsOn.push(master.id);
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

  private fixStartTime(scenario: Scenario, master: Task, slave: Task): void {
    if (slave.start < master.start + master.effort) {
      slave.start = master.start + master.effort;
      slave.dependants.forEach((id) => {
        this.fixStartTime(scenario, slave, scenario.tasks[id]);
      });
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
    return t1.dependants.includes(t2.id) || t2.dependants.includes(t1.id);
  }

  private areTasksMakingCycle(all: Task[], t1: Task, t2: Task): boolean {
    for (const dependantId of t1.dependants) {
      if (dependantId === t2.id) return true;
      if (this.areTasksMakingCycle(all, all[dependantId], t2)) return true;
    }
    return false;
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
