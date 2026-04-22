import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { UserService } from '@core/services/user.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet, TranslateModule],
  styles: [`
    .lang-switcher {
      display: flex;
      gap: 2px;
      align-items: center;
      margin-right: 12px;
    }
    .lang-btn {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.3);
      color: #94a3b8;
      border-radius: 4px;
      padding: 2px 7px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .lang-btn:hover {
      border-color: rgba(255,255,255,0.6);
      color: #fff;
    }
    .lang-btn.active {
      background: rgba(255,255,255,0.15);
      border-color: rgba(255,255,255,0.6);
      color: #fff;
    }
  `],
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
            <div class="lang-switcher">
              <button class="lang-btn" [class.active]="currentLang() === 'en'" (click)="setLang('en')">EN</button>
              <button class="lang-btn" [class.active]="currentLang() === 'pl'" (click)="setLang('pl')">PL</button>
            </div>
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
export class LayoutComponent implements OnInit, OnDestroy {
  readonly user = inject(UserService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  readonly offCanvasOpen = signal(false);
  readonly currentLang = signal(this.translate.currentLang ?? this.translate.defaultLang);
  private langSub?: Subscription;

  ngOnInit(): void {
    this.langSub = this.translate.onLangChange.subscribe(({ lang }) => {
      this.currentLang.set(lang);
    });
    const active = this.translate.currentLang ?? this.translate.defaultLang;
    this.currentLang.set(active);
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }

  setLang(lang: string): void {
    this.translate.use(lang);
  }

  toggleOffCanvas(): void { this.offCanvasOpen.update((v) => !v); }

  logout(): void {
    this.user.resetLastSignedUser();
    this.offCanvasOpen.set(false);
    this.router.navigate(['/welcome']);
  }
}
