import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminScenarioService, FirestoreScenario } from '@core/services/admin-scenario.service';
import { ScenarioService } from '@core/services/scenario.service';
import { ScenarioBundle } from '@core/models/scenario.model';
import { ConfigService } from '@core/services/config.service';

// ── Editor types ────────────────────────────────────────────────────────────

type DepType = 'FS' | 'SS' | 'FF';

interface EditorDep { taskIndex: number; type: DepType; }

interface EditorTask {
  start: number;
  effort: number;
  dependsOn: EditorDep[];
}

interface EditorResource {
  name: string;
  speed: number;   // 0.8 | 1.0 | 1.2
  cost: number;    // 0.8 | 1.0 | 1.2
  color: string;
}

interface EditorGroup {
  name: string;
  taskIds: number[];
}

interface EditorState {
  firestoreId?: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  type: string;
  multitaskingPenalty: number;
  crashingPenalty: number;
  tasks: EditorTask[];
  resources: EditorResource[];
  taskGroups: EditorGroup[];
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
    .admin-wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
    .admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .admin-header h2 { margin: 0; font-size: 1.4rem; color: #e2e8f0; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #2d3748; }
    th { background: #1a202c; color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; }
    td { color: #cbd5e0; }
    tr:hover td { background: #1a202c; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
    .badge-training { background: #1e3a5f; color: #63b3ed; }
    .badge-tournament { background: #3d1a00; color: #f6ad55; }
    .badge-other { background: #1a202c; color: #718096; }
    .btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: opacity .15s; }
    .btn:hover:not(:disabled) { opacity: .85; }
    .btn:disabled { opacity: .4; cursor: not-allowed; }
    .btn-primary { background: #3b82f6; color: #fff; }
    .btn-secondary { background: #2d3748; color: #e2e8f0; }
    .btn-danger { background: #e53e3e; color: #fff; }
    .btn-warning { background: #d97706; color: #fff; }
    .btn-sm { padding: 3px 8px; font-size: 12px; }
    .btn-import { background: #059669; color: #fff; }
    .btn-ghost { background: transparent; color: #94a3b8; border: 1px solid #2d3748; }
    .btn-ghost:hover:not(:disabled) { color: #e2e8f0; border-color: #4a5568; }
    .gap-2 { gap: 8px; }
    .d-flex { display: flex; }

    /* Modal */
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.75); z-index: 1000; display: flex; align-items: flex-start; justify-content: center; padding: 32px 16px 40px; overflow-y: auto; }
    .modal-box { background: #1a202c; border: 1px solid #2d3748; border-radius: 10px; width: 100%; max-width: 820px; padding: 28px; color: #cbd5e0; }
    .modal-title { font-size: 1.2rem; font-weight: 700; color: #e2e8f0; margin-bottom: 20px; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #2d3748; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
    .form-control { width: 100%; box-sizing: border-box; background: #0d1117; border: 1px solid #2d3748; border-radius: 6px; color: #e2e8f0; padding: 7px 10px; font-size: 13px; font-family: inherit; outline: none; }
    .form-control:focus { border-color: #3b82f6; }
    select.form-control { cursor: pointer; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

    /* Section dividers */
    .section-head { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .07em; margin: 20px 0 10px; display: flex; align-items: center; justify-content: space-between; }
    .divider { border: none; border-top: 1px solid #2d3748; margin: 0 0 12px; }

    /* Task rows */
    .task-card { background: #0d1117; border: 1px solid #2d3748; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; }
    .task-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .task-num { font-weight: 700; font-size: 13px; color: #63b3ed; min-width: 28px; }
    .task-fields { display: flex; gap: 12px; align-items: flex-end; flex: 1; flex-wrap: wrap; }
    .field-mini { display: flex; flex-direction: column; gap: 4px; }
    .field-mini label { font-size: 10px; color: #718096; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
    .input-mini { background: #1a202c; border: 1px solid #2d3748; border-radius: 5px; color: #e2e8f0; padding: 5px 8px; font-size: 13px; font-family: inherit; outline: none; width: 72px; }
    .input-mini:focus { border-color: #3b82f6; }
    .dep-list { margin-top: 8px; padding-top: 8px; border-top: 1px solid #1a202c; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .dep-chip { display: flex; align-items: center; gap: 4px; background: #1a202c; border: 1px solid #2d3748; border-radius: 20px; padding: 3px 8px; font-size: 12px; }
    .dep-chip select { background: transparent; border: none; color: #94a3b8; font-size: 12px; padding: 0; cursor: pointer; outline: none; }
    .dep-chip select:focus { outline: none; }
    .dep-chip .dep-type { color: #f6ad55; font-weight: 700; font-size: 11px; }
    .dep-remove { background: none; border: none; color: #718096; cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1; }
    .dep-remove:hover { color: #fc8181; }
    .dep-label { font-size: 10px; color: #4a5568; margin-right: 4px; }

    /* Resource rows */
    .resource-row { display: flex; align-items: center; gap: 10px; background: #0d1117; border: 1px solid #2d3748; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
    .res-num { font-weight: 700; font-size: 13px; color: #68d391; min-width: 28px; }
    .res-color-swatch { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #2d3748; cursor: pointer; flex-shrink: 0; overflow: hidden; }
    .res-color-swatch input[type=color] { opacity: 0; width: 100%; height: 100%; cursor: pointer; border: none; padding: 0; }
    .res-name { flex: 1; }
    .select-sm { background: #1a202c; border: 1px solid #2d3748; border-radius: 5px; color: #e2e8f0; padding: 5px 8px; font-size: 12px; font-family: inherit; outline: none; cursor: pointer; }
    .select-sm:focus { border-color: #3b82f6; }

    /* Status */
    .alert { padding: 10px 16px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
    .alert-success { background: #064e3b; color: #6ee7b7; }
    .alert-error { background: #450a0a; color: #fca5a5; }
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .row-actions { display: flex; gap: 6px; }
    .btn-test { background: #0d9488; color: #fff; }
    .group-card { background: #0d1117; border: 1px solid #2d3748; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; }
    .group-tasks { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .task-check { display: inline-flex; align-items: center; gap: 5px; background: #1a202c; border: 1px solid #2d3748; border-radius: 20px; padding: 3px 10px; font-size: 12px; cursor: pointer; user-select: none; color: #94a3b8; }
    .task-check input[type=checkbox] { cursor: pointer; accent-color: #3b82f6; }
    .task-check.checked { border-color: #3b82f6; color: #63b3ed; }
    .empty-list { text-align: center; padding: 40px 0; color: #4a5568; font-size: 14px; }
  `],
  template: `
    <div class="admin-wrap">
      <div class="admin-header">
        <h2>Scenario Admin</h2>
        <div class="d-flex gap-2">
          <button class="btn btn-import" (click)="importFromJson()" [disabled]="loading() || importLoading()">
            @if (importLoading()) { <span class="spinner"></span> } Import from JSON
          </button>
          <button class="btn btn-primary" (click)="openNew()">+ New scenario</button>
        </div>
      </div>

      @if (statusMsg()) {
        <div class="alert" [class.alert-success]="!statusError()" [class.alert-error]="statusError()">
          {{ statusMsg() }}
        </div>
      }

      @if (loading()) {
        <p class="empty-list">Loading scenarios…</p>
      } @else if (scenarios().length === 0) {
        <p class="empty-list">
          No scenarios in Firestore yet.<br>
          Click <strong>Import from JSON</strong> to migrate, or <strong>+ New scenario</strong> to create one.
        </p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:40px">#</th>
                <th>Name</th>
                <th>Name EN</th>
                <th>Type</th>
                <th>Tasks</th>
                <th>Resources</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (s of scenarios(); track s.firestoreId; let i = $index) {
                <tr>
                  <td style="color:#4a5568">{{ i + 1 }}</td>
                  <td>{{ s.name }}</td>
                  <td>{{ s.nameEn || '—' }}</td>
                  <td><span class="badge" [class]="badgeClass(s.type)">{{ s.type || 'none' }}</span></td>
                  <td>{{ s.tasks.length }}</td>
                  <td>{{ s.resources.length }}</td>
                  <td>
                    <div class="row-actions">
                      <button class="btn btn-secondary btn-sm" (click)="openEdit(s)">Edit</button>
                      <button class="btn btn-test btn-sm" (click)="testScenario(i, s.type)">Test</button>
                      <button class="btn btn-warning btn-sm" (click)="moveUp(i)" [disabled]="i === 0">↑</button>
                      <button class="btn btn-warning btn-sm" (click)="moveDown(i)" [disabled]="i === scenarios().length - 1">↓</button>
                      <button class="btn btn-danger btn-sm" (click)="confirmDelete(s)">Delete</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- ── Editor modal ────────────────────────────────────────────────────── -->
    @if (editorOpen()) {
      <div class="modal-backdrop" (click)="onBackdropClick($event)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-title">{{ editorState.firestoreId ? 'Edit scenario' : 'New scenario' }}</div>

          <!-- Meta -->
          <div class="form-row">
            <div class="form-group">
              <label>Name (PL)</label>
              <input class="form-control" [(ngModel)]="editorState.name" placeholder="Nazwa scenariusza" />
            </div>
            <div class="form-group">
              <label>Name (EN)</label>
              <input class="form-control" [(ngModel)]="editorState.nameEn" placeholder="Scenario name" />
            </div>
          </div>
          <div class="form-group">
            <label>Description (PL)</label>
            <textarea class="form-control" rows="2" [(ngModel)]="editorState.description"></textarea>
          </div>
          <div class="form-group">
            <label>Description (EN)</label>
            <textarea class="form-control" rows="2" [(ngModel)]="editorState.descriptionEn"></textarea>
          </div>
          <div class="form-row-3">
            <div class="form-group">
              <label>Type</label>
              <select class="form-control" [(ngModel)]="editorState.type">
                <option value="">— none —</option>
                <option value="training">training</option>
                <option value="tournament">tournament</option>
              </select>
            </div>
            <div class="form-group">
              <label>Multitasking penalty</label>
              <input class="form-control" type="number" step="0.05" min="0" max="1" [(ngModel)]="editorState.multitaskingPenalty" />
            </div>
            <div class="form-group">
              <label>Crashing penalty</label>
              <input class="form-control" type="number" step="0.05" min="0" max="1" [(ngModel)]="editorState.crashingPenalty" />
            </div>
          </div>

          <!-- Tasks -->
          <div class="section-head">
            <span>Tasks ({{ editorState.tasks.length }})</span>
            <button class="btn btn-ghost btn-sm" type="button" (click)="addTask()">+ Add task</button>
          </div>
          <hr class="divider">

          @for (task of editorState.tasks; track task; let ti = $index) {
            <div class="task-card">
              <div class="task-header">
                <span class="task-num">T{{ ti + 1 }}</span>
                <div class="task-fields">
                  <div class="field-mini">
                    <label>Start (wk)</label>
                    <input class="input-mini" type="number" step="0.1" min="0"
                           [value]="task.start"
                           (change)="setTaskField(ti, 'start', +getInputValue($event))" />
                  </div>
                  <div class="field-mini">
                    <label>Effort (wk)</label>
                    <input class="input-mini" type="number" step="0.1" min="0.1"
                           [value]="task.effort"
                           (change)="setTaskField(ti, 'effort', +getInputValue($event))" />
                  </div>
                </div>
                <button class="btn btn-danger btn-sm" type="button" (click)="removeTask(ti)" style="margin-left:auto">× Remove</button>
              </div>

              <!-- Dependencies -->
              <div class="dep-list">
                <span class="dep-label">Predecessors:</span>
                @for (dep of task.dependsOn; track dep; let di = $index) {
                  <span class="dep-chip">
                    <select (change)="setDepTask(ti, di, +getInputValue($event))">
                      @for (t2 of editorState.tasks; track t2; let t2i = $index) {
                        @if (t2i !== ti) {
                          <option [value]="t2i" [selected]="t2i === dep.taskIndex">T{{ t2i + 1 }}</option>
                        }
                      }
                    </select>
                    <select class="dep-type" (change)="setDepType(ti, di, getInputValue($event))">
                      <option value="FS" [selected]="dep.type === 'FS'">FS</option>
                      <option value="SS" [selected]="dep.type === 'SS'">SS</option>
                      <option value="FF" [selected]="dep.type === 'FF'">FF</option>
                    </select>
                    <button class="dep-remove" type="button" (click)="removeDep(ti, di)">×</button>
                  </span>
                }
                @if (editorState.tasks.length > 1) {
                  <button class="btn btn-ghost btn-sm" type="button" (click)="addDep(ti)">+ Dep</button>
                }
              </div>
            </div>
          }

          @if (editorState.tasks.length === 0) {
            <p style="color:#4a5568; font-size:13px; text-align:center; padding:12px 0">
              No tasks yet. Click <strong>+ Add task</strong> to start.
            </p>
          }

          <!-- Resources -->
          <div class="section-head" style="margin-top:24px">
            <span>Resources ({{ editorState.resources.length }})</span>
            <button class="btn btn-ghost btn-sm" type="button" (click)="addResource()">+ Add resource</button>
          </div>
          <hr class="divider">

          @for (res of editorState.resources; track res; let ri = $index) {
            <div class="resource-row">
              <span class="res-num">R{{ ri + 1 }}</span>
              <span class="res-color-swatch" [style.background]="res.color">
                <input type="color" [value]="res.color"
                       (change)="setResField(ri, 'color', getInputValue($event))" />
              </span>
              <input class="form-control res-name" type="text" placeholder="Name"
                     [value]="res.name"
                     (change)="setResField(ri, 'name', getInputValue($event))" />
              <div class="field-mini">
                <label>Speed</label>
                <select class="select-sm" (change)="setResField(ri, 'speed', +getInputValue($event))">
                  <option [value]="0.8" [selected]="res.speed === 0.8">slow (0.8×)</option>
                  <option [value]="1"   [selected]="res.speed === 1">normal (1×)</option>
                  <option [value]="1.2" [selected]="res.speed === 1.2">fast (1.2×)</option>
                </select>
              </div>
              <div class="field-mini">
                <label>Cost</label>
                <select class="select-sm" (change)="setResField(ri, 'cost', +getInputValue($event))">
                  <option [value]="0.8" [selected]="res.cost === 0.8">cheap (0.8×)</option>
                  <option [value]="1"   [selected]="res.cost === 1">normal (1×)</option>
                  <option [value]="1.2" [selected]="res.cost === 1.2">expensive (1.2×)</option>
                </select>
              </div>
              <button class="btn btn-danger btn-sm" type="button" (click)="removeResource(ri)" style="flex-shrink:0">×</button>
            </div>
          }

          @if (editorState.resources.length === 0) {
            <p style="color:#4a5568; font-size:13px; text-align:center; padding:12px 0">
              No resources yet. Click <strong>+ Add resource</strong> to start.
            </p>
          }

          <!-- Task Groups -->
          <div class="section-head" style="margin-top:24px">
            <span>Task Groups ({{ editorState.taskGroups.length }})</span>
            <button class="btn btn-ghost btn-sm" type="button" (click)="addGroup()">+ Add group</button>
          </div>
          <hr class="divider">

          @for (group of editorState.taskGroups; track group; let gi = $index) {
            <div class="group-card">
              <div style="display:flex; align-items:center; gap:10px;">
                <input class="form-control" type="text" placeholder="Group name"
                       [value]="group.name"
                       (input)="setGroupName(gi, getInputValue($event))" />
                <button class="btn btn-danger btn-sm" type="button" (click)="removeGroup(gi)" style="flex-shrink:0">× Remove</button>
              </div>
              <div class="group-tasks">
                @for (task of editorState.tasks; track task; let ti = $index) {
                  <label class="task-check" [class.checked]="isInGroup(gi, ti)">
                    <input type="checkbox" [checked]="isInGroup(gi, ti)" (change)="toggleGroupTask(gi, ti)" />
                    T{{ ti + 1 }}
                  </label>
                }
                @if (editorState.tasks.length === 0) {
                  <span style="color:#4a5568; font-size:12px">Add tasks first.</span>
                }
              </div>
            </div>
          }

          @if (editorState.taskGroups.length === 0) {
            <p style="color:#4a5568; font-size:13px; text-align:center; padding:12px 0">
              No groups yet. Click <strong>+ Add group</strong> to organize tasks into phases.
            </p>
          }

          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" (click)="editorOpen.set(false)">Cancel</button>
            <button class="btn btn-primary" type="button" (click)="saveEditor()" [disabled]="saveLoading()">
              @if (saveLoading()) { <span class="spinner"></span> } Save
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminComponent implements OnInit {
  private readonly adminSvc = inject(AdminScenarioService);
  private readonly scenarioSvc = inject(ScenarioService);
  private readonly config = inject(ConfigService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly scenarios   = signal<FirestoreScenario[]>([]);
  readonly loading     = signal(true);
  readonly importLoading = signal(false);
  readonly saveLoading = signal(false);
  readonly editorOpen  = signal(false);
  readonly statusMsg   = signal('');
  readonly statusError = signal(false);

  // Plain mutable object — no signal nesting needed since Default CD picks up changes
  editorState: EditorState = this.blankState();

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async ngOnInit() {
    await this.loadScenarios();
  }

  private async loadScenarios() {
    this.loading.set(true);
    try {
      this.scenarios.set(await this.adminSvc.getScenarios());
    } catch (err) {
      console.error('[Admin] getScenarios failed', err);
      this.showStatus('Failed to load scenarios from Firestore.', true);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Editor helpers ────────────────────────────────────────────────────────

  private blankState(): EditorState {
    return {
      name: '', nameEn: '', description: '', descriptionEn: '',
      type: '', multitaskingPenalty: 0.2, crashingPenalty: 0.1,
      tasks: [], resources: [], taskGroups: [],
    };
  }

  openNew() {
    this.editorState = this.blankState();
    this.editorOpen.set(true);
  }

  openEdit(s: FirestoreScenario) {
    this.editorState = {
      firestoreId: s.firestoreId,
      name: s.name ?? '',
      nameEn: s.nameEn ?? '',
      description: s.description ?? '',
      descriptionEn: s.descriptionEn ?? '',
      type: s.type ?? '',
      multitaskingPenalty: s.multitaskingPenalty,
      crashingPenalty: s.crashingPenalty,
      tasks: this.deserializeTasks(s.tasks as RawTask[]),
      resources: this.deserializeResources(s.resources as RawResource[]),
      taskGroups: (s.taskGroups ?? []).map((g) => ({ name: g.name, taskIds: [...g.taskIds] })),
    };
    this.editorOpen.set(true);
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.editorOpen.set(false);
    }
  }

  // ── Task mutations ────────────────────────────────────────────────────────

  addTask() {
    this.editorState.tasks.push({ start: 0, effort: 1, dependsOn: [] });
  }

  removeTask(i: number) {
    this.editorState.tasks.splice(i, 1);
    // Remove all deps pointing to the removed task; fix indices for later tasks
    this.editorState.tasks.forEach((t) => {
      t.dependsOn = t.dependsOn
        .filter((d) => d.taskIndex !== i)
        .map((d) => ({ ...d, taskIndex: d.taskIndex > i ? d.taskIndex - 1 : d.taskIndex }));
    });
    // Remove deleted task from groups; shift higher indices down
    this.editorState.taskGroups.forEach((g) => {
      g.taskIds = g.taskIds
        .filter((id) => id !== i)
        .map((id) => (id > i ? id - 1 : id));
    });
  }

  setTaskField(i: number, field: 'start' | 'effort', value: number) {
    const t = this.editorState.tasks[i];
    if (t) t[field] = value;
  }

  addDep(taskIndex: number) {
    const task = this.editorState.tasks[taskIndex];
    if (!task) return;
    const otherIndex = taskIndex === 0 ? 1 : 0;
    if (otherIndex >= this.editorState.tasks.length) return;
    task.dependsOn.push({ taskIndex: otherIndex, type: 'FS' });
  }

  removeDep(taskIndex: number, depIndex: number) {
    this.editorState.tasks[taskIndex]?.dependsOn.splice(depIndex, 1);
  }

  setDepTask(taskIndex: number, depIndex: number, newTaskIndex: number) {
    const dep = this.editorState.tasks[taskIndex]?.dependsOn[depIndex];
    if (dep) dep.taskIndex = newTaskIndex;
  }

  setDepType(taskIndex: number, depIndex: number, type: string) {
    const dep = this.editorState.tasks[taskIndex]?.dependsOn[depIndex];
    if (dep) dep.type = type as DepType;
  }

  // ── Resource mutations ────────────────────────────────────────────────────

  addResource() {
    const i = this.editorState.resources.length;
    this.editorState.resources.push({
      name: this.config.resourceNames[i] ?? `R${i + 1}`,
      speed: 1,
      cost: 1,
      color: this.config.resourceColors[i] ?? '#cccccc',
    });
  }

  removeResource(i: number) {
    this.editorState.resources.splice(i, 1);
  }

  setResField(i: number, field: keyof EditorResource, value: string | number) {
    const r = this.editorState.resources[i];
    if (!r) return;
    if (field === 'name' || field === 'color') r[field] = value as string;
    else r[field] = value as number;
  }

  // ── Task group mutations ──────────────────────────────────────────────────

  addGroup() {
    this.editorState.taskGroups.push({ name: `Group ${this.editorState.taskGroups.length + 1}`, taskIds: [] });
  }

  removeGroup(gi: number) {
    this.editorState.taskGroups.splice(gi, 1);
  }

  setGroupName(gi: number, name: string) {
    const g = this.editorState.taskGroups[gi];
    if (g) g.name = name;
  }

  toggleGroupTask(gi: number, taskIdx: number) {
    const g = this.editorState.taskGroups[gi];
    if (!g) return;
    const pos = g.taskIds.indexOf(taskIdx);
    if (pos === -1) g.taskIds.push(taskIdx);
    else g.taskIds.splice(pos, 1);
  }

  isInGroup(gi: number, taskIdx: number): boolean {
    return this.editorState.taskGroups[gi]?.taskIds.includes(taskIdx) ?? false;
  }

  // ── Template helper ───────────────────────────────────────────────────────

  getInputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async saveEditor() {
    const e = this.editorState;
    const existing = this.scenarios();
    const sortOrder = e.firestoreId
      ? (existing.find((s) => s.firestoreId === e.firestoreId)?.sortOrder ?? existing.length)
      : existing.length;

    const payload: FirestoreScenario = {
      firestoreId: e.firestoreId,
      sortOrder,
      name: e.name,
      nameEn: e.nameEn || undefined,
      description: e.description || undefined,
      descriptionEn: e.descriptionEn || undefined,
      type: e.type || undefined,
      multitaskingPenalty: e.multitaskingPenalty,
      crashingPenalty: e.crashingPenalty,
      tasks: this.serializeTasks(e.tasks),
      resources: this.serializeResources(e.resources),
      taskGroups: e.taskGroups.length > 0 ? e.taskGroups : undefined,
    };

    this.saveLoading.set(true);
    try {
      await this.adminSvc.saveScenario(payload);
      this.editorOpen.set(false);
      this.scenarioSvc.invalidateBundleCache();
      await this.loadScenarios();
      this.showStatus('Scenario saved.', false);
    } catch (err) {
      console.error('[Admin] saveScenario failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      this.showStatus(`Failed to save: ${msg}`, true);
    } finally {
      this.saveLoading.set(false);
    }
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  private serializeTasks(tasks: EditorTask[]): RawTask[] {
    const result: RawTask[] = tasks.map((t, id) => ({
      id,
      start: t.start,
      effort: t.effort,
      dependsOn: t.dependsOn
        .filter((d) => d.taskIndex >= 0 && d.taskIndex < tasks.length && d.taskIndex !== id)
        .map((d) => ({ id: d.taskIndex, type: d.type })),
      dependants: [] as RawDep[],
    }));
    // Compute reverse links (dependsOn at this point are all RawDep, not numbers)
    result.forEach((task, i) => {
      (task.dependsOn as RawDep[]).forEach((dep) => {
        const pred = result[dep.id];
        if (pred) {
          pred.dependants = pred.dependants ?? [];
          if (!pred.dependants.some((d) => d.id === i)) {
            pred.dependants.push({ id: i, type: dep.type });
          }
        }
      });
    });
    return result;
  }

  private deserializeTasks(raw: RawTask[]): EditorTask[] {
    return (raw ?? []).map((t) => ({
      start: t.start ?? 0,
      effort: t.effort ?? 1,
      dependsOn: (t.dependsOn ?? []).map((d) => {
        const isNum = typeof d === 'number';
        return { taskIndex: isNum ? (d as number) : (d as RawDep).id, type: (isNum ? 'FS' : (d as RawDep).type) as DepType };
      }),
    }));
  }

  private serializeResources(resources: EditorResource[]): RawResource[] {
    return resources.map((r, id) => ({ id, name: r.name, speed: r.speed, cost: r.cost, color: r.color }));
  }

  private deserializeResources(raw: RawResource[]): EditorResource[] {
    return (raw ?? []).map((r) => ({
      name: r.name ?? '',
      speed: r.speed ?? 1,
      cost: r.cost ?? 1,
      color: r.color ?? '#cccccc',
    }));
  }

  // ── Delete / reorder ──────────────────────────────────────────────────────

  async confirmDelete(s: FirestoreScenario) {
    if (!confirm(`Delete scenario "${s.name}"? This cannot be undone.`)) return;
    try {
      await this.adminSvc.deleteScenario(s.firestoreId!);
      const updated = this.scenarios().filter((x) => x.firestoreId !== s.firestoreId);
      this.scenarios.set(updated);
      await this.adminSvc.reorder(updated);
      this.scenarioSvc.invalidateBundleCache();
      this.showStatus('Scenario deleted.', false);
    } catch {
      this.showStatus('Failed to delete scenario.', true);
    }
  }

  async moveUp(index: number) { await this.swap(index, index - 1); }
  async moveDown(index: number) { await this.swap(index, index + 1); }

  private async swap(a: number, b: number) {
    const list = [...this.scenarios()];
    if (a < 0 || b >= list.length) return;
    [list[a], list[b]] = [list[b], list[a]];
    this.scenarios.set(list);
    try {
      await this.adminSvc.reorder(list);
      this.scenarioSvc.invalidateBundleCache();
    } catch {
      this.showStatus('Failed to reorder.', true);
      await this.loadScenarios();
    }
  }

  async importFromJson() {
    if (!confirm('This will overwrite ALL Firestore scenarios with the content of scenario.json. Continue?')) return;
    this.importLoading.set(true);
    try {
      const bundle = await firstValueFrom(this.http.get<ScenarioBundle>(this.config.scenarioUrl));
      await this.adminSvc.importBundle(bundle);
      this.scenarioSvc.invalidateBundleCache();
      await this.loadScenarios();
      this.showStatus(`Imported ${this.scenarios().length} scenarios from JSON.`, false);
    } catch (err) {
      this.showStatus('Import failed. Check console.', true);
      console.error('[AdminComponent] importFromJson error', err);
    } finally {
      this.importLoading.set(false);
    }
  }

  testScenario(index: number, type?: string) {
    this.scenarioSvc.invalidateBundleCache();
    const subRoute = type === 'training' ? 'plan' : 'play';
    this.router.navigate(['/game', index, subRoute]);
  }

  badgeClass(type?: string): string {
    if (type === 'training') return 'badge badge-training';
    if (type === 'tournament') return 'badge badge-tournament';
    return 'badge badge-other';
  }

  private showStatus(msg: string, isError: boolean) {
    this.statusMsg.set(msg);
    this.statusError.set(isError);
    setTimeout(() => this.statusMsg.set(''), 4000);
  }
}

// ── Local raw types for Firestore deserialization ─────────────────────────────

interface RawDep { id: number; type: DepType; }
interface RawTask {
  id?: number; start: number; effort: number;
  dependsOn?: (RawDep | number)[];
  dependants?: RawDep[];
}
interface RawResource { id?: number; name: string; speed: number; cost: number; color: string; }
