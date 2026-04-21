# Symulator projektów — Angular 17 rewrite

Project management simulation (Gantt + Earned Value Management metrics) ported
from the original AngularJS 1.x codebase to modern Angular 17.

> **Note on terminology.** The original was described as a "Kanban" simulation,
> but the mechanics are classic waterfall / EVM: tasks with fixed dependencies,
> resources with cost/speed modifiers, risks, counter-risks, and PV/EV/AC/SPI/CPI
> metrics. Terminology in this codebase reflects that.

## Getting started

```bash
npm install
npm start        # dev server at http://localhost:4200
npm run build    # production build into dist/
```

## Architecture

```
src/app/
├── core/
│   ├── models/           ← TypeScript interfaces (scenario, task, resource, risk, user)
│   └── services/         ← State + business logic
│       ├── config.service.ts           (ported 1:1 from configService.js)
│       ├── user.service.ts             (signals + localStorage + backend POSTs)
│       ├── scenario.service.ts         (RxJS; caches scenario.json; legacy translator)
│       ├── scenario-generator.service.ts
│       └── symulator.service.ts        (the 606-line EVM engine, fully ported)
├── features/
│   ├── layout/           ← Shell with off-canvas nav
│   ├── welcome/          ← Sign-in gate + mode picker
│   └── game/
│       ├── game.component.ts           (route param loading, dialog orchestration)
│       ├── plan/                       (planning view)
│       └── play/                       (simulation view)
└── shared/
    ├── components/
    │   ├── alert/                      (replaces animated-alert directive)
    │   ├── gantt/                      (declarative SVG Gantt — see note below)
    │   ├── game-over-dialog/           (CDK Dialog)
    │   └── risk-dialog/                (CDK Dialog)
    ├── directives/
    │   └── really-click.directive.ts   (replaces ng-really-click)
    └── pipes/
        └── days-to-weeks.pipe.ts       (replaces daysToWeeks directive)

src/assets/
├── config/scenario.json                ← copied from the original
├── i18n/pl.json                        ← translations (ported from i18n.js)
└── logo.png
```

## What changed vs the AngularJS original

| AngularJS 1.x              | Angular 17                                            |
| -------------------------- | ----------------------------------------------------- |
| `app.service(...)`         | `@Injectable({ providedIn: 'root' })`                 |
| `$scope`, `$watch`         | Signals + `computed()` + `effect()`                   |
| `$q`, `$http`              | RxJS + `HttpClient`                                   |
| `$interval`                | `setInterval` (consider `runOutsideAngular` for perf) |
| `ui-router`                | Angular Router with lazy `loadComponent`              |
| `angular-translate`        | `@ngx-translate/core` + `.json` files                 |
| `$modal` (ui-bootstrap)    | Angular CDK Dialog                                    |
| `ng-drag-drop` + jQuery UI | Angular CDK DragDrop                                  |
| `Snap.svg` imperative draw | Declarative SVG templates with `@for`                 |
| `ng-repeat`, `ng-if`       | `@for`, `@if` (new control flow)                      |
| `controller: ...`          | Standalone components with `inject()`                 |
| Bootstrap 3 + jasny        | Bootstrap 5 (jasny dropped; off-canvas is custom CSS) |

Values in `ConfigService` are identical to the original. Simulation math in
`SymulatorService` is a line-by-line port — do not tweak without checking
regression against the AngularJS version.

## Simplifications worth flagging

1. **Gantt chart** — the original `gant.js` was 599 lines of imperative Snap.svg
   code. The Angular version (`shared/components/gantt/gantt.component.ts`) is
   a declarative SVG template covering:
   - task rows with planned + actual bars + completion overlay
   - week grid with labels
   - "now" line tracking simulation time
   - resource chips per task

   **Not yet ported:** dependency arrows between tasks, pixel-precise drag to
   reschedule tasks by dragging bars directly, resource drop targets per-row
   (the palette is `cdkDrag`-enabled but per-task `cdkDropList`s are stubbed).
   These are the 80% of the original file that we left for a follow-up.

2. **Session state routing.** In the original, `$rootScope.$on('$stateChangeStart')`
   intercepted navigation to confirm before abandoning an in-progress simulation.
   That global guard isn't implemented yet in Angular — would be a
   `CanDeactivateFn` route guard on `GameComponent`.

3. **Backend POSTs.** `UserService.sendToBackend` and `sendHighScore` still
   target `http://octigo.pl/dev/ajax.php` with the same query-string shape as
   the original. If you've migrated the backend too, swap the URL in
   `ConfigService.backendUrl`.

## Follow-up tasks (for the next session)

In rough order of value:

1. **Per-task drop zones in the Gantt** so dragging a resource chip onto a bar
   actually assigns it (call `sym.assignResourceToTask`). Currently the palette
   is drag-enabled but task bars are not drop targets.
2. **Dependency arrows in the Gantt** — iterate `task.dependsOn` and draw SVG
   paths between row coordinates.
3. **Drag-to-reschedule** on the Gantt — `(pointerdown)` handler computing
   deltas in weeks and calling `recalculatePlan*`.
4. **`CanDeactivate` guard** on the `game` route to replicate the
   `$stateChangeStart` confirmation flow.
5. **EVM line chart** on the Play view — the data is already being pushed to
   `GameComponent.chart.data`, just needs `ng2-charts` `<canvas baseChart>`
   bound in `play.component.html`.
6. **Lesson content pages** — the original had `lesson1.html` / `lesson2.html` /
   `lesson3.html` with static educational content. Not ported yet; they'd slot
   in under `features/lessons/` as simple routed components.
7. **`NgZone.runOutsideAngular` for the tick loop** — at 100ms intervals across
   ~15 tasks this is fine, but for larger random scenarios you'll want change
   detection out of the hot path.

## Known TypeScript warnings to resolve

A few `as unknown as Record<string, ...>` casts exist in `SymulatorService`
and `PlanComponent` where the original code added arbitrary properties to
objects at runtime (e.g. `plan.pv`, `plan.counterRisks`, `task.pv`). These
should be absorbed into the model types once the invariants are firmed up.
Tagged as `// TODO:` where they appear; strict TS still passes.
