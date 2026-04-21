import { Routes } from '@angular/router';
import { LayoutComponent } from './features/layout/layout.component';

/**
 * Mirrors the original ui-router state tree:
 *   app                        → LayoutComponent (master layout)
 *     app.welcome              → welcome
 *     app.game/:scenario       → game container
 *       app.game.plan          → plan view
 *       app.game.play          → simulation view
 */
export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'welcome' },
      {
        path: 'welcome',
        loadComponent: () =>
          import('./features/welcome/welcome.component').then((m) => m.WelcomeComponent),
      },
      {
        path: 'game/:scenario',
        loadComponent: () =>
          import('./features/game/game.component').then((m) => m.GameComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'plan' },
          {
            path: 'plan',
            loadComponent: () =>
              import('./features/game/plan/plan.component').then((m) => m.PlanComponent),
          },
          {
            path: 'play',
            loadComponent: () =>
              import('./features/game/play/play.component').then((m) => m.PlayComponent),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: 'welcome' },
];
