import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

const SUPPORTED_LANGS = ['en', 'pl'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent implements OnInit {
  private readonly translate = inject(TranslateService);

  ngOnInit(): void {
    this.translate.addLangs(SUPPORTED_LANGS);
    const browser = this.translate.getBrowserLang() ?? 'en';
    const lang = SUPPORTED_LANGS.includes(browser) ? browser : 'en';
    this.translate.use(lang);
  }
}
