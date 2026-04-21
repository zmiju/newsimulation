import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { UserService } from '@core/services/user.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet, TranslateModule],
  template: `
    <div class="site-wrapper">
      <div class="site-wrapper-inner">

        <!-- Off-canvas backdrop -->
        <div class="off-canvas-backdrop" [class.open]="offCanvasOpen()"
             (click)="toggleOffCanvas()"></div>

        <!-- Off-canvas menu -->
        <nav class="off-canvas-menu" [class.open]="offCanvasOpen()">
          <h3>{{ 'OFFCANVAS_title' | translate }}</h3>
          <p>
            <strong>{{ user.currentUser()?.nick }}</strong>
          </p>
          <p>
            <a href="javascript:void(0)" (click)="logout()">
              {{ 'OFFCANVAS_logout' | translate }}
            </a>
          </p>
          @if (user.savedPlans().length) {
            <h3>{{ 'OFFCANVAS_saved_scenarios' | translate }}</h3>
            <ul>
              @for (p of user.savedPlans(); track p.id) {
                <li><a [routerLink]="['/game', p.id, 'plan']" (click)="toggleOffCanvas()">{{ p.name }}</a></li>
              }
            </ul>
          }
          @if (user.history().length) {
            <h3>{{ 'OFFCANVAS_history' | translate }}</h3>
            <ul>
              @for (h of user.history(); track h.id) {
                <li class="px-5 py-2 text-secondary" style="font-size:14px;">{{ h.name }}</li>
              }
            </ul>
          }
        </nav>

        <!-- Header -->
        <header class="masthead">
          <div class="masthead-inner">
            <h1 class="masthead-brand">
              <a [routerLink]="['/welcome']" class="title-link">
                {{ 'TITLE' | translate }}
              </a>
            </h1>
            @if (user.currentUser()) {
              <span style="font-size:13px; color:#94a3b8;">
                {{ user.currentUser()?.nick }}
              </span>
            }
            <button class="hamburger" (click)="toggleOffCanvas()" aria-label="Toggle menu">
              &#9776;
            </button>
          </div>
        </header>

        <!-- Main content -->
        <main class="main-content">
          <div class="slide-container">
            <router-outlet />
          </div>
        </main>

      </div>
    </div>
  `,
})
export class LayoutComponent {
  readonly user = inject(UserService);
  private readonly router = inject(Router);
  readonly offCanvasOpen = signal(false);

  toggleOffCanvas(): void { this.offCanvasOpen.update((v) => !v); }

  logout(): void {
    this.user.resetLastSignedUser();
    this.offCanvasOpen.set(false);
    this.router.navigate(['/welcome']);
  }
}
