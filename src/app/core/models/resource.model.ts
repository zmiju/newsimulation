/** A person (or team) that can be assigned to tasks. */
export interface Resource {
  id: number;
  name: string;
  /** Relative cost multiplier: cheap < 1, normal = 1, expensive > 1. */
  cost: number;
  /** Relative speed multiplier: slow < 1, normal = 1, fast > 1. */
  speed: number;
  color: string;

  // Runtime state ----------------------------------------------------------
  tasksHistory?: Record<number, boolean>;
}
