import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { ScenarioService } from '@core/services/scenario.service';
import { UserService } from '@core/services/user.service';
import { Scenario } from '@core/models/scenario.model';
import { UserFunction } from '@core/models/user.model';
import { AlertComponent } from '@shared/components/alert/alert.component';
import { LocalizePipe } from '@shared/pipes/localize.pipe';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule, AlertComponent, LocalizePipe],
  templateUrl: './welcome.component.html',
})
export class WelcomeComponent implements OnInit {
  private readonly scenarios = inject(ScenarioService);
  readonly users = inject(UserService);

  readonly all = signal<Scenario[]>([]);
  readonly lessons     = computed(() => this.all().filter((s) => s.type === 'training'));
  readonly tournaments = computed(() => this.all().filter((s) => s.type === 'tournament'));

  // Sign-in form state -----------------------------------------------------
  readonly showSignIn = computed(() => !this.users.isSignedIn());
  readonly signInError = signal<string>('');

  readonly form = {
    email: '',
    nick: '',
    function: 'STUDENT' as UserFunction,
    termsAccepted: false,
  };

  readonly functions: UserFunction[] = [
    'STUDENT', 'PM', 'EMPLOYEE', 'CEO_SM', 'HR', 'CEO_L', 'UNIVERSITY', 'OTHER',
  ];
  readonly functionI18nKey = (f: UserFunction) => `SIGN_IN_modal_function_${f}`;

  ngOnInit(): void {
    this.scenarios.getAllScenarios().subscribe((list) => this.all.set(list));
  }

  submit(): void {
    if (!this.form.termsAccepted) {
      this.signInError.set('SIGN_IN_modal_terms_error');
      return;
    }
    this.signInError.set('');
    const fallbackNick = this.form.email ? this.form.email.split('@')[0] : 'guest';
    this.users.setCurrentUser({
      email: this.form.email,
      nick: this.form.nick || fallbackNick,
      function: this.form.function,
      termsAccepted: true,
    });
  }
}
