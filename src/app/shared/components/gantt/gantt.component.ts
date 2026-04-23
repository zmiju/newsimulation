import { Component, HostListener, ViewEncapsulation, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { TranslateModule } from '@ngx-translate/core';

import { ConfigService } from '@core/services/config.service';
import { SymulatorService } from '@core/services/symulator.service';
import { Scenario } from '@core/models/scenario.model';
import { Resource } from '@core/models/resource.model';
import { DependencyType } from '@core/models/task.model';

/** One display row: MS Project–style summary directly above its child tasks. */
type GanttRow =
  | {
      kind: 'phase';
      key: string;
      name: string;
      hasChildTasks: boolean;
      start: number;
      end: number;
      span: number;
      effortTotal: number;
      progressPct: number;
      progressW: number;
    }
  | {
      kind: 'task';
      key: string;
      task: {
        id: number;
        start: number;
        end: number;
        effort: number;
        completed: number;
        isCompleted: boolean;
        pv: number;
        ev: number;
        ac: number;
        resourcesAssigned: { id: number; name: string; color: string }[];
      };
      indent: boolean;
    };

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
    .gantt-phase-bar,
    .gantt-phase-completed {
      transition: fill 0.25s ease;
    }

    .gantt-row { transition: opacity 0.2s ease; }

    .gantt-phase-bar {
      fill: #9e9e9e;
      stroke: #616161;
      stroke-width: 1;
      stroke-linejoin: round;
      opacity: 0.95;
    }
    .gantt-row--phase .gantt-phase-bar {
      filter: drop-shadow(0 1px 1px rgba(0,0,0,0.12));
    }
    .gantt-task-label { font-size: 12px; fill: #404040; }
    /* Halo so long labels that extend over the bar stay readable in edge cases. */
    .gantt-phase-label {
      paint-order: stroke fill;
      stroke: #fafafa;
      stroke-width: 2.5px;
    }
    .gantt-phase-expander {
      cursor: pointer;
      pointer-events: all;
    }
    .gantt-phase-expander:hover .gantt-phase-expander-ico {
      fill: #1a1a1a;
    }
    .gantt-phase-expander-ico {
      fill: #5c5c5c;
      font-size: 12px;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    .gantt-phase-completed {
      fill: #43a047;
      stroke: none;
      pointer-events: none;
    }

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

    .gantt-chip { transition: opacity 0.15s ease; }
    .gantt-chip:hover { opacity: 0.85; }

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
      transition: stroke-width 0.15s ease, opacity 0.15s ease, filter 0.15s ease;
    }
    .gantt-dep-hit {
      fill: none;
      stroke: transparent;
      stroke-width: 12;
      cursor: pointer;
      /* pointer-events: all fires even on a transparent/invisible stroke */
      pointer-events: all;
    }
    /* Highlight the visible path whenever the sibling hit-area (or the group) is hovered */
    .gantt-dep-group:hover .gantt-dep-path {
      stroke-width: 3;
      opacity: 1;
      filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.35));
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
    @if (sym.simulation(); as sim) {
      @if (scenario(); as s) {
        <div class="gantt-wrap"
             [style.width.px]="chartWidth()"
             [style.height.px]="chartHeight()">

          <svg [attr.width]="chartWidth()"
               [attr.height]="chartHeight()"
               xmlns="http://www.w3.org/2000/svg"
               style="display:block;">

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

            <g @rowsStagger>
              @for (row of ganttLayout(); track row.key; let ri = $index) {
                @if (row.kind === 'phase') {
              <g class="gantt-row gantt-row--phase"
                 [attr.transform]="'translate(0,' + (headerHeight + ri * rowHeight) + ')'">
                @if (row.span > 0) {
                  <defs>
                    <clipPath [id]="'ganttPClip' + ri">
                      <path [attr.d]="phasePathFull(row.start, row.span)" />
                    </clipPath>
                  </defs>
                  <path class="gantt-phase-bar"
                        [attr.d]="phasePathFull(row.start, row.span)" />
                  @if (row.progressW > 0) {
                    <g [attr.clip-path]="'url(#' + 'ganttPClip' + ri + ')'" style="pointer-events: none">
                      <rect class="gantt-phase-completed"
                            [attr.x]="labelWidth + row.start * weekPx"
                            [attr.y]="5"
                            [attr.width]="row.progressW * weekPx"
                            [attr.height]="26" />
                    </g>
                  }
                }
                <!-- After bars: expander + label on top; expander is pointer-interactive -->
                @if (row.hasChildTasks) {
                  <g class="gantt-phase-expander"
                     (click)="togglePhaseExpander(row.key, $event)">
                    <title>
                      @if (isPhaseRowExpanded(row.key)) {
                        {{ 'GANTT_phase_collapse' | translate }}
                      } @else {
                        {{ 'GANTT_phase_expand' | translate }}
                      }
                    </title>
                    <rect x="0" y="0" width="24" height="24" fill="transparent" />
                    <text x="1" y="18" class="gantt-phase-expander-ico" pointer-events="none">
                      {{ isPhaseRowExpanded(row.key) ? '▼' : '▶' }}
                    </text>
                  </g>
                }
                <text [attr.x]="row.hasChildTasks ? 28 : 8" y="15" class="gantt-task-label gantt-phase-label" font-weight="600" fill="#5c5c5c"
                      style="pointer-events: none;">
                  @if (row.effortTotal > 0) {
                    {{ 'GANTT_phase_label' | translate: { name: row.name, n: round(row.progressPct) } }}
                  } @else {
                    {{ row.name }}
                  }
                </text>
              </g>
                }
                @if (row.kind === 'task') {
                <g class="gantt-row"
                   [class.gantt-row--completed]="row.task.isCompleted"
                   [class.gantt-row--subtask]="row.indent"
                   [attr.transform]="'translate(0,' + (headerHeight + ri * rowHeight) + ')'">
                  @if (hoveredTaskId === row.task.id) {
                    <rect class="gantt-hover-highlight"
                          x="0" y="0"
                          [attr.width]="chartWidth()"
                          [attr.height]="rowHeight - chipH - 4"
                          fill="rgba(74,144,226,0.10)"
                          stroke="#4a90e2" stroke-width="1.5"
                          stroke-dasharray="4,3" rx="2" />
                  }

                  <text [attr.x]="row.indent ? 20 : 8" y="28" class="gantt-task-label" fill="#404040">
                    #{{ row.task.id + 1 }}
                  </text>

                  <!-- Crashing alert: more than one active resource on this task -->
                  @if (sym.isTaskCrashing(row.task.id)) {
                    <g class="gantt-crash-alert"
                       @chipEnter
                       [attr.transform]="'translate(' + (labelWidth + row.task.resourcesAssigned.length * (chipW + 4) + 4) + ',' + (rowHeight - chipH - 4) + ')'">
                      <title>{{ 'SIMULATION_task_crashing' | translate }} ({{ sym.getNumberOfActiveResourcesOnTask(row.task.id) }})</title>
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
                        ×{{ sym.getNumberOfActiveResourcesOnTask(row.task.id) }}
                      </text>
                    </g>
                  }

                  <!-- EVM metrics on the right edge -->
                  <g [attr.transform]="'translate(' + (labelWidth + ganttSpanWeeks() * weekPx + 12) + ',0)'">
                    <text x="0" y="12" font-size="11" fill="#4a90e2">
                      PV: {{ round(row.task.pv) }}
                    </text>
                    <text x="0" y="26" font-size="11" fill="#4caf50">
                      EV: {{ round(row.task.ev) }}
                    </text>
                    <text x="0" y="40" font-size="11" fill="#e74c3c">
                      AC: {{ round(row.task.ac) }}
                    </text>
                  </g>

                  <!-- Baseline bar: frozen plan values (never move during simulation) -->
                  <rect [attr.x]="labelWidth + (baselineTasks()?.[row.task.id]?.start ?? row.task.start) * weekPx"
                        y="6"
                        [attr.width]="(baselineTasks()?.[row.task.id]?.effort ?? row.task.effort) * weekPx"
                        height="8"
                        fill="#cfd8e3" stroke="#83b9ff" />

                  <!-- Actual bar -->
                  <rect class="gantt-actual-bar"
                        [attr.x]="labelWidth + row.task.start * weekPx"
                        y="17"
                        [attr.width]="row.task.effort * weekPx"
                        height="14"
                        [attr.fill]="row.task.isCompleted ? '#8bc34a' : '#ff9f15'"
                        opacity="0.85" />

                  <!-- Completion overlay -->
                  @if (row.task.completed > 0) {
                    <rect class="gantt-completed-bar"
                          [attr.x]="labelWidth + row.task.start * weekPx"
                          y="17"
                          [attr.width]="row.task.completed * weekPx"
                          height="14"
                          fill="#4caf50" />
                  }

                  <!-- Assigned resource chips — click × to unassign -->
                  @for (r of row.task.resourcesAssigned; track r.id; let ri = $index) {
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
                              (click)="sym.unassignResourceFromTask(r.id, row.task.id)">
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
              }
            </g>

            <!-- "Now" line -->
            <line class="gantt-now-line gantt-now-line-pulse"
                  [attr.x1]="labelWidth + sim.time * weekPx"
                  [attr.x2]="labelWidth + sim.time * weekPx"
                  y1="0"
                  [attr.y2]="chartHeight()"
                  stroke="#ff0000" stroke-width="1.5" />
          </svg>

          <!-- Transparent drop-zone overlays, one per task row (aligned with ganttLayout order) -->
          @for (dr of taskDropRows(); track dr.task.id) {
            <div class="task-overlay"
                 cdkDropList
                 [cdkDropListData]="dr.task.resourcesAssigned"
                 (cdkDropListDropped)="onDrop($event, dr.task.id)"
                 (cdkDropListEntered)="hoveredTaskId = dr.task.id; isDragging = true"
                 (cdkDropListExited)="hoveredTaskId = null"
                 [style.top.px]="headerHeight + dr.rowIndex * rowHeight"
                 [style.height.px]="rowHeight - chipH - 4">
              <div class="task-drop-zone"></div>
            </div>
          }

          <!--
            Arrow overlay — rendered AFTER the task-overlay divs so it sits
            above them in z-order (both are position:absolute within the same
            stacking context; later in DOM = higher stack).
            The SVG itself has pointer-events:none so it never blocks drag-drop.
            Individual hit paths override that with pointer-events:all.
          -->
          <svg class="gantt-dep-overlay"
               [attr.width]="chartWidth()"
               [attr.height]="chartHeight()"
               style="position:absolute;top:0;left:0;overflow:visible;pointer-events:none;">

            <defs>
              <marker id="gantt-dep-arrow"
                      viewBox="0 0 10 10" refX="9" refY="5"
                      markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8"
                      orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#607d8b" />
              </marker>
              <marker id="gantt-dep-arrow-ss"
                      viewBox="0 0 10 10" refX="9" refY="5"
                      markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8"
                      orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#1976d2" />
              </marker>
              <marker id="gantt-dep-arrow-ff"
                      viewBox="0 0 10 10" refX="9" refY="5"
                      markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8"
                      orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#f57c00" />
              </marker>
              <marker id="gantt-dep-arrow-critical"
                      viewBox="0 0 10 10" refX="9" refY="5"
                      markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8"
                      orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
              </marker>
            </defs>

            @for (dep of depPaths(); track dep.key) {
              <g class="gantt-dep-group">
                <!-- 12 px transparent hit area; pointer-events:all overrides SVG none -->
                <path class="gantt-dep-hit"
                      [attr.d]="dep.d"
                      [style.pointer-events]="isDragging ? 'none' : 'all'"
                      (mouseenter)="hoveredDepKey.set(dep.key)"
                      (mouseleave)="hoveredDepKey.set(null)" />
                <path class="gantt-dep-path"
                      [class.gantt-dep-path--hovered]="hoveredDepKey() === dep.key"
                      [class.gantt-dep-path--critical]="dep.critical"
                      [attr.d]="dep.d"
                      [style.stroke]="dep.critical ? '#ef4444' : dep.type === 'SS' ? '#1976d2' : dep.type === 'FF' ? '#f57c00' : '#607d8b'"
                      [style.stroke-width]="dep.critical ? '2.2' : '1.4'"
                      [attr.marker-end]="dep.critical ? 'url(#gantt-dep-arrow-critical)' : dep.type === 'SS' ? 'url(#gantt-dep-arrow-ss)' : dep.type === 'FF' ? 'url(#gantt-dep-arrow-ff)' : 'url(#gantt-dep-arrow)'" />
              </g>
            }
          </svg>
        </div>
      }
    }
  `,
})
export class GanttComponent {
  readonly config   = inject(ConfigService);
  readonly sym      = inject(SymulatorService);
  /** `input` + `sym.scenario()` in `ganttLayout` so rows update every tick (mutated in-place). */
  readonly scenario = input.required<Scenario>();

  /** Phase `key` values whose subtask rows are **hidden** (collapsed). */
  private readonly _collapsedPhases = signal<ReadonlySet<string>>(new Set());

  hoveredTaskId: number | null = null;
  isDragging = false;
  readonly hoveredDepKey = signal<string | null>(null);

  @HostListener('document:pointerup')
  onPointerUp(): void {
    this.isDragging = false;
    this.hoveredDepKey.set(null);
  }
  readonly depPaths = computed(() => this.buildDepPaths());

  /** Frozen plan task positions — used for the baseline bar (never updated during simulation). */
  readonly baselineTasks = computed(() =>
    this.scenario().plan?.tasks as unknown as Array<{ start: number; effort: number }> | undefined,
  );

  /** Wider when project / deadline (or “now” line) extends past 15 weeks. */
  readonly ganttSpanWeeks = computed(() => {
    this.scenario();
    this.sym.scenario();
    this.sym.simulation();
    return this.sym.getGanttSpanWeeks();
  });

  /**
   * MS Project order: for each `taskGroups` entry, one summary row then its
   * member tasks in `sim.tasks` order. Unassigned tasks follow.
   * Summary: min(start)–max(end), progress = Σ completed / Σ effort.
   */
  readonly ganttLayout = computed((): GanttRow[] => {
    this.sym.scenario();
    this._collapsedPhases();
    const s   = this.scenario();
    const sim = this.sym.simulation();
    if (!sim) return [];
    const groups = s.taskGroups;
    if (!groups?.length) {
      return sim.tasks.map((task) => ({
        kind: 'task' as const,
        key: `t-${task.id}`,
        task,
        indent: false,
      })) as GanttRow[];
    }
    const collapsed = this._collapsedPhases();
    const rows: GanttRow[] = [];
    const covered = new Set<number>();
    for (let gi = 0; gi < groups.length; gi++) {
      const g   = groups[gi]!;
      const idSet = new Set(g.taskIds);
      const inGroup = g.taskIds
        .map((id) => sim.tasks.find((t) => t.id === id))
        .filter((t): t is (typeof sim.tasks)[number] => t != null);
      const m = this.phaseMetrics(inGroup);
      const phaseKey   = `p-${gi}-${g.name}`;
      const hasSubtasks = inGroup.length > 0;
      rows.push({
        kind: 'phase',
        key: phaseKey,
        name: g.name,
        hasChildTasks: hasSubtasks,
        ...m,
      } as GanttRow);
      if (hasSubtasks && collapsed.has(phaseKey)) {
        g.taskIds.forEach((id) => covered.add(id));
        continue;
      }
      for (const task of sim.tasks) {
        if (idSet.has(task.id)) {
          covered.add(task.id);
          rows.push({ kind: 'task', key: `t-${task.id}`, task, indent: true } as GanttRow);
        }
      }
    }
    for (const task of sim.tasks) {
      if (covered.has(task.id)) continue;
      rows.push({ kind: 'task', key: `t-${task.id}`, task, indent: false } as GanttRow);
    }
    return rows;
  });

  /** Drop-overlay row indices aligned with the SVG. */
  readonly taskDropRows = computed((): { task: Extract<GanttRow, { kind: 'task' }>['task']; rowIndex: number }[] => {
    const out: { task: Extract<GanttRow, { kind: 'task' }>['task']; rowIndex: number }[] = [];
    this.ganttLayout().forEach((row, i) => {
      if (row.kind === 'task') out.push({ task: row.task, rowIndex: i });
    });
    return out;
  });

  private phaseMetrics(
    inGroup: Array<{ start: number; end?: number; effort: number; completed: number }>,
  ): { start: number; end: number; span: number; effortTotal: number; progressPct: number; progressW: number } {
    if (inGroup.length === 0) {
      return { start: 0, end: 0, span: 0, effortTotal: 0, progressPct: 0, progressW: 0 };
    }
    const start = Math.min(...inGroup.map((t) => t.start));
    const end   = Math.max(...inGroup.map((t) => t.end ?? t.start + t.effort));
    const span  = Math.max(0, end - start);
    const effortTotal    = inGroup.reduce((a, t) => a + t.effort, 0);
    const completedTotal = inGroup.reduce((a, t) => a + t.completed, 0);
    const progressRatio  = effortTotal > 0
      ? Math.min(1, Math.max(0, completedTotal / effortTotal))
      : 0;
    return {
      start,
      end,
      span,
      effortTotal,
      progressPct: Math.round(100 * progressRatio),
      progressW:   span * progressRatio,
    };
  }

  readonly labelWidth   = 40;
  readonly headerHeight = 24;
  readonly rowHeight    = 64;
  readonly weekPx       = 60;
  readonly chipW        = 76;
  readonly chipH        = 20;
  readonly metricsWidth = 90;

  readonly weeks = computed(() => {
    const n = this.ganttSpanWeeks() + 1;
    return Array.from({ length: n }, (_, i) => i);
  });

  chartWidth(): number {
    return this.labelWidth + this.ganttSpanWeeks() * this.weekPx + this.metricsWidth + 20;
  }

  round(value: number | undefined): number {
    return Math.round(value ?? 0);
  }

  isPhaseRowExpanded(phaseKey: string): boolean {
    return !this._collapsedPhases().has(phaseKey);
  }

  togglePhaseExpander(phaseKey: string, event: Event): void {
    event.stopPropagation();
    this._collapsedPhases.update((s) => {
      const n = new Set(s);
      if (n.has(phaseKey)) n.delete(phaseKey);
      else n.add(phaseKey);
      return n;
    });
  }

  /** Y / height in px — matches row layout. */
  private readonly phaseBarY  = 5;
  private readonly phaseBarH  = 26;

  /**
   * Full summary bar: flat top, bottom = “W” with two downward tips (lowest y at
   * start and end of the bar, valley in the middle) — like MS Project summary.
   */
  phasePathFull(startWeek: number, spanWeek: number): string {
    const x0 = this.labelWidth + startWeek * this.weekPx;
    return this.summaryBottomWPathPx(x0, spanWeek * this.weekPx);
  }

  /** t = half-width of each end “tooth”; d = valley height (up from bottom). */
  private summaryBottomWPathPx(x0: number, wPx: number): string {
    const y  = this.phaseBarY;
    const h  = this.phaseBarH;
    const yB = y + h;
    if (wPx <= 0) return '';
    const t    = Math.min(10, wPx * 0.12);
    const dVal = Math.min(6, h * 0.22);
    if (wPx < 2 * t + 2) {
      return `M ${x0} ${y} L ${x0 + wPx} ${y} L ${x0 + wPx} ${yB} L ${x0} ${yB} Z`;
    }
    // CCW: top → right down → right tip (low) → up to valley → across → down to left tip → up left
    return (
      `M ${x0} ${y} L ${x0 + wPx} ${y} L ${x0 + wPx} ${yB} L ${x0 + wPx - t} ${yB - dVal} L ${x0 + t} ${yB - dVal} L ${x0} ${yB} Z`
    );
  }

  chartHeight(): number {
    return this.headerHeight + this.ganttLayout().length * this.rowHeight + 20;
  }

  /**
   * Build SVG paths for dependency arrows between planned bars.
   * FS (gray / red on CP) — predecessor end   → successor start
   * SS (blue)             — predecessor start → successor start
   * FF (orange)           — predecessor end   → successor end
   */
  private buildDepPaths(): { key: string; d: string; type: DependencyType; critical: boolean }[] {
    const sim = this.sym.simulation();
    const s    = this.scenario();
    const defs = s?.tasks;
    if (!sim || !defs) return [];

    const criticalLinks = this.computeCriticalLinks(sim.tasks, defs);

    const rowOf = new Map<number, number>();
    this.ganttLayout().forEach((row, i) => {
      if (row.kind === 'task') rowOf.set(row.task.id, i);
    });

    const barCenterY = 24;   // vertical center of the actual bar (y=17, h=14)
    const headTrim   = 6;
    const tailLen    = 14;
    const exitLen    = 10;
    const r          = 6;

    const paths: { key: string; d: string; type: DependencyType; critical: boolean }[] = [];

    for (const task of sim.tasks) {
      const def  = defs.find(t => t.id === task.id);
      const deps = def?.dependsOn ?? [];
      if (deps.length === 0) continue;

      const suc    = sim.tasks[task.id];
      const sucIdx = rowOf.get(task.id);
      if (!suc || sucIdx == null) continue;

      const sucStartX = this.labelWidth + suc.start * this.weekPx;
      const sucEndX   = this.labelWidth + (suc.start + suc.effort) * this.weekPx;
      const sucY      = this.headerHeight + sucIdx * this.rowHeight + barCenterY;

      for (const dep of deps) {
        const pred    = sim.tasks[dep.id];
        const predIdx = rowOf.get(dep.id);
        if (!pred || predIdx == null) continue;

        const predStartX = this.labelWidth + pred.start * this.weekPx;
        const predEndX   = this.labelWidth + (pred.start + pred.effort) * this.weekPx;
        const predY      = this.headerHeight + predIdx * this.rowHeight + barCenterY;
        const dir: -1 | 0 | 1 = sucIdx > predIdx ? 1 : sucIdx < predIdx ? -1 : 0;
        const opts = { tailLen, exitLen, r, rowHeight: this.rowHeight };

        let d: string;
        if (dep.type === 'SS') {
          d = this.buildSSPath(predStartX, predY, sucStartX - headTrim, sucY, dir, opts);
        } else if (dep.type === 'FF') {
          d = this.buildFFPath(predEndX, predY, sucEndX + headTrim, sucY, dir, opts);
        } else {
          d = this.buildDepPath(predEndX, predY, sucStartX - headTrim, sucY, dir, opts);
        }

        const key = `${dep.id}->${task.id}-${dep.type}`;
        paths.push({ key, d, type: dep.type, critical: criticalLinks.has(key) });
      }
    }

    return paths;
  }

  /**
   * CPM backward pass over the current sim task positions.
   * Returns the set of link keys (format: "predId->succId-type") that lie on
   * the critical path — i.e. both endpoint tasks have zero total float AND the
   * FS link between them is tight (pred.end ≈ succ.start).
   *
   * Only FS links are considered for the critical path (SS/FF are kept as-is).
   * The backward pass iterates up to N times so it converges regardless of
   * task ordering in the array.
   */
  private computeCriticalLinks(
    tasks: Array<{ start: number; end: number; effort: number }>,
    defs:  import('@core/models/task.model').Task[],
  ): Set<string> {
    const n = tasks.length;
    const eps = 1e-4;

    const projectEnd = tasks.reduce((m, t) => Math.max(m, t.end ?? t.start + t.effort), 0);
    const LF = new Array<number>(n).fill(projectEnd);

    for (let pass = 0; pass < n; pass++) {
      let changed = false;
      for (let i = 0; i < n; i++) {
        for (const dep of (defs[i]?.dependants ?? [])) {
          if ((dep.type ?? 'FS') !== 'FS') continue;
          const j = dep.id;
          if (j == null || j >= n) continue;
          const succLS = LF[j] - tasks[j].effort;
          if (succLS < LF[i] - eps) { LF[i] = succLS; changed = true; }
        }
      }
      if (!changed) break;
    }

    const criticalTasks = new Set<number>();
    tasks.forEach((t, i) => {
      if (LF[i] - (t.end ?? t.start + t.effort) < eps) criticalTasks.add(i);
    });

    const criticalLinks = new Set<string>();
    defs.forEach((def, i) => {
      if (!criticalTasks.has(i)) return;
      for (const dep of (def?.dependsOn ?? [])) {
        const j = dep.id;
        if ((dep.type ?? 'FS') !== 'FS' || !criticalTasks.has(j)) continue;
        const predEF = tasks[j].end ?? tasks[j].start + tasks[j].effort;
        if (Math.abs(predEF - tasks[i].start) < eps) {
          criticalLinks.add(`${j}->${i}-FS`);
        }
      }
    });

    return criticalLinks;
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

  /**
   * SS path: exit LEFT from predecessor start, travel vertically, enter RIGHT at
   * successor start.  `tx` should already include the headTrim offset.
   */
  private buildSSPath(
    sx: number, sy: number,
    tx: number, ty: number,
    dir: -1 | 0 | 1,
    o: { exitLen: number; r: number; rowHeight: number },
  ): string {
    const { exitLen, r } = o;

    if (dir === 0 || Math.abs(ty - sy) < 1) {
      return `M ${sx} ${sy} H ${tx}`;
    }

    // Exit to the left of both bar starts so the arrow never overlaps bar bodies.
    const laneX  = Math.min(sx, tx) - exitLen;
    const turn1Y = sy + dir * r;
    const turn2Y = ty - dir * r;

    if ((dir === 1 && turn2Y < turn1Y) || (dir === -1 && turn2Y > turn1Y)) {
      return `M ${sx} ${sy} H ${laneX} L ${tx} ${ty}`;
    }

    return (
      `M ${sx} ${sy} ` +
      `H ${laneX + r} ` +
      `Q ${laneX} ${sy}, ${laneX} ${turn1Y} ` +
      `V ${turn2Y} ` +
      `Q ${laneX} ${ty}, ${laneX + r} ${ty} ` +
      `H ${tx}`
    );
  }

  /**
   * FF path: exit RIGHT from predecessor end, travel vertically, enter LEFT at
   * successor end.  The last segment goes rightward → leftward so `marker-end`
   * auto-orients the arrowhead to point left (into the bar's right edge).
   * `tx` should already include the headTrim offset (i.e. sucEndX + headTrim).
   */
  private buildFFPath(
    sx: number, sy: number,
    tx: number, ty: number,
    dir: -1 | 0 | 1,
    o: { exitLen: number; r: number; rowHeight: number },
  ): string {
    const { exitLen, r } = o;

    if (dir === 0 || Math.abs(ty - sy) < 1) {
      // Same row: go right past both ends, then come back left.
      const laneX = Math.max(sx, tx) + exitLen;
      return `M ${sx} ${sy} H ${laneX} V ${ty} H ${tx}`;
    }

    // Stay to the right of both bar ends so the arrow never overlaps bar bodies.
    const laneX  = Math.max(sx, tx) + exitLen;
    const turn1Y = sy + dir * r;
    const turn2Y = ty - dir * r;

    if ((dir === 1 && turn2Y < turn1Y) || (dir === -1 && turn2Y > turn1Y)) {
      return `M ${sx} ${sy} H ${laneX} L ${tx} ${ty}`;
    }

    return (
      `M ${sx} ${sy} ` +
      `H ${laneX - r} ` +
      `Q ${laneX} ${sy}, ${laneX} ${turn1Y} ` +
      `V ${turn2Y} ` +
      `Q ${laneX} ${ty}, ${laneX - r} ${ty} ` +
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
