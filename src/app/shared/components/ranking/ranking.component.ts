import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { RankingService } from '@core/services/ranking.service';

@Component({
  selector: 'app-ranking',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="ranking-panel">
      <h5 class="ranking-title">
        🏆 {{ 'RANKING_title' | translate }}
        <span class="ranking-category">{{ categoryLabel }}</span>
      </h5>

      @if (ranking.loading()) {
        <div class="ranking-loading">
          <span class="ranking-spinner"></span>
          {{ 'RANKING_loading' | translate }}
        </div>
      } @else if (ranking.entries().length === 0) {
        <p class="ranking-empty">{{ 'RANKING_empty' | translate }}</p>
      } @else {
        <div class="ranking-table-scroll">
          <table class="ranking-table">
            <thead>
              <tr>
                <th class="col-rank">#</th>
                <th class="col-nick">{{ 'RANKING_col_nickname' | translate }}</th>
                <th class="col-country">{{ 'RANKING_col_country' | translate }}</th>
                <th class="col-score">{{ 'RANKING_col_score' | translate }}</th>
                <th class="col-date">{{ 'RANKING_col_date' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (entry of ranking.entries(); track entry.nickname + entry.score; let i = $index) {
                <tr [class.ranking-row--top3]="i < 3">
                  <td class="col-rank">
                    @if (i === 0) { 🥇 }
                    @else if (i === 1) { 🥈 }
                    @else if (i === 2) { 🥉 }
                    @else { {{ i + 1 }} }
                  </td>
                  <td class="col-nick">{{ entry.nickname }}</td>
                  <td class="col-country">
                    @if (entry.country) {
                      {{ countryFlag(entry.country) }} {{ entry.city ? entry.city + ', ' + entry.country : entry.country }}
                    } @else { – }
                  </td>
                  <td class="col-score">{{ entry.score | number:'1.0-0' }}</td>
                  <td class="col-date">{{ entry.date | date:'dd.MM.yyyy' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .ranking-panel {
      margin: 24px 0 8px;
      padding: 16px 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
    }

    .ranking-title {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ranking-category {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #64748b;
      background: #e2e8f0;
      padding: 2px 8px;
      border-radius: 999px;
    }

    .ranking-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #64748b;
      font-size: 13px;
      padding: 8px 0;
    }

    .ranking-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid #e2e8f0;
      border-top-color: #64748b;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .ranking-empty {
      color: #94a3b8;
      font-size: 13px;
      margin: 0;
      padding: 4px 0;
    }

    .ranking-table-scroll {
      max-height: 480px;
      overflow-y: auto;
    }

    .ranking-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .ranking-table thead tr {
      border-bottom: 2px solid #e2e8f0;
    }

    .ranking-table th {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
      padding: 4px 8px 8px;
      text-align: left;
    }

    .ranking-table td {
      padding: 7px 8px;
      color: #334155;
      border-bottom: 1px solid #f1f5f9;
    }

    .ranking-table tbody tr:last-child td { border-bottom: none; }

    .ranking-row--top3 td { color: #0f172a; font-weight: 600; }

    .col-rank { width: 36px; text-align: center; font-size: 16px; }
    .col-country { width: 120px; max-width: 120px; color: #64748b; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .col-score { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; color: #1d4ed8; }
    .col-date { color: #94a3b8; font-size: 12px; }
  `],
})
export class RankingComponent implements OnChanges {
  @Input({ required: true }) gameType!: string;
  @Input() categoryLabel = '';

  readonly ranking = inject(RankingService);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['gameType'] && this.gameType) {
      this.ranking.loadRanking(this.gameType);
    }
  }

  countryFlag(code: string): string {
    return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
  }
}
