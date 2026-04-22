import { Resource } from './resource.model';

export type DependencyType = 'FS' | 'SS' | 'FF';

export interface Dependency {
  id: number;
  type: DependencyType;
}

/** A single unit of work in a scenario. */
export interface Task {
  id: number;
  /** Planned start, in weeks. */
  start: number;
  /** Planned effort, in weeks. */
  effort: number;
  /** Successors: tasks that depend on this one. */
  dependants: Dependency[];
  /** Predecessors: tasks this task depends on. */
  dependsOn: Dependency[];

  // Runtime (simulation) state ---------------------------------------------
  completed?: number;
  resourcesAssigned?: Resource[];
  actualStart?: number;
  actualEnd?: number;
}
