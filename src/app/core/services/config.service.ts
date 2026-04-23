import { Injectable } from '@angular/core';

/** Generator-level configuration block. */
export interface GeneratorLevel {
  nmb: number;
  tasks: { min: number; max: number };
  dependencies: { min: number; max: number };
  resources: { min: number; max: number };
}

export interface GeneratorConfig {
  multitaskingPenalty: number;
  crashingPenalty: number;
  switchingPenalty: number;
  effort: { min: number; max: number };
  start: { min: number; max: number };
  levels: GeneratorLevel[];
}

/**
 * Central application configuration.
 * Direct port of the original `configService`. Values kept 1:1 so scenario math
 * stays identical to the AngularJS version — do not tweak without intent.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  readonly scenarioUrl = 'assets/config/scenario.json';
  readonly baseEmployeeWeekCost = 100;
  readonly defaultScenarioId = 0;

  readonly resources = {
    fast: 1.2,
    slow: 0.8,
    expensive: 1.2,
    cheap: 0.8,
  };

  readonly maxTimeFactor = 3.0;
  readonly turnsInterval = 100;
  readonly turnsPerWeek = 70;
  readonly chartPointsPerWeek = 5;
  readonly daysInWeek = 5;
  readonly weeksOnGant = 15;
  readonly switchingPenalty = 0.1;

  // Motivation: starts at 1 (max), can fall to 0.1 (min). Per-day rates
  // are converted to per-turn deltas using `daysInWeek / turnsPerWeek`.
  readonly motivationMax = 1;
  readonly motivationMin = 0.1;
  readonly motivationDailyGain = 0.01;
  readonly motivationDailyLoss = 0.01;

  readonly parameterChangeAfterRisk = {
    effort: { from: 0.1, to: 0.4 },
    gone:   { from: 0.1, to: 0.4 },
    cost:   0.2,
    speed:  0.2,
  };

  readonly risksAvailability = [
    { from: 1, to: 2 },
    { from: 4, to: 5 },
  ];

  readonly chart = {
    pvColor: '#83b9ff',
    evColor: '#ff9f15',
    acColor: '#ff0000',
  };

  readonly resourceNames = [
    'Jaś', 'Małgosia', 'Franek', 'Tomek',
    'Karol', 'Adam', 'Agnieszka', 'Krzysztof', 'Rysia',
  ];

  readonly resourceColors = [
    '#00FF00', '#FF6600', '#3366FF',
    '#CC0000', '#FFFF66', '#FF00FF',
    '#FF8690', '#aa20a0', '#e0f0a0',
  ];

  readonly generator: GeneratorConfig = {
    multitaskingPenalty: 0.2,
    crashingPenalty: 0.1,
    switchingPenalty: 0.3,
    effort: { min: 0.2, max: 2 },
    start:  { min: 0,   max: 2 },
    levels: [
      { nmb: 0, tasks: { min: 3,  max: 5  }, dependencies: { min: 1, max: 2 }, resources: { min: 1, max: 3 } },
      { nmb: 1, tasks: { min: 7,  max: 13 }, dependencies: { min: 3, max: 5 }, resources: { min: 3, max: 5 } },
      { nmb: 2, tasks: { min: 12, max: 20 }, dependencies: { min: 5, max: 8 }, resources: { min: 5, max: 8 } },
    ],
  };
}
