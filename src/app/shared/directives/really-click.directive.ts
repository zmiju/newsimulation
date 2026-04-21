import { Directive, HostListener, Input, Output, EventEmitter } from '@angular/core';

/**
 * Replacement for the old `ng-really-click` / `ng-really-message` directive.
 *
 * Usage:
 *   <button (reallyClick)="remove()" [reallyMessage]="'Are you sure?'">Delete</button>
 */
@Directive({
  selector: '[reallyClick]',
  standalone: true,
})
export class ReallyClickDirective {
  @Input() reallyMessage = 'Are you sure?';
  @Output() reallyClick = new EventEmitter<void>();

  @HostListener('click')
  onClick(): void {
    if (window.confirm(this.reallyMessage)) this.reallyClick.emit();
  }
}
