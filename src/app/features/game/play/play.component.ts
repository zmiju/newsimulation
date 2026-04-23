import { Component, effect, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { BaseChartDirective, NgChartsModule } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import {
  animate,
  animateChild,
  query,
  stagger,
  style,
  transition,
  trigger,
} from '@angular/animations';

import { SymulatorService } from '@core/services/symulator.service';
import { ConfigService } from '@core/services/config.service';
import { GanttComponent } from '@shared/components/gantt/gantt.component';
import { AnimateOnChangeDirective } from '@shared/directives/animate-on-change.directive';
import { LocalizePipe } from '@shared/pipes/localize.pipe';

@Component({
  selector: 'app-play',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    GanttComponent,
    DragDropModule,
    NgChartsModule,
    AnimateOnChangeDirective,
    LocalizePipe,
  ],
  templateUrl: './play.component.html',
  animations: [
    trigger('metricsStagger', [
      transition(':enter', [
        query(
          '.metric-item',
          [
            style({ opacity: 0, transform: 'translateY(-10px)' }),
            stagger(
              45,
              animate(
                '280ms cubic-bezier(0.2, 0.7, 0.2, 1)',
                style({ opacity: 1, transform: 'translateY(0)' }),
              ),
            ),
          ],
          { optional: true },
        ),
      ]),
    ]),
    trigger('resourcesStagger', [
      transition(':enter', [
        query(
          '[cdkDrag]',
          [
            style({ opacity: 0, transform: 'translateY(8px) scale(0.9)' }),
            stagger(
              55,
              animate(
                '260ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                style({ opacity: 1, transform: 'translateY(0) scale(1)' }),
              ),
            ),
          ],
          { optional: true },
        ),
      ]),
    ]),
    trigger('buttonSwap', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.85)' }),
        animate(
          '180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'scale(1)' }),
        ),
      ]),
      transition(':leave', [
        animate('140ms ease-in', style({ opacity: 0, transform: 'scale(0.85)' })),
      ]),
    ]),
    trigger('riskBackdrop', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [animate('160ms ease-in', style({ opacity: 0 }))]),
    ]),
    trigger('riskPopup', [
      transition(':enter', [
        style({
          opacity: 0,
          transform: 'translate(-50%, -50%) scale(0.7) rotate(-2deg)',
        }),
        animate(
          '320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({
            opacity: 1,
            transform: 'translate(-50%, -50%) scale(1) rotate(0)',
          }),
        ),
      ]),
      transition(':leave', [
        animate(
          '180ms ease-in',
          style({
            opacity: 0,
            transform: 'translate(-50%, -50%) scale(0.9)',
          }),
        ),
      ]),
    ]),
    trigger('simTopEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-24px)' }),
        animate(
          '420ms cubic-bezier(0.2, 0.7, 0.2, 1)',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
    ]),
    trigger('chartEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.9)', transformOrigin: 'top center' }),
        animate(
          '560ms 120ms cubic-bezier(0.2, 0.7, 0.2, 1)',
          style({ opacity: 1, transform: 'scale(1)' }),
        ),
      ]),
    ]),
    trigger('paletteEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate(
          '420ms 200ms cubic-bezier(0.2, 0.7, 0.2, 1)',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
        query('@resourcesStagger', animateChild(), { optional: true }),
      ]),
    ]),
    trigger('ganttEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(32px) scale(0.98)' }),
        animate(
          '620ms 280ms cubic-bezier(0.2, 0.7, 0.2, 1)',
          style({ opacity: 1, transform: 'translateY(0) scale(1)' }),
        ),
      ]),
    ]),
    trigger('pageEnter', [
      transition(':enter', [
        query('@*', animateChild(), { optional: true }),
      ]),
    ]),
  ],
})
export class PlayComponent {
  readonly sym    = inject(SymulatorService);
  readonly config = inject(ConfigService);

  @ViewChild(BaseChartDirective) private chart?: BaseChartDirective;

  // Stable references — Chart.js keeps rendering the same arrays/datasets,
  // so we must mutate these in place (push / length = 0) instead of
  // reassigning, otherwise the chart re-initialises and blinks every tick.
  private readonly pvData:  number[] = [];
  private readonly evData:  number[] = [0];
  private readonly acData:  number[] = [0];
  private readonly labels:  string[] = [];

  readonly lineChartData: ChartData<'line'> = {
    labels: this.labels,
    datasets: [
      {
        label: 'PV',
        data: this.pvData,
        borderColor: '#4a90e2',
        backgroundColor: 'transparent',
        borderDash: [6, 3],
        pointRadius: 0,
        tension: 0.3,
      },
      {
        label: 'EV',
        data: this.evData,
        borderColor: '#4caf50',
        backgroundColor: 'transparent',
        pointRadius: 0,
        tension: 0.3,
      },
      {
        label: 'AC',
        data: this.acData,
        borderColor: '#e74c3c',
        backgroundColor: 'transparent',
        pointRadius: 0,
        tension: 0.3,
      },
    ],
  };

  readonly lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 320,
      easing: 'easeOutQuart',
    },
    animations: {
      y: { duration: 320, easing: 'easeOutQuart' },
    },
    plugins: {
      legend: { position: 'top' },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 20 } },
      y: { beginAtZero: true },
    },
  };

  constructor() {
    // Depend on the scenario signal (its reference changes every tick) rather than
    // the `simulation` computed — that computed returns the same mutated object and
    // therefore doesn't notify, which previously prevented EV/AC from being appended.
    effect(() => {
      const scenario = this.sym.scenario();
      const sim = scenario?.symulation as unknown as
        | { turn: number; time: number; ev: number; ac: number }
        | undefined;
      if (!sim) return;

      if (sim.turn === 0) {
        this.initChart();
        return;
      }

      this.ensureEvmChartPointCapacity();
      // Add a new point whenever simulation crosses the next chart interval.
      const place = Math.floor(sim.time * this.config.chartPointsPerWeek);
      if (place >= this.evData.length) {
        this.evData.push(Math.round(sim.ev));
        this.acData.push(Math.round(sim.ac));
        this.chart?.update();
      }
    });
  }

  get scenario() { return this.sym.scenario(); }
  get sim()      { return this.sym.simulation(); }

  play(): void  { this.sym.play(); }
  pause(): void { this.sym.pause(); }

  generateNew(): void {
    this.sym.pause();
    this.sym.startRandom();
  }

  showResetConfirm = false;

  reset(): void {
    if (this.sym.isStartedNotCompleted()) {
      this.sym.pause();
      this.showResetConfirm = true;
    } else {
      this.sym.reset();
    }
  }

  confirmReset(): void {
    this.showResetConfirm = false;
    this.sym.reset();
  }

  cancelReset(): void {
    this.showResetConfirm = false;
  }

  private wasPlayingBeforeRisk = false;

  fireRisk(): void {
    this.wasPlayingBeforeRisk = this.sym.isPlaying();
    this.sym.pause();
    this.sym.fireRisk();
  }

  closeRiskPopup(): void {
    this.sym.acknowledgeRisk();
    if (this.wasPlayingBeforeRisk) this.sym.play();
    this.wasPlayingBeforeRisk = false;
  }

  get isRiskAvailable(): boolean { return this.sym.isRiskAvailable(); }

  chipTextColor(bgColor: string): string {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 0.5 ? '#1a1a1a' : '#fff';
  }

  /**
   * vs baseline 1.0: ↑ = above 1.0, · ≈ 1.0, ↓ = below 1.0.
   * For speed, above = faster; for cost, above = more expensive (same as desktop).
   */
  resourceTierChar(value: number): string {
    if (value > 1.05) return '↑';
    if (value < 0.95) return '↓';
    return '·';
  }

  private initChart(): void {
    // Rebuild PV and labels at full resolution — mutate in place to keep the
    // same array references the chart is bound to.
    this.pvData.length = 0;
    this.labels.length = 0;
    this.appendPvSegment(0, this.getEvmPointCount());

    // EV and AC start at a single point (0) and grow via push() each tick.
    this.evData.length = 0;
    this.acData.length = 0;
    this.evData.push(0);
    this.acData.push(0);
    this.chart?.update();
  }

  private getEvmPointCount(): number {
    return this.sym.getGanttSpanWeeks() * this.config.chartPointsPerWeek;
  }

  /**
   * Extends PV/labels when the project grows past the initial week span (e.g. longer deadline).
   */
  private ensureEvmChartPointCapacity(): void {
    const need = this.getEvmPointCount();
    if (this.pvData.length >= need) return;
    this.appendPvSegment(this.pvData.length, need);
  }

  private appendPvSegment(from: number, toExclusive: number): void {
    for (let i = from; i < toExclusive; i++) {
      const time = i / this.config.chartPointsPerWeek;
      this.pvData.push(Math.round(this.sym.calculateScenarioPv(time)));
      this.labels.push(Number.isInteger(time) ? `W${time}` : '');
    }
    this.chart?.update();
  }
}
