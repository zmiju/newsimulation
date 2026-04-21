import { Component, Input, ViewEncapsulation, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { TranslateModule } from '@ngx-translate/core';

import { ConfigService } from '@core/services/config.service';
import { SymulatorService } from '@core/services/symulator.service';
import { Scenario } from '@core/models/scenario.model';
import { Resource } from '@core/models/resource.model';

@Component({
  selector: 'app-gantt',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, DragDropModule, TranslateModule],
  animations: [
    trigger('rowsStagger', [
      transition(':enter', [
        query(
          '.gantt-row',
          [
            style({ opacity: 0, transform: 'translateX(-14px)' }),
            stagger(
              50,
              animate(
                '300ms cubic-bezier(0.2, 0.7, 0.2, 1)',
                style({ opacity: 1, transform: 'translateX(0)' }),
              ),
            ),
          ],
          { optional: true },
        ),
      ]),
    ]),
    trigger('chipEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.4)', transformOrigin: 'center' }),
        animate(
          '260ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'scale(1)' }),
        ),
      ]),
      transition(':leave', [
        animate('160ms ease-in', style({ opacity: 0, transform: 'scale(0.6)' })),
      ]),
    ]),
  ],
  styles: [`
    .gantt-wrap { position: relative; display: inline-block; }
    .task-overlay {
      position: absolute;
      left: 0; right: 0;
      pointer-events: none;
      transition: background-color 0.2s ease;
    }
    .task-drop-zone {
      width: 100%; height: 100%;
      pointer-events: all;
      display: flex;
      align-items: center;
      padding-left: 4px;
      gap: 4px;
    }
    .task-overlay .cdk-drag-placeholder {
      background: rgba(74,144,226,0.25);
      border: 2px dashed #4a90e2;
      border-radius: 12px;
      width: 72px;
      height: 22px;
      margin: 0 4px;
    }

    /* Smooth growth of the "now" line and the actual / completion bars */
    .gantt-now-line {
      transition: x 0.28s cubic-bezier(0.2, 0.7, 0.2, 1);
      filter: drop-shadow(0 0 3px rgba(255, 0, 0, 0.45));
    }
    .gantt-now-line-pulse {
      animation: gantt-now-pulse 1.6s ease-in-out infinite;
      transform-origin: center;
    }
    @keyframes gantt-now-pulse {
      0%, 100% { opacity: 0.85; stroke-width: 1.5; }
      50%      { opacity: 1;    stroke-width: 2.5; }
    }

    .gantt-actual-bar,
    .gantt-completed-bar {
      transition:
        x 0.28s cubic-bezier(0.2, 0.7, 0.2, 1),
        width 0.28s cubic-bezier(0.2, 0.7, 0.2, 1),
        fill 0.3s ease;
    }

    .gantt-row { transition: opacity 0.2s ease; }

    .gantt-row--completed .gantt-actual-bar {
      animation: gantt-complete-flash 720ms ease-out;
    }
    @keyframes gantt-complete-flash {
      0%   { fill: #ffeb3b; filter: drop-shadow(0 0 6px rgba(139, 195, 74, 0.8)); }
      60%  { fill: #8bc34a; filter: drop-shadow(0 0 10px rgba(139, 195, 74, 0.9)); }
      100% { fill: #8bc34a; filter: drop-shadow(0 0 0 rgba(0, 0, 0, 0)); }
    }

    .gantt-hover-highlight {
      animation: gantt-hover-in 180ms ease-out;
    }
    @keyframes gantt-hover-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .gantt-chip { transition: transform 0.15s ease; }
    .gantt-chip:hover { transform: translateY(-1px); }

    .gantt-week-grid {
      transition: opacity 0.25s ease;
    }

    .gantt-dep-path {
      fill: none;
      stroke: #607d8b;
      stroke-width: 1.4;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: 0.8;
      pointer-events: none;
    }

    .gantt-crash-alert {
      cursor: help;
      animation: gantt-crash-pulse 1.4s ease-in-out infinite;
      transform-box: fill-box;
      transform-origin: center;
    }
    .gantt-crash-alert > rect {
      transition: fill 0.2s ease;
    }
    @keyframes gantt-crash-pulse {
      0%, 100% { opacity: 0.95; filter: drop-shadow(0 0 0 rgba(220, 38, 38, 0)); }
      50%      { opacity: 1;    filter: drop-shadow(0 0 4px rgba(220, 38, 38, 0.8)); }
    }
  `],
  template: `
    @if (scenario; as s) {
      @if (sym.simulation(); as sim) {
        <div class="gantt-wrap"
             [style.width.px]="chartWidth()"
             [style.height.px]="chartHeight()">

          <svg [attr.width]="chartWidth()"
               [attr.height]="chartHeight()"
               xmlns="http://www.w3.org/2000/svg"
               style="display:block;">

            <defs>
              <marker id="gantt-dep-arrow"
                      viewBox="0 0 10 10"
                      refX="9" refY="5"
                      markerUnits="userSpaceOnUse"
                      markerWidth="8" markerHeight="8"
                      orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#607d8b" />
              </marker>
            </defs>

            <!-- Week grid -->
            @for (w of weeks(); track w) {
              <g class="gantt-week-grid">
                <line [attr.x1]="labelWidth + w * weekPx"
                      [attr.x2]="labelWidth + w * weekPx"
                      y1="0"
                      [attr.y2]="chartHeight()"
                      stroke="#e0e0e0" stroke-dasharray="2,2" />
                <text [attr.x]="labelWidth + w * weekPx + 4"
                      y="14"
                      font-size="11" fill="#909090">
                  W{{ w }}
                </text>
              </g>
            }

            <!-- Task rows -->
            <g @rowsStagger>
              @for (task of sim.tasks; track task.id; let i = $index) {
                <g class="gantt-row"
                   [class.gantt-row--completed]="task.isCompleted"
                   [attr.transform]="'translate(0,' + (headerHeight + i * rowHeight) + ')'">
                  <!-- Hover highlight -->
                  @if (hoveredTaskId === task.id) {
                    <rect class="gantt-hover-highlight"
                          x="0" y="0"
                          [attr.width]="chartWidth()"
                          [attr.height]="rowHeight - chipH - 4"
                          fill="rgba(74,144,226,0.10)"
                          stroke="#4a90e2" stroke-width="1.5"
                          stroke-dasharray="4,3" rx="2" />
                  }

                  <text x="8" y="28" font-size="12" fill="#404040">
                    #{{ task.id + 1 }}
                  </text>

                  <!-- Crashing alert: more than one active resource on this task -->
                  @if (sym.isTaskCrashing(task.id)) {
                    <g class="gantt-crash-alert"
                       @chipEnter
                       [attr.transform]="'translate(' + (labelWidth + task.resourcesAssigned.length * (chipW + 4) + 4) + ',' + (rowHeight - chipH - 4) + ')'">
                      <title>{{ 'SIMULATION_task_crashing' | translate }} ({{ sym.getNumberOfActiveResourcesOnTask(task.id) }})</title>
                      <rect x="0" y="0"
                            [attr.width]="44" [attr.height]="chipH"
                            rx="10"
                            fill="#dc2626" />
                      <text x="10" y="14"
                            text-anchor="middle"
                            font-size="12" font-weight="bold" fill="#fff"
                            style="pointer-events:none;">!</text>
                      <text x="22" y="14"
                            font-size="11" font-weight="700" fill="#fff"
                            style="pointer-events:none;">
                        ×{{ sym.getNumberOfActiveResourcesOnTask(task.id) }}
                      </text>
                    </g>
                  }

                  <!-- EVM metrics on the right edge -->
                  <g [attr.transform]="'translate(' + (labelWidth + config.weeksOnGant * weekPx + 12) + ',0)'">
                    <text x="0" y="12" font-size="11" fill="#4a90e2">
                      PV: {{ round(task.pv) }}
                    </text>
                    <text x="0" y="26" font-size="11" fill="#4caf50">
                      EV: {{ round(task.ev) }}
                    </text>
                    <text x="0" y="40" font-size="11" fill="#e74c3c">
                      AC: {{ round(task.ac) }}
                    </text>
                  </g>

                  <!-- Planned bar -->
                  <rect [attr.x]="labelWidth + (s.plan?.tasks?.[task.id]?.start ?? 0) * weekPx"
                        y="6"
                        [attr.width]="(s.plan?.tasks?.[task.id]?.effort ?? 0) * weekPx"
                        height="8"
                        fill="#cfd8e3" stroke="#83b9ff" />

                  <!-- Actual bar -->
                  <rect class="gantt-actual-bar"
                        [attr.x]="labelWidth + task.start * weekPx"
                        y="17"
                        [attr.width]="task.effort * weekPx"
                        height="14"
                        [attr.fill]="task.isCompleted ? '#8bc34a' : '#ff9f15'"
                        opacity="0.85" />

                  <!-- Completion overlay -->
                  @if (task.completed > 0) {
                    <rect class="gantt-completed-bar"
                          [attr.x]="labelWidth + task.start * weekPx"
                          y="17"
                          [attr.width]="task.completed * weekPx"
                          height="14"
                          fill="#4caf50" />
                  }

                  <!-- Assigned resource chips — click × to unassign -->
                  @for (r of task.resourcesAssigned; track r.id; let ri = $index) {
                    <g class="gantt-chip"
                       @chipEnter
                       [attr.transform]="'translate(' + (labelWidth + ri * (chipW + 4)) + ',' + (rowHeight - chipH - 4) + ')'"
                       style="cursor:default;">
                      <!-- pill background -->
                      <rect x="0" y="0"
                            [attr.width]="chipW" [attr.height]="chipH"
                            rx="10"
                            [attr.fill]="r.color" />
                      <!-- avatar circle -->
                      <circle cx="10" cy="10" r="8" fill="rgba(0,0,0,0.25)" />
                      <text x="10" y="14" text-anchor="middle"
                            font-size="9" font-weight="bold" fill="#fff"
                            style="pointer-events:none;">
                        {{ r.name[0] }}
                      </text>
                      <!-- name -->
                      <text x="23" y="14"
                            font-size="10" fill="#fff"
                            style="pointer-events:none;">
                        {{ r.name }}
                      </text>
                      <!-- × remove button -->
                      <circle [attr.cx]="chipW - 10" cy="10" r="8"
                              fill="rgba(0,0,0,0.3)"
                              style="cursor:pointer;"
                              (click)="sym.unassignResourceFromTask(r.id, task.id)">
                        <title>Remove {{ r.name }}</title>
                      </circle>
                      <text [attr.x]="chipW - 10" y="14"
                            text-anchor="middle"
                            font-size="12" fill="#fff"
                            style="pointer-events:none;">
                        ×
                      </text>
                    </g>
                  }
                </g>
              }
            </g>

            <!-- Dependency arrows (FS) -->
            @for (dep of dependencyPaths(); track dep.key) {
              <path class="gantt-dep-path"
                    [attr.d]="dep.d"
                    marker-end="url(#gantt-dep-arrow)" />
            }

            <!-- "Now" line -->
            <line class="gantt-now-line gantt-now-line-pulse"
                  [attr.x1]="labelWidth + sim.time * weekPx"
                  [attr.x2]="labelWidth + sim.time * weekPx"
                  y1="0"
                  [attr.y2]="chartHeight()"
                  stroke="#ff0000" stroke-width="1.5" />
          </svg>

          <!-- Transparent drop-zone overlays, one per task row -->
          @for (task of sim.tasks; track task.id; let i = $index) {
            <div class="task-overlay"
                 cdkDropList
                 [cdkDropListData]="task.resourcesAssigned"
                 (cdkDropListDropped)="onDrop($event, task.id)"
                 (cdkDropListEntered)="hoveredTaskId = task.id"
                 (cdkDropListExited)="hoveredTaskId = null"
                 [style.top.px]="headerHeight + i * rowHeight"
                 [style.height.px]="rowHeight - chipH - 4">
              <div class="task-drop-zone"></div>
            </div>
          }
        </div>
      }
    }
  `,
})
export class GanttComponent {
  readonly config = inject(ConfigService);
  readonly sym    = inject(SymulatorService);

  @Input({ required: true }) scenario!: Scenario;

  hoveredTaskId: number | null = null;

  readonly labelWidth   = 40;
  readonly headerHeight = 24;
  readonly rowHeight    = 64;
  readonly weekPx       = 60;
  readonly chipW        = 76;
  readonly chipH        = 20;
  readonly metricsWidth = 90;

  readonly weeks = computed(() =>
    Array.from({ length: this.config.weeksOnGant + 1 }, (_, i) => i));

  chartWidth(): number {
    return this.labelWidth + this.config.weeksOnGant * this.weekPx + this.metricsWidth + 20;
  }

  round(value: number | undefined): number {
    return Math.round(value ?? 0);
  }

  chartHeight(): number {
    const nTasks = this.sym.simulation()?.tasks.length ?? 0;
    return this.headerHeight + nTasks * this.rowHeight + 20;
  }

  /**
   * Build SVG paths for finish-to-start dependency arrows between planned bars.
   * Uses planned `start` / `effort` so arrows track the user's plan, not the
   * (drifting) actual bars.
   */
  dependencyPaths(): { key: string; d: string }[] {
    const sim = this.sym.simulation();
    const plan = this.scenario?.plan;
    const defs = this.scenario?.tasks;
    if (!sim || !plan || !defs) return [];

    const rowOf = new Map<number, number>();
    sim.tasks.forEach((t, i) => rowOf.set(t.id, i));

    // Vertical center of the planned bar (y=6, height=8) inside a row.
    const barCenterY = 10;
    const headTrim = 6;     // gap so arrowhead doesn't overlap the bar
    const tailLen = 14;     // length of straight horizontal approach into arrowhead
    const exitLen = 10;     // length of straight horizontal exit from predecessor
    const r = 6;            // corner radius for rounded bends

    const paths: { key: string; d: string }[] = [];

    for (const task of sim.tasks) {
      const def = defs.find(t => t.id === task.id);
      const deps = def?.dependsOn ?? [];
      if (deps.length === 0) continue;

      const suc = plan.tasks?.[task.id];
      const sucIdx = rowOf.get(task.id);
      if (!suc || sucIdx == null) continue;

      const sucStartX = this.labelWidth + suc.start * this.weekPx;
      const sucY = this.headerHeight + sucIdx * this.rowHeight + barCenterY;

      for (const predId of deps) {
        const pred = plan.tasks?.[predId];
        const predIdx = rowOf.get(predId);
        if (!pred || predIdx == null) continue;

        const predEndX = this.labelWidth + (pred.start + pred.effort) * this.weekPx;
        const predY = this.headerHeight + predIdx * this.rowHeight + barCenterY;
        const targetX = sucStartX - headTrim;

        const d = this.buildDepPath(
          predEndX, predY, targetX, sucY,
          sucIdx > predIdx ? 1 : sucIdx < predIdx ? -1 : 0,
          { tailLen, exitLen, r, rowHeight: this.rowHeight },
        );

        paths.push({ key: `${predId}->${task.id}`, d });
      }
    }

    return paths;
  }

  /**
   * Build a smooth right-angle path from (sx, sy) to (tx, ty) ending in a
   * horizontal segment of `tailLen` so the arrowhead is approached cleanly.
   * Corners are softened with quadratic Béziers (radius `r`).
   *
   * `dir` is the vertical direction from source to target row:
   *   1 → target is below, -1 → target is above, 0 → same row.
   */
  private buildDepPath(
    sx: number, sy: number,
    tx: number, ty: number,
    dir: -1 | 0 | 1,
    o: { tailLen: number; exitLen: number; r: number; rowHeight: number },
  ): string {
    const { tailLen, exitLen, r, rowHeight } = o;

    // Same-row dependency — just a straight line.
    if (dir === 0 || Math.abs(ty - sy) < 1) {
      return `M ${sx} ${sy} H ${tx}`;
    }

    const tailStartX = tx - tailLen;       // where the final horizontal stub begins
    const exitEndX   = sx + exitLen;       // where the initial horizontal stub ends

    // Forward route — there's room for a single S-curve between exit and tail.
    if (tailStartX - exitEndX >= r * 2) {
      const bendX = tailStartX;            // vertical leg sits at the start of the tail
      const turn1Y = sy + dir * r;
      const turn2Y = ty - dir * r;
      // Guard for very small vertical gaps (rows close enough that the two
      // arc turns would overlap) — fall back to a straight diagonal join.
      if ((dir === 1 && turn2Y < turn1Y) || (dir === -1 && turn2Y > turn1Y)) {
        return `M ${sx} ${sy} H ${bendX} L ${tx} ${ty}`;
      }
      return (
        `M ${sx} ${sy} ` +
        `H ${bendX - r} ` +
        `Q ${bendX} ${sy}, ${bendX} ${turn1Y} ` +
        `V ${turn2Y} ` +
        `Q ${bendX} ${ty}, ${bendX + r} ${ty} ` +
        `H ${tx}`
      );
    }

    // Detour route — successor begins before (or barely after) predecessor
    // ends. We exit right, drop to a row-gap "lane", travel LEFT, then drop
    // again into the successor and enter from the left.
    const detourY = sy + dir * (rowHeight / 2);
    const d1 = dir;                        // sy -> detourY
    const d2 = ty > detourY ? 1 : -1;      // detourY -> ty

    // Ensure the two vertical legs are at least 2r apart so the leftward
    // middle segment (between their corners) has positive length.
    let outX  = sx + exitLen;              // vertical leg leaving predecessor
    let backX = tx - tailLen;              // vertical leg entering successor
    if (outX - backX < r * 2) {
      const mid = (outX + backX) / 2;
      outX  = mid + r;
      backX = mid - r;
    }

    return (
      `M ${sx} ${sy} ` +
      `H ${outX - r} ` +
      // R -> d1 (down/up)
      `Q ${outX} ${sy}, ${outX} ${sy + d1 * r} ` +
      `V ${detourY - d1 * r} ` +
      // d1 -> L  (note: end x is outX - r, not outX + r)
      `Q ${outX} ${detourY}, ${outX - r} ${detourY} ` +
      `H ${backX + r} ` +
      // L -> d2  (note: start of next vertical sits at backX, not "+ r")
      `Q ${backX} ${detourY}, ${backX} ${detourY + d2 * r} ` +
      `V ${ty - d2 * r} ` +
      // d2 -> R
      `Q ${backX} ${ty}, ${backX + r} ${ty} ` +
      `H ${tx}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDrop(event: CdkDragDrop<any>, taskId: number): void {
    this.hoveredTaskId = null;
    if (event.previousContainer === event.container) return;
    const resource = event.item.data as Resource;
    this.sym.assignResourceToTask(resource.id, taskId);
  }
}
