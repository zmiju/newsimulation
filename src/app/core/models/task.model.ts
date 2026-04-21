import { Resource } from './resource.model';

/** A single unit of work in a scenario. */
export interface Task {
  id: number;
  /** Planned start, in weeks. */
  start: number;
  /** Planned effort, in weeks. */
  effort: number;
  /** IDs of tasks that depend on this one (successors). */
  dependants: number[];
  /** IDs of tasks this task depends on (predecessors). */
  dependsOn: number[];

  // Runtime (simulation) state ---------------------------------------------
  completed?: number;
  resourcesAssigned?: Resource[];
  actualStart?: number;
  actualEnd?: number;
}
