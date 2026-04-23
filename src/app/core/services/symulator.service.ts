import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

import { ConfigService } from './config.service';
import { ScenarioService } from './scenario.service';
import { ScenarioGeneratorService } from './scenario-generator.service';
import { UserService } from './user.service';
import { RankingService } from './ranking.service';
import { Scenario } from '../models/scenario.model';

/** Shape of a simulation task (runtime). Superset of Task. */
interface SimTask {
  id: number;
  start: number;
  end: number;
  effort: number;
  completed: number;
  isCompleted: boolean;
  pv: number;
  ev: number;
  ac: number;
  resourcesAssigned: SimResource[];
  change?: number;
}

interface SimResource {
  id: number;
  name: string;
  cost: number;
  speed: number;
  color: string;
  turnCorrect: number;
  gone: number;
  /** 0.1..1.0 — drops when multitasking, recovers when focused on a single task. */
  motivation: number;
  [key: string]: unknown; // so risk engine can set arbitrary params like 'effort', 'cost' deltas
}

interface SimulationState {
  tasks: SimTask[];
  resources: SimResource[];
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  spi: number;
  cpi: number;
  deadline: number;
  time: number;
  turn: number;
  risksFired: boolean[];
  nextRisk?: number;
  risk?: FiredRisk;
}

interface FiredRisk {
  id?: number;
  name: string;
  nameEn?: string;
  target: 'resource' | 'task';
  targetId: number | 'random';
  targetEntity?: SimResource | SimTask | undefined;
  type: string;       // 'gone' | 'effort' | 'cost' | 'speed'...
  effect?: '+' | '-';
  amount?: number;
  amountDays?: number;
  time?: number;
  riskId?: number;
  canHaveCounter?: boolean;
  hasCounter?: unknown;
}

/**
 * Core simulation engine — full port of the original `symulatorService`.
 *
 * This is the stateful brain of the app. It owns the "live" scenario object,
 * runs the per-turn tick, calculates EVM metrics, and handles risks.
 *
 * ⚠️  Angular-isms to be aware of:
 *    - `setInterval` is used directly instead of `$interval`. Angular's `NgZone`
 *      keeps change detection running; for tight loops on large scenarios you
 *      may want to `runOutsideAngular` + manual `tick()` — left as a TODO.
 *    - Routing (`$state.go`) was done inside the service in AngularJS. That has
 *      been pulled out to the consumer via `nextScenarioIdRequested$` so the
 *      service stays Router-agnostic and testable.
 */
@Injectable({ providedIn: 'root' })
export class SymulatorService {
  private readonly config     = inject(ConfigService);
  private readonly scenarios  = inject(ScenarioService);
  private readonly generator  = inject(ScenarioGeneratorService);
  private readonly users      = inject(UserService);
  private readonly ranking    = inject(RankingService);
  private readonly translate  = inject(TranslateService);

  // ── Reactive public state ───────────────────────────────────────────────
  private readonly _scenario = signal<Scenario | null>(null);
  /**
   * Bumped on every `setScenario` so `simulation()` signal consumers update even
   * though we mutate the same `symulation` object in place (shallow _scenario
   * spreads keep the same ref to `scenario.symulation`).
   */
  private readonly _simStateRev = signal(0);
  private readonly _isPlaying = signal(false);
  private readonly _isStartedNotCompleted = signal(false);
  private readonly _pendingRisk = signal<FiredRisk | null>(null);

  readonly scenario = this._scenario.asReadonly();
  readonly isPlaying = this._isPlaying.asReadonly();
  readonly isStartedNotCompleted = this._isStartedNotCompleted.asReadonly();
  readonly simulation = computed(() => {
    this._simStateRev();
    return this._scenario()?.symulation as SimulationState | undefined;
  });
  /** The fired risk awaiting user acknowledgement (drives the popup). */
  readonly pendingRisk = this._pendingRisk.asReadonly();

  // ── Internals ──────────────────────────────────────────────────────────
  private scenarioTemplate: Scenario | null = null;
  private lastLevelNmb = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Publishes scenario; bumps revision so `simulation()` and the Gantt re-run on in-place `symulation` updates. */
  private setScenario(scenario: Scenario | null): void {
    this._simStateRev.update((n) => n + 1);
    this._scenario.set(scenario);
  }

  // ── Scenario loading ────────────────────────────────────────────────────

  async startScenario(id: number): Promise<void> {
    this.scenarios.invalidateBundleCache();
    const scenario = await firstValueFrom(this.scenarios.getScenarioById(id));
    if (!scenario) throw new Error(`Scenario ${id} not found`);
    this.scenarioTemplate = scenario;
    this.prepareScenario();

    const restored = this.users.getSavedPlan(id);
    const live = this._scenario();
    if (restored && live?.plan) {
      if (live.type === 'training' && restored.tasks.length === live.plan.tasks.length) {
        live.plan = restored;
        this.setScenario({ ...live });
      } else if (restored.counterRisksBought?.length) {
        live.plan!.counterRisksBought = [...restored.counterRisksBought];
        this.setScenario({ ...live });
      }
    }
  }

  startRandom(levelNmb?: number): void {
    const n = levelNmb ?? this.lastLevelNmb;
    this.scenarioTemplate = this.generator.generateScenario(n);
    this.prepareScenario();
    this.lastLevelNmb = n;
    // Random scenarios don't go through `getScenarioById`, so the shared
    // scenario bundle (which also contains the risks + counter-risks catalog)
    // may never have been fetched. Trigger the load now so `fireRisk()` has
    // risks to pick from when the user presses the Risk button.
    if (!this.scenarios.risks().length) {
      this.scenarios.loadScenarios().subscribe({ error: () => undefined });
    }
  }

  // ── Scenario preparation ────────────────────────────────────────────────

  private prepareScenario(): void {
    if (!this.scenarioTemplate) return;

    const scenario: Scenario = JSON.parse(JSON.stringify(this.scenarioTemplate));
    scenario.plan = {
      tasks: [],
      resources: [],
      counterRisksBought: [],
      deadline: 0,
    };
    (scenario.plan as unknown as Record<string, unknown>)['pv'] = 0;
    (scenario.plan as unknown as Record<string, unknown>)['counterRisks'] = [];

    const sim: SimulationState = {
      tasks: [],
      resources: [],
      pv: 0, ev: 0, ac: 0, bac: 0,
      spi: 1, cpi: 1,
      deadline: 0, time: 0, turn: 0,
      risksFired: [],
    };

    scenario.tasks.forEach((task) => {
      const planTask = {
        id: task.id,
        start: task.start,
        end:   task.start + task.effort,
        effort: task.effort,
        pv: 0,
      };
      scenario.plan!.tasks.push(planTask as unknown as import('../models/scenario.model').PlanTask);

      sim.tasks.push({
        id: task.id,
        start: planTask.start,
        end:   planTask.end,
        effort: planTask.effort,
        completed: 0,
        isCompleted: false,
        pv: 0, ev: 0, ac: 0,
        resourcesAssigned: [],
      });
    });

    scenario.resources.forEach((r) => {
      sim.resources.push({
        id: r.id,
        turnCorrect: 0,
        cost: r.cost,
        speed: r.speed,
        name: r.name,
        color: r.color,
        gone: 0,
        motivation: this.config.motivationMax,
      });
    });

    sim.deadline = this.getTasksTime(scenario.tasks as unknown as SimTask[]);
    scenario.plan!.deadline = sim.deadline;
    scenario.symulation = sim as unknown as typeof scenario.symulation;

    this.setScenario(scenario);

    this.recalculatePlanPV();
    this.recalculatePlanDeadline();

    const live = this._scenario()!;
    const plan = live.plan!;
    // mirror plan.pv / deadline up onto scenario for convenience
    (live as unknown as Record<string, unknown>)['pv']       = (plan as unknown as Record<string, unknown>)['pv'];
    (live as unknown as Record<string, unknown>)['deadline'] = plan.deadline;
    (live.symulation as unknown as SimulationState).bac      = (plan as unknown as Record<string, number>)['pv'];
    live.tasks.forEach((t) => { (t as unknown as Record<string, unknown>)['pv'] = (plan.tasks[t.id] as unknown as Record<string, unknown>)['pv']; });

    // Training mode: clear plan values so the learner fills them in.
    if (live.type === 'training') {
      plan.tasks.forEach((t) => {
        t.start = 0;
        (t as unknown as Record<string, number>)['end'] = 0;
        t.effort = 0;
        (t as unknown as Record<string, number>)['pv'] = 0;
      });
      (plan as unknown as Record<string, number>)['pv'] = 0;
      plan.deadline = 0;
    }

    this.setScenario({ ...live });
  }

  // ── Recalc helpers ──────────────────────────────────────────────────────

  recalculatePlanPV(): void {
    const scenario = this._scenario();
    if (!scenario?.plan) return;
    const plan = scenario.plan as unknown as Record<string, unknown> & {
      tasks: Array<Record<string, number>>;
      counterRisks: number[];
      counterRisksCost: number;
    };
    plan['pv'] = 0;
    plan.tasks.forEach((t) => {
      t['pv'] = t['effort']! * this.config.baseEmployeeWeekCost;
      plan['pv'] = (plan['pv'] as number) + t['pv']!;
    });
    plan.counterRisksCost = 0;
    (plan.counterRisks ?? []).forEach((riskId) => {
      const cr = scenario.counterRisks?.[riskId];
      if (cr?.cost) plan.counterRisksCost += cr.cost;
    });
    this.setScenario({ ...scenario });
  }

  recalculatePlanDeadline(): void {
    const scenario = this._scenario();
    if (!scenario?.plan) return;
    scenario.plan.deadline = this.getTasksTime(scenario.plan.tasks as unknown as SimTask[]);
    this.setScenario({ ...scenario });
  }

  /**
   * Gantt and EVM chart horizontal span (weeks): at least `config.weeksOnGant` (15),
   * widened to fit the plan deadline and current simulation time.
   */
  getGanttSpanWeeks(): number {
    const scenario = this._scenario();
    if (!scenario) return this.config.weeksOnGant;
    const sim = scenario.symulation as SimulationState | undefined;
    const fromPlan =
      scenario.plan?.deadline ??
      (scenario as unknown as { deadline?: number }).deadline ??
      0;
    const time = sim?.time ?? 0;
    return Math.max(this.config.weeksOnGant, Math.ceil(fromPlan), Math.ceil(time), 1);
  }

  /** Copy runtime `sim.tasks` into `plan.tasks` (start/end/effort) and refresh PV. */
  private syncPlanTasksFromSim(): void {
    const scenario = this._scenario();
    if (!scenario?.plan?.tasks || !scenario.symulation) return;
    const sim = scenario.symulation as unknown as SimulationState;
    for (const t of sim.tasks) {
      const pt = scenario.plan!.tasks[t.id] as unknown as { start: number; effort: number; end?: number };
      if (pt) {
        pt.start = t.start;
        pt.effort = t.effort;
        pt.end = t.end;
      }
    }
    this.recalculatePlanPV();
    scenario.plan.deadline = this.getTasksTime(scenario.plan.tasks as unknown as SimTask[]);
  }

  private getTasksTime(tasks: SimTask[]): number {
    let time = 0;
    for (const t of tasks) {
      if (t.end && t.end > time) time = t.end;
    }
    return time;
  }

  // ── Resource/task assignment ────────────────────────────────────────────

  assignResourceToTask(resourceId: number, taskId: number): void {
    const sim = this.simulation();
    if (!sim) return;
    const task = sim.tasks[taskId];
    const resource = sim.resources[resourceId];
    if (task.resourcesAssigned.some((r) => r.id === resource.id)) return;
    task.resourcesAssigned.push(resource);
    if (task.completed > 0) {
      this.addEffortToTask(task, this.config.switchingPenalty);
    }
    this.setScenario({ ...this._scenario()! });
  }

  unassignResourceFromTask(resourceId: number, taskId: number): void {
    const sim = this.simulation();
    if (!sim) return;
    const task = sim.tasks[taskId];
    task.resourcesAssigned = task.resourcesAssigned.filter((r) => r.id !== resourceId);
    this.setScenario({ ...this._scenario()! });
  }

  // ── Playback controls ───────────────────────────────────────────────────

  play(): void {
    this._isPlaying.set(true);
    this._isStartedNotCompleted.set(true);
    this.intervalId = setInterval(() => this.timerTick(), this.config.turnsInterval);
  }

  pause(): void {
    this._isPlaying.set(false);
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  finish(): void { this._isStartedNotCompleted.set(false); }

  reset(): void {
    this.pause();
    const scenario = this._scenario();
    if (!scenario?.symulation) return;

    scenario.result = undefined;
    const sim = scenario.symulation as unknown as SimulationState;
    sim.pv = 0; sim.ev = 0; sim.ac = 0;
    sim.time = 0; sim.turn = 0; sim.bac = 0; sim.spi = 1;
    sim.risksFired = [];

    sim.tasks.forEach((task) => {
      const src = scenario.tasks[task.id];
      task.ev = 0; task.ac = 0;
      task.isCompleted = false;
      task.start = src.start;
      task.end = (src as unknown as Record<string, number>)['end'] ?? src.start + src.effort;
      task.completed = 0;
      task.effort = src.effort;
    });

    const projectDeadline = this.getTasksTime(scenario.tasks as unknown as SimTask[]);
    sim.deadline = projectDeadline;
    if (scenario.plan) {
      scenario.plan.deadline = this.getTasksTime(scenario.plan.tasks as unknown as SimTask[]);
      (scenario as unknown as Record<string, number>)['deadline'] = scenario.plan.deadline;
    }

    sim.resources.forEach((r) => {
      r.motivation = this.config.motivationMax;
      r.turnCorrect = 0;
      r.gone = 0;
    });

    this.syncPlanTasksFromSim();
    sim.bac = (scenario.plan as unknown as Record<string, number>)['pv'] ?? 0;
    this.setScenario({ ...scenario });
  }

  restart(): void { this.prepareScenario(); }

  // ── Tick loop ───────────────────────────────────────────────────────────

  private timerTick(): void {
    const scenario = this._scenario();
    if (!scenario?.symulation) return;
    if (scenario.result) { this.pause(); return; }

    const sim = scenario.symulation as unknown as SimulationState;
    sim.turn++;
    sim.time = sim.turn / this.config.turnsPerWeek;

    this.checkIfRiskHappens();

    let scenarioEv = 0;
    sim.ac = 0;

    sim.tasks.forEach((task) => {
      this.calculateTaskCompletion(task);
    });

    // Project-time slip for every not-yet-done task (including SS/FS-blocked ones):
    // must run after the work pass; if it lived only inside calculateTaskCompletion,
    // tasks that return early on dependency blocks would never slide on the schedule.
    sim.tasks.forEach((task) => {
      this.applyIdleScheduleSlip(task);
    });

    sim.tasks.forEach((task) => {
      task.pv = this.calculateTaskPv(task);
      task.ev = this.calculateTaskEv(task);
      scenarioEv += task.ev;
      sim.ac += task.ac;
    });

    sim.resources.forEach((r) => {
      r.turnCorrect = 0;
      r.gone -= 1 / this.config.turnsPerWeek;
      if (r.gone < 0) r.gone = 0;
      this.updateResourceMotivation(r);
    });

    sim.ev = this.calculateSymulationEv();
    sim.ac = this.calculateSymulationAc();
    sim.pv = this.calculateScenarioPv();
    // BAC is fixed at scenario start (prepareScenario) — do not overwrite with current PV.
    sim.spi = sim.pv ? sim.ev / sim.pv : 1;
    sim.cpi = sim.ac ? sim.ev / sim.ac : 1;

    // Numeric closure: per-tick work + addEffortToTask can leave completed slightly
    // below effort; without this, isCompleted may never flip and the game never ends.
    for (const task of sim.tasks) {
      if (!task.isCompleted && task.effort > 0 && task.completed + 1e-3 >= task.effort) {
        task.isCompleted = true;
      }
    }

    if (this.checkIsGameOver()) {
      this._isStartedNotCompleted.set(false);
      const result = this._scenario()?.result;
      if (result && (result as unknown as Record<string, unknown>)['reason'] === 'completed') {
        const gameType = this.getGameCategory();
        this.ranking.saveScore(gameType, result.points).then(() => {
          this.ranking.refreshRanking(gameType);
        }).catch((err) => console.error('Failed to save ranking score', err));
      }
    }

    this.setScenario({ ...scenario });
  }

  // ── Game-over & scoring ─────────────────────────────────────────────────

  private checkIsGameOver(): boolean {
    const scenario = this._scenario();
    if (!scenario?.symulation) return false;
    const sim = scenario.symulation as unknown as SimulationState;
    const deadline = (scenario as unknown as Record<string, number>)['deadline'] ?? sim.deadline;

    // Win first: if every task is done, end successfully even when calendar time
    // is past the planned window (and avoids ordering bugs with a deadline of 0).
    const allCompleted =
      sim.tasks.length > 0 && sim.tasks.every((t) => t.isCompleted);
    if (allCompleted) {
      scenario.result = {
        success: true,
        points: this.calculatePoints(),
        spi: sim.spi, cpi: sim.cpi,
        pv: sim.pv, ev: sim.ev, ac: sim.ac, bac: sim.bac,
        budgetPlanned: 0, budgetActual: sim.ac, budgetProject: 0, budgetRisks: 0,
        timePlanned: deadline, timeActual: sim.time,
      };
      (scenario.result as unknown as Record<string, unknown>)['failed'] = false;
      (scenario.result as unknown as Record<string, unknown>)['reason'] = 'completed';
      (scenario.result as unknown as Record<string, unknown>)['level']  = scenario.id;
      (scenario.result as unknown as Record<string, unknown>)['time']   = this.getTasksTime(sim.tasks);
      return true;
    }

    if (
      deadline > 0 &&
      sim.time > deadline * this.config.maxTimeFactor
    ) {
      scenario.result = {
        success: false, points: 0,
        spi: sim.spi, cpi: sim.cpi,
        pv: sim.pv, ev: sim.ev, ac: sim.ac, bac: sim.bac,
        budgetPlanned: 0, budgetActual: sim.ac, budgetProject: 0, budgetRisks: 0,
        timePlanned: deadline, timeActual: sim.time,
      };
      (scenario.result as unknown as Record<string, unknown>)['failed'] = true;
      (scenario.result as unknown as Record<string, unknown>)['reason'] = 'time exceeded';
      return true;
    }
    return false;
  }

  private calculatePoints(): number {
    const scenario = this._scenario()!;
    const sim = scenario.symulation as unknown as SimulationState;
    const plannedDuration = scenario.plan?.deadline ?? sim.deadline;
    const actualDuration = this.getTasksTime(sim.tasks) || sim.time || 1;
    return Math.round((sim.cpi * 100) + (plannedDuration / actualDuration) * 100);
  }

  /** Returns a stable string key identifying the current game type for the ranking. */
  getGameCategory(): string {
    const scenario = this._scenario();
    if (!scenario) return 'unknown';
    if (scenario.isRandom) {
      const levels: Record<number, string> = { 0: 'random-easy', 1: 'random-medium', 2: 'random-hard' };
      return levels[scenario.levelNmb ?? 0] ?? 'random-easy';
    }
    return `scenario-${scenario.id}`;
  }

  // ── EVM calculations ────────────────────────────────────────────────────

  calculateTaskPv(task: { id: number }, time?: number): number {
    const scenario = this._scenario();
    if (!scenario?.plan || !scenario.symulation) return 0;
    const sim = scenario.symulation as unknown as SimulationState;
    const t = time ?? sim.time;
    const p = scenario.plan.tasks[task.id] as unknown as { start: number; end: number; pv: number };
    if (t > p.start && t < p.end) {
      return ((t - p.start) / (p.end - p.start)) * p.pv;
    }
    if (t >= p.end) return p.pv;
    return 0;
  }

  calculateScenarioPv(time?: number): number {
    const scenario = this._scenario();
    if (!scenario?.plan) return 0;
    return scenario.plan.tasks.reduce((sum, t) => sum + this.calculateTaskPv(t, time), 0);
  }

  calculateSymulationEv(): number {
    return this.simulation()?.tasks.reduce((s, t) => s + t.ev, 0) ?? 0;
  }

  calculateSymulationAc(): number {
    return this.simulation()?.tasks.reduce((s, t) => s + t.ac, 0) ?? 0;
  }

  private calculateTaskEv(task: SimTask): number {
    const scenario = this._scenario()!;
    const plannedTask = scenario.tasks[task.id] as unknown as { pv: number };
    const ev = plannedTask.pv - (task.effort - task.completed) * this.config.baseEmployeeWeekCost;
    return Math.min(ev, plannedTask.pv);
  }

  // ── Task mechanics (the heart of the simulation) ────────────────────────

  private calculateTaskCompletion(task: SimTask): void {
    const scenario = this._scenario()!;
    const sim = scenario.symulation as unknown as SimulationState;

    let resourcesCount = task.resourcesAssigned.length;
    if (task.isCompleted) return;
    if (task.start > sim.time) return;
    // SS constraint: block this task until every SS predecessor has started.
    if (this.isBlockedBySSPredecessor(task, sim)) return;
    // FS: no work until every FS predecessor has finished (finish-to-start), so a
    // low calendar `start` in the file does not let the task outpace its preds.
    if (this.isBlockedByFSPredecessor(task, sim)) return;

    task.change = 0;
    task.resourcesAssigned.forEach((resource) => {
      const numberOfTasks = this.getNumberOfTasksForResource(resource);
      if (resource.gone > 0) { resourcesCount--; return; }

      let change = resource.speed;
      change -= (numberOfTasks - 1) * scenario.multitaskingPenalty;
      change /= numberOfTasks;
      if (resourcesCount > 0) change -= (resourcesCount - 1) * scenario.crashingPenalty * 0.9;
      change += resource.turnCorrect;
      // Lower motivation slows the resource down proportionally.
      change *= resource.motivation ?? this.config.motivationMax;

      const acChange = resource.cost / numberOfTasks / this.config.turnsPerWeek * this.config.baseEmployeeWeekCost;
      task.ac += acChange;
      (scenario as unknown as Record<string, number>)['ac'] = ((scenario as unknown as Record<string, number>)['ac'] ?? 0) + acChange;
      task.change = (task.change ?? 0) + change;
    });

    if ((task.change ?? 0) < 0) task.change = 0.1;

    if (task.change || task.completed > 0) {
      let penalty = 1 - (task.change ?? 0);
      let toBeAdded = 1;

      toBeAdded /= this.config.turnsPerWeek;
      penalty   /= this.config.turnsPerWeek;

      if (task.completed + toBeAdded > task.effort) {
        const correct = task.completed + toBeAdded - task.effort;
        const correctToBeDistributed = correct * ((task.change ?? 0) * this.config.turnsPerWeek);
        task.resourcesAssigned.forEach((r) => {
          r.turnCorrect = correctToBeDistributed / resourcesCount;
          const acChange = correct / resourcesCount * (r.cost * this.config.baseEmployeeWeekCost);
          task.ac -= acChange;
          (scenario as unknown as Record<string, number>)['ac'] = ((scenario as unknown as Record<string, number>)['ac'] ?? 0) - acChange;
        });
        toBeAdded -= correct;
        task.isCompleted = true;
      }

      task.completed += toBeAdded;
      this.addEffortToTask(task, penalty);
    }
  }

  /**
   * Advance a task's start/end when simulated time has run past where progress
   * should be (same as the old tail of calculateTaskCompletion). Runs for all
   * incomplete tasks so unstaffed or dependency-blocked rows still accrue delay.
   */
  private applyIdleScheduleSlip(task: SimTask): void {
    const scenario = this._scenario();
    if (!scenario?.symulation) return;
    const sim = scenario.symulation as unknown as SimulationState;
    if (task.isCompleted) return;
    if (task.start > sim.time) return;
    const change = (sim.time - task.completed) - task.start;
    if (change > 0) this.moveTaskForward(task, change);
  }

  /**
   * Returns true if any SS predecessor of this task hasn't actually started yet.
   * "Started" means the predecessor has made real progress (completed > 0), not
   * merely that its scheduled start time has been reached.  A task sitting at its
   * start time with no resources has completed === 0 and is not considered started.
   */
  private isBlockedBySSPredecessor(task: SimTask, sim: SimulationState): boolean {
    const scenario = this._scenario()!;
    const taskDef = scenario.tasks[task.id];
    return taskDef.dependsOn.some((dep) => {
      if (dep.type !== 'SS') return false;
      const pred = sim.tasks[dep.id];
      return pred.completed === 0;
    });
  }

  /**
   * FS (default) links: block until the predecessor is fully completed, so
   * scheduled start times can be “as early as other parallel work” without
   * depending on a late `start` week in the JSON to fake the constraint.
   */
  private isBlockedByFSPredecessor(task: SimTask, sim: SimulationState): boolean {
    const scenario = this._scenario()!;
    const taskDef = scenario.tasks[task.id];
    return taskDef.dependsOn.some((dep) => {
      const t = dep.type ?? 'FS';
      if (t !== 'FS') return false;
      return !sim.tasks[dep.id].isCompleted;
    });
  }

  private moveTaskForward(task: SimTask, change: number): void {
    task.start += change;
    task.end   += change;
    this.moveSubTasksForward(task, change, true);
  }

  private addEffortToTask(task: SimTask, change: number): void {
    task.effort += change;
    task.end    += change;
    this.moveSubTasksForward(task, change, false);
  }

  /**
   * Propagate a schedule change to all direct successors, respecting the
   * dependency type of each link:
   *
   *  FS — successor.start  ≥ predecessor.end   (original logic)
   *  SS — successor.start  ≥ predecessor.start  (only when start changed)
   *  FF — successor.end    ≥ predecessor.end    (push via addEffortToTask)
   */
  private moveSubTasksForward(task: SimTask, change: number, startChanged: boolean): void {
    const scenario = this._scenario()!;
    const sim = scenario.symulation as unknown as SimulationState;
    const taskDef = scenario.tasks[task.id];

    taskDef.dependants.forEach((dep) => {
      const sub = sim.tasks[dep.id];

      if (dep.type === 'SS') {
        // SS: only fires when the predecessor's START moved
        if (!startChanged) return;
        const gap = sub.start - task.start;
        if (gap < 0) this.moveTaskForward(sub, -gap);

      } else if (dep.type === 'FF') {
        // FF: successor.end must be ≥ predecessor.end
        if (sub.isCompleted) return;
        const gap = sub.end - task.end;
        if (gap < 0) {
          if (sub.start <= sim.time) {
            // Already running — stretch the end without moving the start.
            this.addEffortToTask(sub, -gap);
          } else {
            // Not yet started — shift the whole task so the end aligns.
            this.moveTaskForward(sub, -gap);
          }
        } else if (gap > 0 && change < 0
          && Math.round(gap * 10000) === -Math.round(change * 10000)) {
          // Symmetric acceleration: predecessor's end just moved earlier and
          // the successor was tightly coupled to it (its end matched the
          // predecessor's previous end → current gap === -change). Pull the
          // successor back by the same amount, mirroring the delay branch.
          if (sub.start <= sim.time) {
            this.addEffortToTask(sub, change);
          } else {
            this.moveTaskForward(sub, change);
          }
        }

      } else {
        // FS (default): successor.start ≥ predecessor.end.
        if (sub.isCompleted) return;
        const needPush = task.end - sub.start;
        if (needPush > 1e-5) {
          // Predecessor end overlaps or crosses successor start — push forward.
          this.moveTaskForward(sub, needPush);
        } else if (needPush < -1e-5 && sub.start > sim.time) {
          // Predecessor finished ahead of schedule and successor hasn't started yet.
          // Pull the successor back to the latest end among ALL its FS predecessors
          // so a merge task (multiple predecessors) never moves before its slowest
          // predecessor finishes.
          const subDef = scenario.tasks[sub.id];
          const latestPredEnd = subDef.dependsOn.reduce((max, dep) => {
            if ((dep.type ?? 'FS') !== 'FS') return max;
            return Math.max(max, sim.tasks[dep.id].end);
          }, 0);
          const targetStart = Math.max(latestPredEnd, sim.time);
          const pullDelta = targetStart - sub.start;
          if (pullDelta < -1e-5) {
            this.moveTaskForward(sub, pullDelta);
          }
        }
      }
    });
  }

  /**
   * How many currently-active tasks (started and not yet completed) the given
   * resource is assigned to. > 1 means the resource is multitasking and is
   * incurring the `multitaskingPenalty`.
   *
   * Public so the UI can flag overloaded resources in the palette.
   */
  getNumberOfTasksForResource(resource: SimResource): number {
    const sim = this.simulation();
    if (!sim) return 0;
    let count = 0;
    sim.tasks.forEach((task) => {
      if (task.isCompleted || task.start > sim.time) return;
      if (this.isBlockedBySSPredecessor(task, sim)) return;
      if (this.isBlockedByFSPredecessor(task, sim)) return;
      task.resourcesAssigned.forEach((r) => { if (r.name === resource.name) count++; });
    });
    return count;
  }

  /** True when the resource is allocated to more than one active task. */
  isResourceOverloaded(resource: SimResource): boolean {
    return this.getNumberOfTasksForResource(resource) > 1;
  }

  /**
   * The resource is not working on any active task: nothing started & incomplete, per
   * {@link getNumberOfTasksForResource}. True when unassigned, only on completed work,
   * or only on not-yet-started tasks — so finishing a task flags the resource as free again.
   */
  isResourceUnallocated(resource: SimResource): boolean {
    return this.getNumberOfTasksForResource(resource) === 0;
  }

  /** At least one resource is currently idle (no active task work). */
  hasUnallocatedResources(): boolean {
    const sim = this.simulation();
    if (!sim?.resources.length) return false;
    return sim.resources.some((r) => this.isResourceUnallocated(r));
  }

  /** At least one resource is on more than one active task ({@link isResourceOverloaded}). */
  hasMultitaskingResources(): boolean {
    const sim = this.simulation();
    if (!sim?.resources.length) return false;
    return sim.resources.some((r) => this.isResourceOverloaded(r));
  }

  /**
   * Adjust motivation once per tick:
   *  • exactly one active task, alone on it → +`motivationDailyGain` per simulated day
   *  • more than one active task OR on a crashed task (multiple resources) → −`motivationDailyLoss` × tasks per simulated day
   *  • zero active tasks → no change (resource is idle)
   * Result is clamped to [`motivationMin`, `motivationMax`].
   */
  private updateResourceMotivation(resource: SimResource): void {
    const tasks = this.getNumberOfTasksForResource(resource);
    const isOnCrashedTask = this.isResourceOnCrashedTask(resource);

    const perTurn = this.config.daysInWeek / this.config.turnsPerWeek;
    const delta = tasks === 0
      ? 0
      : (tasks === 1 && !isOnCrashedTask)
        ? this.config.motivationDailyGain
        : -this.config.motivationDailyLoss * Math.max(tasks, 1);

    let next = (resource.motivation ?? this.config.motivationMax) + delta * perTurn;
    if (next > this.config.motivationMax) next = this.config.motivationMax;
    if (next < this.config.motivationMin) next = this.config.motivationMin;
    resource.motivation = next;
  }

  /** True when the resource is on any active task that has more than one resource assigned. */
  private isResourceOnCrashedTask(resource: SimResource): boolean {
    const sim = this.simulation();
    if (!sim) return false;
    return sim.tasks.some((task) =>
      !task.isCompleted &&
      task.start <= sim.time &&
      !this.isBlockedBySSPredecessor(task, sim) &&
      !this.isBlockedByFSPredecessor(task, sim) &&
      task.resourcesAssigned.length > 1 &&
      task.resourcesAssigned.some((r) => r.name === resource.name)
    );
  }

  /** Resource motivation as a 0..1 progress value (for the UI). */
  getResourceMotivation(resource: { motivation?: number }): number {
    const m = resource.motivation ?? this.config.motivationMax;
    const min = this.config.motivationMin;
    const max = this.config.motivationMax;
    return Math.max(0, Math.min(1, (m - min) / (max - min)));
  }

  /**
   * How many resources are actively working on the given task right now
   * (task started, not completed, and the resource itself is not "gone").
   * > 1 means the task is being crashed and incurs `crashingPenalty`.
   */
  getNumberOfActiveResourcesOnTask(taskId: number): number {
    const sim = this.simulation();
    if (!sim) return 0;
    const task = sim.tasks[taskId];
    if (!task || task.isCompleted) return 0;
    if (task.start > sim.time) return 0;
    if (this.isBlockedBySSPredecessor(task, sim)) return 0;
    if (this.isBlockedByFSPredecessor(task, sim)) return 0;
    let count = 0;
    task.resourcesAssigned.forEach((r) => {
      if ((r.gone ?? 0) <= 0) count++;
    });
    return count;
  }

  /** True when the task has more than one active resource (crashing). */
  isTaskCrashing(taskId: number): boolean {
    return this.getNumberOfActiveResourcesOnTask(taskId) > 1;
  }

  // ── Risk engine ─────────────────────────────────────────────────────────

  isRiskAvailable(): boolean {
    const scenario = this._scenario();
    if (!scenario?.symulation) return false;
    if (scenario.type === 'training') return false;

    const sim = scenario.symulation as unknown as SimulationState;
    for (let i = 0; i < this.config.risksAvailability.length; i++) {
      if (sim.risksFired[i]) continue;
      const r = this.config.risksAvailability[i];
      if (sim.time >= r.from && sim.time <= r.to) {
        sim.nextRisk = i;
        return true;
      }
    }
    return false;
  }

  fireRisk(): FiredRisk | undefined {
    const scenario = this._scenario();
    if (!scenario?.symulation || scenario.type === 'training') return;
    const risks = this.scenarios.risks();
    if (!risks.length) {
      // The risks catalog isn't loaded yet (can happen after a page refresh
      // on a random scenario). Kick off a load and complete the fire once
      // it arrives so the user still gets a popup.
      this.scenarios.loadScenarios().subscribe({
        next: () => {
          if (this.scenarios.risks().length) this.fireRisk();
        },
        error: () => undefined,
      });
      return;
    }
    const randomRisk = risks[Math.floor(Math.random() * risks.length)];
    const newRisk = JSON.parse(JSON.stringify(randomRisk)) as FiredRisk;
    // Only compute the human-readable message + target. The actual impact
    // on the simulation is deferred until `acknowledgeRisk()` is called
    // (i.e. after the user closes the risk popup).
    this.prepareFiredRisk(newRisk);
    const sim = scenario.symulation as unknown as SimulationState;
    sim.risksFired[sim.nextRisk!] = true;
    sim.risk = newRisk;
    this.setScenario({ ...scenario });
    this._pendingRisk.set(newRisk);
    return newRisk;
  }

  /** Apply the pending risk's effect to the simulation and clear it. */
  acknowledgeRisk(): void {
    const risk = this._pendingRisk();
    const scenario = this._scenario();
    if (!risk || !scenario?.symulation) {
      this._pendingRisk.set(null);
      return;
    }
    this.applyFiredRisk(risk);
    const sim = scenario.symulation as unknown as SimulationState;
    sim.risk = undefined;
    this.setScenario({ ...scenario });
    this._pendingRisk.set(null);
  }

  private checkIfRiskHappens(): void {
    const scenario = this._scenario();
    if (!scenario?.symulation || scenario.type !== 'training' || !scenario.counterRisks) return;
    const sim = scenario.symulation as unknown as SimulationState;

    for (const cr of scenario.counterRisks) {
      const crRisk = (cr as unknown as Record<string, unknown>)['risk'] as
        | { time: number; riskId?: number } | undefined;
      if (!crRisk) continue;
      const dif = sim.time - crRisk.time;
      if (dif > 0 && dif < 1 / this.config.turnsPerWeek) {
        const source = crRisk.riskId !== undefined
          ? this.scenarios.risks()[crRisk.riskId]
          : crRisk;
        this.processFiredRisk(JSON.parse(JSON.stringify(source)) as FiredRisk);
      }
    }
  }

  /** Back-compat: prepare + immediately apply (used by the training mode). */
  private processFiredRisk(risk: FiredRisk): void {
    this.prepareFiredRisk(risk);
    this.applyFiredRisk(risk);
    const scenario = this._scenario();
    if (!scenario?.symulation) return;
    const sim = scenario.symulation as unknown as SimulationState;
    sim.risk = risk;
    this.setScenario({ ...scenario });
  }

  /** Resolve the risk's target entity and fill in its display strings. */
  private prepareFiredRisk(risk: FiredRisk): void {
    const scenario = this._scenario();
    if (!scenario?.symulation) return;
    const sim = scenario.symulation as unknown as SimulationState;
    const pc = this.config.parameterChangeAfterRisk;

    if (risk.target === 'resource') {
      risk.targetEntity = risk.targetId === 'random'
        ? sim.resources[Math.floor(Math.random() * sim.resources.length)]
        : sim.resources[risk.targetId as number];
      const resourceName = (risk.targetEntity as SimResource).name;
      risk.name = risk.name.replace(/\{resource\}/g, resourceName);
      if (risk.nameEn) risk.nameEn = risk.nameEn.replace(/\{resource\}/g, resourceName);

      if (risk.type === 'gone') {
        risk.amount     = Math.round((Math.random() * (pc.gone.to - pc.gone.from) + pc.gone.from) * 100) / 100;
        risk.amountDays = Math.round((risk.amount * this.config.daysInWeek) * 10) / 10;
        const days = String(risk.amountDays);
        risk.name = risk.name.replace(/\{amount\}/g, days);
        if (risk.nameEn) risk.nameEn = risk.nameEn.replace(/\{amount\}/g, days);
      }
    } else if (risk.target === 'task') {
      let target: SimTask;
      if (risk.targetId === 'random') {
        do {
          target = sim.tasks[Math.floor(Math.random() * sim.tasks.length)];
        } while (target.isCompleted);
      } else {
        target = sim.tasks[risk.targetId as number];
      }
      risk.targetEntity = target;
      risk.amount     = Math.round((Math.random() * (pc.effort.to - pc.effort.from) + pc.effort.from) * 100) / 100;
      risk.amountDays = Math.round((risk.amount * this.config.daysInWeek) * 10) / 10;
      const taskNum = String(target.id + 1);
      const days    = String(risk.amountDays);
      risk.name = risk.name
        .replace(/\{number\}/g, taskNum)
        .replace(/\{amount\}/g, days);
      if (risk.nameEn) risk.nameEn = risk.nameEn
        .replace(/\{number\}/g, taskNum)
        .replace(/\{amount\}/g, days);
    }

    risk.canHaveCounter = scenario.type === 'training';
    if (risk.canHaveCounter) {
      risk.hasCounter = false;
      const planCR = (scenario.plan as unknown as Record<string, unknown>)['counterRisks'] as number[];
      for (const crId of planCR ?? []) {
        const cr = scenario.counterRisks?.[crId];
        const crRisk = (cr as unknown as Record<string, unknown>)?.['risk'] as
          | { riskId?: number; time?: number } | undefined;
        if (crRisk && ((crRisk.riskId === risk.id) || (crRisk.time !== undefined && crRisk.time === risk.time))) {
          risk.hasCounter = cr;
        }
      }
    }
  }

  /** Mutate the simulation state according to the prepared risk. */
  private applyFiredRisk(risk: FiredRisk): void {
    const pc = this.config.parameterChangeAfterRisk;
    if (risk.hasCounter) return;

    if (risk.target === 'task' && risk.type === 'effort' && risk.targetEntity) {
      const delta = risk.effect === '-' ? -(risk.amount ?? 0) : (risk.amount ?? 0);
      this.addEffortToTask(risk.targetEntity as SimTask, delta);
    } else if (risk.targetEntity) {
      const entity = risk.targetEntity as Record<string, number>;
      if (!entity[risk.type]) entity[risk.type] = 0;
      if (!risk.amount) {
        const v = (pc as unknown as Record<string, number>)[risk.type];
        if (v !== undefined) risk.amount = v;
      }
      if (risk.effect === '-') entity[risk.type] -= risk.amount ?? 0;
      else                     entity[risk.type] += risk.amount ?? 0;
    }
  }

  // ── Navigation helper (replaces $state.go inside the service) ───────────

  /** Called by consumers (components) to decide what "Next" means. */
  goNext(): { kind: 'training' | 'play' | 'random'; scenarioId?: number } {
    const scenario = this._scenario();
    if (!scenario) return { kind: 'random' };
    if (scenario.id !== undefined && scenario.id !== -1 && !scenario.isRandom) {
      return {
        kind: scenario.type === 'training' ? 'training' : 'play',
        scenarioId: scenario.id + 1,
      };
    }
    this.startRandom(this.lastLevelNmb);
    return { kind: 'random' };
  }

  getScenarioName(): string {
    const s = this._scenario();
    if (!s) return '';
    const lang = this.translate.currentLang || this.translate.defaultLang;
    return (lang === 'en' && s.nameEn) ? s.nameEn : s.name;
  }

  getScenarioDescription(): string {
    const s = this._scenario();
    if (!s) return '';
    const lang = this.translate.currentLang || this.translate.defaultLang;
    return (lang === 'en' && s.descriptionEn) ? s.descriptionEn : (s.description ?? '');
  }

  // ── Observable interop (for older consumers) ────────────────────────────
  scenario$(): Observable<Scenario | null> {
    // If needed, bridge signal → RxJS for templates outside standalone components.
    return new Observable((sub) => {
      const emit = () => sub.next(this._scenario());
      emit();
      // NOTE: no unsubscribe wiring needed for signals; emit once on subscribe.
      return () => undefined;
    });
  }
}
