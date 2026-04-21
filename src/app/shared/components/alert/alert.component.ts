import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="alert-container" [class.alert-hidden]="!error" [class.alert-shown]="!!error">
      <div class="alert alert-danger" role="alert">
        <strong>{{ 'Error' | translate }}</strong> {{ error }}
      </div>
    </div>

    <div class="alert-container" [class.alert-hidden]="!warning" [class.alert-shown]="!!warning">
      <div class="alert alert-warning" role="alert">
        <strong>{{ 'Warning' | translate }}</strong> {{ warning }}
      </div>
    </div>

    <div class="alert-container" [class.alert-hidden]="!success" [class.alert-shown]="!!success">
      <div class="alert alert-success" role="alert">
        <strong>{{ 'Success' | translate }}</strong> {{ success }}
      </div>
    </div>
  `,
})
export class AlertComponent {
  @Input() error   = '';
  @Input() warning = '';
  @Input() success = '';
}
