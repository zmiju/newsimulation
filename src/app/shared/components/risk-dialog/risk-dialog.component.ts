import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-risk-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="modal-header">
      <h5>⚠ {{ 'GAME_risk_title' | translate }}</h5>
    </div>
    <div class="modal-body" style="padding: 16px; min-width: min(340px, 88vw); max-width: 92vw;">
      <p><strong>{{ data.name }}</strong></p>
      @if (data.hasCounter) {
        <div class="alert alert-success">
          {{ 'GAME_risk_counter' | translate }}
        </div>
      } @else if (data.canHaveCounter) {
        <div class="alert alert-danger">
          {{ 'GAME_risk_no_counter' | translate }}
        </div>
      }
    </div>
    <div class="modal-footer" style="padding: 12px; text-align: right;">
      <button class="btn btn-primary btn-sm" (click)="close()">
        {{ 'GAME-OVER-modal_ok' | translate }}
      </button>
    </div>
  `,
})
export class RiskDialogComponent {
  readonly data = inject<{ name: string; hasCounter?: unknown; canHaveCounter?: boolean }>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<void>>(DialogRef);
  close(): void { this.dialogRef.close(); }
}
