import { Component, OnInit, OnDestroy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterOutlet, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { SymulatorService } from '@core/services/symulator.service';
import { ConfigService } from '@core/services/config.service';
import { UserService } from '@core/services/user.service';
import { GameOverDialogComponent } from '@shared/components/game-over-dialog/game-over-dialog.component';
import { RankingComponent } from '@shared/components/ranking/ranking.component';

/**
 * Replaces gameController. Loads the scenario by route param, owns the
 * chart state, and reacts to scenario.result for the game-over flow.
 */
@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TranslateModule, GameOverDialogComponent, RankingComponent],
  template: `
    <div class="game-header">
      <h2>{{ title }}</h2>
      @if (description) { <p>{{ description }}</p> }
    </div>
    <router-outlet />

    @if (gameCategory(); as cat) {
      <app-ranking [gameType]="cat" [categoryLabel]="categoryLabel()" />
    }

    @if (sym.scenario()?.result; as result) {
      <app-game-over-dialog
        [result]="result"
        (restart)="onGameOverRestart()"
        (next)="onGameOverNext()" />
    }
  `,
})
export class GameComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  readonly sym    = inject(SymulatorService);
  readonly config = inject(ConfigService);
  readonly users  = inject(UserService);

  title = '';
  description = '';
  private paramSub?: Subscription;
  private langSub?: Subscription;

  readonly gameCategory = computed(() => {
    const s = this.sym.scenario();
    if (!s) return null;
    return this.sym.getGameCategory();
  });

  readonly categoryLabel = computed(() => {
    const s = this.sym.scenario();
    if (!s) return '';
    if (s.isRandom) {
      const labels: Record<number, string> = { 0: 'Random Easy', 1: 'Random Medium', 2: 'Random Hard' };
      return labels[s.levelNmb ?? 0] ?? 'Random';
    }
    return s.name || `Scenario ${s.id}`;
  });

  // Chart datasets (PV / EV / AC) -- consumed by PlayComponent via SymulatorService.
  readonly chart = {
    labels: [] as string[],
    data:   [[] as number[], [] as number[], [] as number[]],
    series: ['PV', 'EV', 'AC'],
  };

  onGameOverRestart(): void {
    this.sym.reset();
    this.resetChart();
  }

  onGameOverNext(): void {
    const next = this.sym.goNext();
    if (next.kind !== 'random' && next.scenarioId !== undefined) {
      const sub = next.kind === 'training' ? 'plan' : 'play';
      this.router.navigate(['/game', next.scenarioId, sub]);
    } else {
      // `goNext()` already called `startRandom(...)` and published a new
      // scenario; just refresh the header/chart to reflect it.
      this.afterScenarioReady();
    }
  }

  ngOnInit(): void {
    this.sym.pause();
    this.paramSub = this.route.paramMap.subscribe((params) => {
      const raw = params.get('scenario') ?? '0';
      this.loadScenario(raw);
    });
    this.langSub = this.translate.onLangChange.subscribe(() => {
      this.updateTitleDescription();
    });
  }

  ngOnDestroy(): void {
    this.sym.pause();
    this.paramSub?.unsubscribe();
    this.langSub?.unsubscribe();
  }

  private async loadScenario(raw: string): Promise<void> {
    if (raw.startsWith('random')) {
      const level = raw === 'random-hard' ? 2 : raw === 'random-medium' ? 1 : 0;
      this.sym.startRandom(level);
      this.afterScenarioReady();
      return;
    }
    try {
      await this.sym.startScenario(Number(raw));
      this.afterScenarioReady();
    } catch {
      // Scenario id not found (e.g. clicked "Next" past the last level) —
      // fall back to a random scenario so the UI keeps moving.
      this.sym.startRandom();
      this.afterScenarioReady();
    }
  }

  private afterScenarioReady(): void {
    this.updateTitleDescription();
    this.resetChart();
    this.translate.get('GAME_week').subscribe((label) => {
      const w = this.sym.getGanttSpanWeeks();
      for (let i = 1; i <= w; i++) {
        this.chart.labels[i * this.config.chartPointsPerWeek] = `${label} ${i}`;
      }
    });
  }

  private updateTitleDescription(): void {
    const scenario = this.sym.scenario();
    if (!scenario) return;
    if (!scenario.isRandom) {
      this.title       = this.sym.getScenarioName();
      this.description = this.sym.getScenarioDescription();
    } else {
      this.translate.get('GAME_random_scenario_title').subscribe((t) => (this.title = t));
      this.translate
        .get(`GAME_random_scenario_description_${scenario.levelNmb}`)
        .subscribe((t) => (this.description = t));
    }
  }

  resetChart(): void {
    const w = this.sym.getGanttSpanWeeks();
    let i = 0;
    for (let time = 0; time < w; time += 1 / this.config.chartPointsPerWeek) {
      const pv = Math.round(this.sym.calculateScenarioPv(time));
      this.chart.data[0][i] = pv;
      this.chart.data[1][i] = 0;
      this.chart.data[2][i] = 0;
      this.chart.labels[i]  = '';
      i++;
    }
  }

  // Navigation helpers ------------------------------------------------------
  goToSimulation(): void {
    const raw = this.route.snapshot.paramMap.get('scenario') ?? '0';
    this.router.navigate(['/game', raw, 'play']);
    this.resetChart();
  }
}
