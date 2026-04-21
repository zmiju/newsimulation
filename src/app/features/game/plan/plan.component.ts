import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Router, ActivatedRoute } from '@angular/router';

import { SymulatorService } from '@core/services/symulator.service';
import { UserService } from '@core/services/user.service';
import { ConfigService } from '@core/services/config.service';

/**
 * Planning view — lets the user adjust task start/end/effort, pick counter-risks,
 * and save the plan before running the simulation.
 */
@Component({
  selector: 'app-plan',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './plan.component.html',
})
export class PlanComponent {
  readonly sym = inject(SymulatorService);
  readonly users = inject(UserService);
  readonly config = inject(ConfigService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isSaved = signal(false);

  get scenario() { return this.sym.scenario(); }

  // Day ⇄ week conversions for inputs (model stores weeks, user edits days)
  toDays(weeks: number): number { return weeks * this.config.daysInWeek; }
  fromDays(days: number): number { return days / this.config.daysInWeek; }

  updateTaskStart(taskIdx: number, days: number): void {
    const scenario = this.scenario;
    if (!scenario?.plan) return;
    (scenario.plan.tasks[taskIdx] as unknown as Record<string, number>)['start'] = this.fromDays(days);
    this.sym.recalculatePlanPV();
    this.sym.recalculatePlanDeadline();
  }
  updateTaskEnd(taskIdx: number, days: number): void {
    const scenario = this.scenario;
    if (!scenario?.plan) return;
    (scenario.plan.tasks[taskIdx] as unknown as Record<string, number>)['end'] = this.fromDays(days);
    this.sym.recalculatePlanPV();
    this.sym.recalculatePlanDeadline();
  }
  updateTaskEffort(taskIdx: number, days: number): void {
    const scenario = this.scenario;
    if (!scenario?.plan) return;
    scenario.plan.tasks[taskIdx].effort = this.fromDays(days);
    this.sym.recalculatePlanPV();
    this.sym.recalculatePlanDeadline();
  }

  toggleCounterRisk(id: number): void {
    const scenario = this.scenario;
    if (!scenario?.plan) return;
    const list = (scenario.plan as unknown as Record<string, number[]>)['counterRisks'] ?? [];
    const idx = list.indexOf(id);
    if (idx > -1) list.splice(idx, 1); else list.push(id);
    (scenario.plan as unknown as Record<string, number[]>)['counterRisks'] = list;
    this.sym.recalculatePlanPV();
  }

  isCounterRiskSelected(id: number): boolean {
    const list = (this.scenario?.plan as unknown as Record<string, number[]>)?.['counterRisks'] ?? [];
    return list.includes(id);
  }

  totalPlannedBudget(): number {
    const plan = this.scenario?.plan as unknown as Record<string, number>;
    if (!plan) return 0;
    return (plan['pv'] ?? 0) + (plan['counterRisksCost'] ?? 0);
  }

  save(): void {
    if (!confirm('Save plan? Any previous saved plan for this scenario will be overwritten.')) return;
    const scenario = this.scenario;
    if (scenario) {
      this.users.savePlan(scenario);
      this.isSaved.set(true);
    }
  }

  goToSimulation(): void {
    const raw = this.route.parent?.snapshot.paramMap.get('scenario') ?? '0';
    this.router.navigate(['/game', raw, 'play']);
  }
}
