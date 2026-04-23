import { Task } from './task.model';
import { Resource } from './resource.model';
import { Risk, CounterRisk } from './risk.model';

/** Player's plan for a scenario — budget, deadline, task assignments. */
export interface Plan {
  id?: number;
  name?: string;
  tasks: PlanTask[];
  resources: Resource[];
  budget?: number;
  contract?: number;
  deadline?: number;
  counterRisksBought?: number[];
}

/** A task as stored inside a plan (with player-edited start/effort/resources). */
export interface PlanTask {
  id: number;
  start: number;
  effort: number;
  resources: number[];
}

/** Live simulation state for one scenario. */
export interface Simulation {
  tasks: Task[];
  resources: Resource[];
  /** Planned Value (budget that should have been earned by now). */
  pv: number;
  /** Earned Value (budget for work actually completed). */
  ev: number;
  /** Actual Cost (money spent so far). */
  ac: number;
  /** Schedule Performance Index = EV / PV. */
  spi: number;
  /** Cost Performance Index = EV / AC. */
  cpi: number;
  /** Current simulation turn. */
  turn: number;
  /** Current simulation week (derived from turn). */
  week: number;
}

/** Top-level scenario object — what ships in scenario.json plus runtime fields. */
export interface Scenario {
  id: number;
  name: string;
  nameEn?: string;
  description?: string;
  descriptionEn?: string;
  type?: string;
  isRandom?: boolean;
  levelNmb?: number;

  tasks: Task[];
  resources: Resource[];
  /** When present (e.g. random scenarios with >5 tasks), Gantt shows summary rows. */
  taskGroups?: { name: string; taskIds: number[] }[];
  risks?: number[];
  counterRisks?: CounterRisk[];

  multitaskingPenalty: number;
  crashingPenalty: number;

  // Player state -----------------------------------------------------------
  plan?: Plan;
  symulation?: Simulation;
  counterRisksBought?: number[];

  // Result state -----------------------------------------------------------
  result?: ScenarioResult;
}

export interface ScenarioResult {
  points: number;
  spi: number;
  cpi: number;
  /** Planned Value at scenario end. */
  pv: number;
  /** Earned Value at scenario end. */
  ev: number;
  /** Actual Cost at scenario end. */
  ac: number;
  /** Budget At Completion (total planned budget). */
  bac: number;
  budgetPlanned: number;
  budgetActual: number;
  budgetProject: number;
  budgetRisks: number;
  timePlanned: number;
  timeActual: number;
  success: boolean;
}

/** Shape of the scenario JSON file loaded from /assets/config. */
export interface ScenarioBundle {
  projects: Scenario[];
  risks: Risk[];
  counterRisks: CounterRisk[];
}
