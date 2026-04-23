import {
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import {
  animate,
  keyframes,
  query,
  stagger,
  style,
  transition,
  trigger,
} from '@angular/animations';

import { ScenarioResult } from '@core/models/scenario.model';

@Component({
  selector: 'app-game-over-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  animations: [
    trigger('popIn', [
      transition(':enter', [
        style({
          opacity: 0,
          transform: 'translate(-50%, -50%) scale(0.7) translateY(20px)',
        }),
        animate(
          '420ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({
            opacity: 1,
            transform: 'translate(-50%, -50%) scale(1) translateY(0)',
          }),
        ),
      ]),
      transition(':leave', [
        animate(
          '180ms ease-in',
          style({
            opacity: 0,
            transform: 'translate(-50%, -50%) scale(0.92)',
          }),
        ),
      ]),
    ]),
    trigger('backdrop', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [animate('160ms ease-in', style({ opacity: 0 }))]),
    ]),
    trigger('statsStagger', [
      transition(':enter', [
        query(
          '.stat-card',
          [
            style({ opacity: 0, transform: 'translateY(12px)' }),
            stagger(
              70,
              animate(
                '320ms cubic-bezier(0.2, 0.7, 0.2, 1)',
                style({ opacity: 1, transform: 'translateY(0)' }),
              ),
            ),
          ],
          { optional: true },
        ),
      ]),
    ]),
    trigger('iconPop', [
      transition(':enter', [
        animate(
          '900ms 120ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          keyframes([
            style({ opacity: 0, transform: 'scale(0) rotate(-120deg)', offset: 0 }),
            style({ opacity: 1, transform: 'scale(1.25) rotate(10deg)', offset: 0.6 }),
            style({ opacity: 1, transform: 'scale(1) rotate(0)', offset: 1 }),
          ]),
        ),
      ]),
    ]),
    trigger('pointsCount', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-50%) scale(0.4)' }),
        animate(
          '500ms 160ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'translateX(-50%) scale(1)' }),
        ),
      ]),
    ]),
  ],
  template: `
    <div class="summary-backdrop" (click)="onRestart()" @backdrop></div>

    <div class="summary-dialog"
         [class.summary-dialog--fail]="!result.success"
         role="dialog"
         aria-modal="true"
         @popIn>

      <div class="summary-header">
        <div class="summary-header__glow"></div>
        <div class="summary-header__icon" @iconPop>
          <span class="summary-header__emoji">{{ result.success ? '🏆' : '⚠' }}</span>
        </div>
        <h4 class="summary-header__title">
          @if (result.success) {
            {{ 'GAME-OVER-modal_title' | translate }}
          } @else {
            {{ 'GAME-OVER-FAILED_modal_title' | translate }}
          }
        </h4>
        <p class="summary-header__subtitle">
          @if (result.success) {
            {{ 'GAME-OVER-modal_content' | translate }}
          } @else {
            {{ 'GAME-OVER-FAILED_modal_content' | translate }}
          }
        </p>
      </div>

      @if (result.success) {
        <div class="summary-score" @pointsCount>
          <span class="summary-score__label">
            {{ 'GAME-OVER-modal_score' | translate }}
          </span>
          <span class="summary-score__value">
            {{ result.points | number:'1.0-0' }}
            <small>{{ 'pts' | translate }}</small>
          </span>
        </div>
      }

      <div class="summary-grid" @statsStagger>
        <div class="stat-card stat-card--pv">
          <span class="stat-card__label">{{ 'SIMULATION_pv' | translate }}</span>
          <span class="stat-card__value">{{ result.pv | number:'1.0-0' }}</span>
          <span class="stat-card__hint">{{ 'SUMMARY_pv_hint' | translate }}</span>
        </div>

        <div class="stat-card stat-card--ev"
             [class.stat-card--positive]="result.ev >= result.pv">
          <span class="stat-card__label">{{ 'SIMULATION_ev' | translate }}</span>
          <span class="stat-card__value">{{ result.ev | number:'1.0-0' }}</span>
          <span class="stat-card__hint">{{ 'SUMMARY_ev_hint' | translate }}</span>
        </div>

        <div class="stat-card stat-card--ac"
             [class.stat-card--negative]="result.ac > result.ev">
          <span class="stat-card__label">{{ 'SIMULATION_ac' | translate }}</span>
          <span class="stat-card__value">{{ result.ac | number:'1.0-0' }}</span>
          <span class="stat-card__hint">{{ 'SUMMARY_ac_hint' | translate }}</span>
        </div>

        <div class="stat-card stat-card--index stat-card--spi"
             [class.stat-card--positive]="result.spi >= 1"
             [class.stat-card--negative]="result.spi < 0.95">
          <span class="stat-card__label">{{ 'SIMULATION_spi' | translate }}</span>
          <span class="stat-card__value">{{ result.spi | number:'1.2-2' }}</span>
          <span class="stat-card__hint">
            {{ spiVerdict() | translate }}
          </span>
          <div class="stat-card__bar">
            <div class="stat-card__bar-fill"
                 [style.width.%]="indexBarWidth(result.spi)"
                 [style.background]="indexBarColor(result.spi)"></div>
          </div>
        </div>

        <div class="stat-card stat-card--index stat-card--cpi"
             [class.stat-card--positive]="result.cpi >= 1"
             [class.stat-card--negative]="result.cpi < 0.95">
          <span class="stat-card__label">{{ 'SIMULATION_cpi' | translate }}</span>
          <span class="stat-card__value">{{ result.cpi | number:'1.2-2' }}</span>
          <span class="stat-card__hint">
            {{ cpiVerdict() | translate }}
          </span>
          <div class="stat-card__bar">
            <div class="stat-card__bar-fill"
                 [style.width.%]="indexBarWidth(result.cpi)"
                 [style.background]="indexBarColor(result.cpi)"></div>
          </div>
        </div>

        <div class="stat-card stat-card--index stat-card--dur"
             [class.stat-card--positive]="durationRatio() <= 100"
             [class.stat-card--negative]="durationRatio() > 105">
          <span class="stat-card__label">{{ 'SUMMARY_duration_label' | translate }}</span>
          <span class="stat-card__value">{{ durationRatio() | number:'1.0-0' }}%</span>
          <span class="stat-card__hint">
            {{ durationVerdict() | translate }}
          </span>
          <div class="stat-card__bar">
            <div class="stat-card__bar-fill"
                 [style.width.%]="durationBarWidth()"
                 [style.background]="durationBarColor()"></div>
          </div>
        </div>
      </div>

      <div class="summary-secondary">
        <div class="summary-secondary__item">
          <span class="summary-secondary__label">
            {{ 'GAME-OVER-modal_time_planned' | translate }}
          </span>
          <span class="summary-secondary__value">
            {{ result.timePlanned | number:'1.2-2' }}
            <small>{{ 'PLAN_week' | translate }}</small>
          </span>
        </div>
        <div class="summary-secondary__divider"></div>
        <div class="summary-secondary__item">
          <span class="summary-secondary__label">
            {{ 'GAME-OVER-modal_time_actual' | translate }}
          </span>
          <span class="summary-secondary__value"
                [class.summary-secondary__value--late]="result.timeActual > result.timePlanned">
            {{ result.timeActual | number:'1.2-2' }}
            <small>{{ 'PLAN_week' | translate }}</small>
          </span>
        </div>
      </div>

      <div class="summary-footer">
        <button class="btn btn-outline-secondary btn-sm btn-animated"
                (click)="onRestart()">
          {{ 'GAME-OVER-modal_restart' | translate }}
        </button>
        <button class="btn btn-primary btn-sm btn-animated"
                (click)="onNext()">
          {{ 'GAME-OVER-modal_next' | translate }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: contents; }

      .summary-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.55);
        z-index: 2000;
        backdrop-filter: blur(2px);
      }

      .summary-dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 2001;
        width: min(520px, 92vw);
        max-height: 92vh;
        overflow: auto;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        color: #0f172a;
      }

      .summary-header {
        position: relative;
        padding: 28px 24px 22px;
        text-align: center;
        background: linear-gradient(135deg, #16a34a 0%, #22c55e 55%, #4ade80 100%);
        color: #ffffff;
        overflow: hidden;
      }
      .summary-dialog--fail .summary-header {
        background: linear-gradient(135deg, #b91c1c 0%, #dc2626 55%, #f87171 100%);
      }
      .summary-header__glow {
        position: absolute;
        inset: -40% -10% auto -10%;
        height: 160%;
        background: radial-gradient(circle at 50% 0%,
                    rgba(255, 255, 255, 0.35) 0%,
                    rgba(255, 255, 255, 0) 60%);
        pointer-events: none;
      }
      .summary-header__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.18);
        backdrop-filter: blur(4px);
        margin-bottom: 10px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      }
      .summary-header__emoji {
        font-size: 30px;
        line-height: 1;
      }
      .summary-header__title {
        margin: 0 0 4px;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: #ffffff;
      }
      .summary-header__subtitle {
        margin: 0 auto;
        font-size: 13px;
        opacity: 0.92;
        max-width: 420px;
        line-height: 1.4;
      }

      .summary-score {
        margin: -18px auto 0;
        position: relative;
        z-index: 1;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 28px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
        left: 50%;
        transform: translateX(-50%);
      }
      .summary-score__label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      .summary-score__value {
        font-size: 34px;
        font-weight: 800;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
      }
      .summary-score__value small {
        font-size: 13px;
        font-weight: 600;
        color: #64748b;
        margin-left: 4px;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        padding: 24px 20px 4px;
      }

      .stat-card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 12px 12px 10px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease,
          border-color 0.2s ease;
      }
      .stat-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
      }
      .stat-card__label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
      }
      .stat-card__value {
        font-size: 22px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
        color: #0f172a;
      }
      .stat-card__hint {
        font-size: 11px;
        color: #94a3b8;
      }

      .stat-card--pv { border-top: 3px solid #4a90e2; }
      .stat-card--pv .stat-card__value { color: #1d4ed8; }
      .stat-card--ev { border-top: 3px solid #16a34a; }
      .stat-card--ev .stat-card__value { color: #15803d; }
      .stat-card--ac { border-top: 3px solid #dc2626; }
      .stat-card--ac .stat-card__value { color: #b91c1c; }

      .stat-card--index .stat-card__value {
        font-size: 26px;
      }
      .stat-card--spi,
      .stat-card--cpi,
      .stat-card--dur {
        grid-column: span 3 / span 3;
      }
      @media (min-width: 420px) {
        .stat-card--spi { grid-column: span 1 / span 1; }
        .stat-card--cpi { grid-column: span 1 / span 1; }
        .stat-card--dur { grid-column: span 1 / span 1; }
      }

      .stat-card--spi { border-top: 3px solid #f59e0b; }
      .stat-card--spi .stat-card__value { color: #b45309; }
      .stat-card--cpi { border-top: 3px solid #0ea5e9; }
      .stat-card--cpi .stat-card__value { color: #0369a1; }
      .stat-card--dur { border-top: 3px solid #6366f1; }
      .stat-card--dur .stat-card__value { color: #4338ca; }

      .stat-card--positive {
        background: linear-gradient(180deg, #ecfdf5 0%, #ffffff 100%);
        border-color: #86efac;
      }
      .stat-card--positive .stat-card__value { color: #15803d; }

      .stat-card--negative {
        background: linear-gradient(180deg, #fef2f2 0%, #ffffff 100%);
        border-color: #fca5a5;
      }
      .stat-card--negative .stat-card__value { color: #b91c1c; }

      .stat-card__bar {
        margin-top: 8px;
        height: 6px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.08);
        overflow: hidden;
      }
      .stat-card__bar-fill {
        height: 100%;
        border-radius: 999px;
        transition: width 600ms cubic-bezier(0.2, 0.7, 0.2, 1) 200ms;
      }

      .summary-secondary {
        display: flex;
        align-items: center;
        justify-content: space-around;
        margin: 14px 20px 4px;
        padding: 12px 16px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
      }
      .summary-secondary__item {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        text-align: center;
      }
      .summary-secondary__label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      .summary-secondary__value {
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
      }
      .summary-secondary__value small {
        font-size: 11px;
        font-weight: 500;
        color: #64748b;
        margin-left: 3px;
      }
      .summary-secondary__value--late { color: #b91c1c; }
      .summary-secondary__divider {
        width: 1px;
        height: 30px;
        background: #e2e8f0;
      }

      .summary-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 20px 20px;
      }

      .btn-animated {
        transition:
          transform 0.12s ease,
          box-shadow 0.18s ease,
          filter 0.18s ease;
      }
      .btn-animated:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
        filter: brightness(1.05);
      }
      .btn-animated:active:not(:disabled) {
        transform: translateY(0) scale(0.97);
      }
    `,
  ],
})
export class GameOverDialogComponent {
  @Input({ required: true }) result!: ScenarioResult;
  @Output() restart = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  onRestart(): void { this.restart.emit(); }
  onNext(): void    { this.next.emit(); }

  /** Scale SPI / CPI to a 0–100% bar, anchored at 1.0 in the middle. */
  indexBarWidth(value: number | undefined): number {
    if (value === undefined || Number.isNaN(value)) return 0;
    const clamped = Math.max(0, Math.min(2, value));
    return (clamped / 2) * 100;
  }

  indexBarColor(value: number | undefined): string {
    if (value === undefined) return '#94a3b8';
    if (value >= 1)    return 'linear-gradient(90deg, #22c55e, #16a34a)';
    if (value >= 0.95) return 'linear-gradient(90deg, #f59e0b, #d97706)';
    return 'linear-gradient(90deg, #ef4444, #b91c1c)';
  }

  spiVerdict(): string {
    const v = this.result.spi;
    if (v >= 1)    return 'SUMMARY_spi_ahead';
    if (v >= 0.95) return 'SUMMARY_spi_slight';
    return 'SUMMARY_spi_behind';
  }

  cpiVerdict(): string {
    const v = this.result.cpi;
    if (v >= 1)    return 'SUMMARY_cpi_under';
    if (v >= 0.95) return 'SUMMARY_cpi_slight';
    return 'SUMMARY_cpi_over';
  }

  /** Actual duration as % of baseline (e.g. 120 means 20% over the plan). */
  durationRatio(): number {
    const planned = this.result.timePlanned;
    const actual  = this.result.timeActual;
    if (!planned || Number.isNaN(planned)) return 0;
    return (actual / planned) * 100;
  }

  durationVerdict(): string {
    const v = this.durationRatio();
    if (v <= 100) return 'SUMMARY_duration_on_time';
    if (v <= 105) return 'SUMMARY_duration_slight';
    return 'SUMMARY_duration_late';
  }

  /** Map duration ratio (%) to a 0–100% bar; 100% (on plan) sits in the middle. */
  durationBarWidth(): number {
    const v = this.durationRatio();
    if (!v) return 0;
    const clamped = Math.max(0, Math.min(200, v));
    return (clamped / 200) * 100;
  }

  durationBarColor(): string {
    const v = this.durationRatio();
    if (!v) return '#94a3b8';
    if (v <= 100) return 'linear-gradient(90deg, #22c55e, #16a34a)';
    if (v <= 105) return 'linear-gradient(90deg, #f59e0b, #d97706)';
    return 'linear-gradient(90deg, #ef4444, #b91c1c)';
  }
}
