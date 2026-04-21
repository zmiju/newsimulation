import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';

/**
 * Briefly animates the host element whenever the bound value changes.
 * Used for metric counters so players get a subtle visual pulse each time
 * a number actually updates.
 *
 * Usage:
 *   <span [animateOnChange]="sim.ev | number:'1.0-0'">{{ sim.ev | number:'1.0-0' }}</span>
 */
@Directive({
  selector: '[animateOnChange]',
  standalone: true,
})
export class AnimateOnChangeDirective implements OnChanges {
  @Input('animateOnChange') value: string | number | null | undefined = null;
  @Input() animateColor = '#2563eb';
  @Input() animateScale = 1.18;

  private readonly el = inject(ElementRef<HTMLElement>);
  private prev: string | number | null | undefined = null;
  private first = true;

  ngOnChanges(ch: SimpleChanges): void {
    if (!('value' in ch)) return;
    const current = ch['value'].currentValue;
    if (this.first) {
      this.prev = current;
      this.first = false;
      return;
    }
    if (this.prev !== current) {
      const node = this.el.nativeElement;
      if (typeof node.animate === 'function') {
        node.animate(
          [
            { transform: `scale(${this.animateScale})`, color: this.animateColor, offset: 0 },
            { transform: 'scale(1)', color: '', offset: 1 },
          ],
          { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
        );
      }
    }
    this.prev = current;
  }
}
