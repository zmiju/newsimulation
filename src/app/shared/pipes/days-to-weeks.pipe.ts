import { Pipe, PipeTransform, inject } from '@angular/core';
import { ConfigService } from '@core/services/config.service';

/**
 * View ↔ model conversion between weeks (model) and days (view).
 *
 * The original was an ngModel directive with $parsers/$formatters. In Angular,
 * for display-only use this pipe; for two-way form bindings, prefer a
 * dedicated FormControl + (valueChanges) mapping, or a custom ControlValueAccessor.
 */
@Pipe({ name: 'daysToWeeks', standalone: true, pure: true })
export class DaysToWeeksPipe implements PipeTransform {
  private readonly config = inject(ConfigService);

  /** Model → View (weeks → days). */
  transform(weeks: number | null | undefined): number {
    if (weeks == null) return 0;
    return weeks * this.config.daysInWeek;
  }

  /** View → Model (days → weeks). Call explicitly from form handlers. */
  invert(days: number | null | undefined): number {
    if (days == null) return 0;
    return days / this.config.daysInWeek;
  }
}
