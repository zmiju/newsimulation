import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/** Returns nameEn when the active language is English, otherwise name. */
@Pipe({ name: 'localize', standalone: true, pure: false })
export class LocalizePipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(item: { name?: string; nameEn?: string } | null | undefined): string {
    if (!item) return '';
    const lang = this.translate.currentLang || this.translate.defaultLang;
    if (lang === 'en' && item.nameEn) return item.nameEn;
    return item.name ?? '';
  }
}
