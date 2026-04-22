/** A risk event that may occur during simulation. */
export interface Risk {
  id: number;
  name?: string;
  nameEn?: string;
  description?: string;
  /** IDs of counter-risks that mitigate this risk. */
  counterRisks?: number[];
  /** Probability / impact data from scenario JSON. */
  [key: string]: unknown;
}

/** A mitigation that can be purchased during planning. */
export interface CounterRisk {
  id: number;
  name?: string;
  nameEn?: string;
  description?: string;
  cost?: number;
  [key: string]: unknown;
}
