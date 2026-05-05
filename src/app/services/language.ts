// // import { Injectable } from '@angular/core';

// // @Injectable({
// //   providedIn: 'root'
// // })
// // export class Language {
  
// // }


// // src/app/services/language.service.ts
// import { Injectable } from '@angular/core';
// import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
// import { Platform } from '@ionic/angular';
// import { BehaviorSubject, Observable } from 'rxjs';

// const LANG_STORAGE_KEY = 'app_language';

// @Injectable({ providedIn: 'root' })
// export class Language {
//   defaultLang = 'en-GB';

//   availableLanguages: Array<{ code: string; label: string }> = [
//     { code: 'ar-EG', label: 'Arabic (Egypt)' },
//     { code: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
//     { code: 'bn-BD', label: 'Bengali (Bangladesh)' },
//     { code: 'zh-CN', label: 'Chinese (Simplified)' },
//     { code: 'zh-TW', label: 'Chinese (Traditional)' },
//     { code: 'en-IN', label: 'English (India)' },
//     { code: 'en-GB', label: 'English (UK)' },
//     { code: 'en-US', label: 'English (US)' },
//     { code: 'fr-FR', label: 'French (France)' },
//     { code: 'de-DE', label: 'German (Germany)' },
//     { code: 'gu-IN', label: 'Gujarati (India)' },
//     { code: 'hi-IN', label: 'Hindi (India)' },
//     { code: 'it-IT', label: 'Italian (Italy)' },
//     { code: 'ja-JP', label: 'Japanese' },
//     { code: 'ko-KR', label: 'Korean' },
//     { code: 'mr-IN', label: 'Marathi (India)' },
//     { code: 'pa-IN', label: 'Punjabi (India)' },
//     { code: 'pt-BR', label: 'Portuguese (Brazil)' },
//     { code: 'pt-PT', label: 'Portuguese (Portugal)' },
//     { code: 'ru-RU', label: 'Russian' },
//     { code: 'es-MX', label: 'Spanish (Mexico)' },
//     { code: 'es-ES', label: 'Spanish (Spain)' },
//     { code: 'ta-IN', label: 'Tamil (India)' },
//     { code: 'te-IN', label: 'Telugu (India)' },
//     { code: 'th-TH', label: 'Thai' },
//     { code: 'tr-TR', label: 'Turkish' },
//     { code: 'ur-PK', label: 'Urdu (Pakistan)' },
//     { code: 'vi-VN', label: 'Vietnamese' }
//   ];

//   // Emits the current “selected” language code (e.g., 'ar-EG').
//   private _currentLang = new BehaviorSubject<string>(this.defaultLang);
//   public currentLang$ = this._currentLang.asObservable();

//   constructor(
//     private translate: TranslateService,
//     private platform: Platform
//   ) {
//     this.translate.setDefaultLang(this.defaultLang);
//     this.translate.addLangs(this.availableLanguages.map(l => l.code));

//     // Forward ngx-translate language change events to _currentLang
//     this.translate.onLangChange.subscribe((ev: LangChangeEvent) => {
//       // ev.lang is the language actually in use by ngx-translate (might be base like 'ar')
//       // We still keep broadcasting the user-selected code when we set it below in useLanguage().
//       // If you want to always mirror translate.currentLang instead, replace with:
//       // this._currentLang.next(ev.lang);
//     });
//   }

//   init(): void {
//     const saved = this.getSavedLanguageSync();
//     const toUse = saved || this.defaultLang || this.getBrowserLangFallback();
//     this.useLanguage(toUse);
//   }

//   async useLanguage(code: string): Promise<void> {
//     if (!code) return;
//     try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch {}

//     // Try exact locale first (e.g., 'ar-EG.json')
//     this.translate.use(code).subscribe({
//       next: () => {
//         this._currentLang.next(code);      // broadcast the selected code
//         this.applyRtlIfNeeded(code);
//       },
//       error: () => {
//         // Fallback to base lang if region file missing (e.g., 'ar.json')
//         const base = code.split('-')[0];
//         if (base && base !== code) {
//           this.translate.use(base).subscribe({
//             next: () => {
//               this._currentLang.next(code); // keep selected code for UI/prefs
//               this.applyRtlIfNeeded(code);
//             },
//             error: () => {
//               this.translate.use(this.defaultLang);
//               this._currentLang.next(this.defaultLang);
//               this.applyRtlIfNeeded(this.defaultLang);
//             }
//           });
//         } else {
//           this.translate.use(this.defaultLang);
//           this._currentLang.next(this.defaultLang);
//           this.applyRtlIfNeeded(this.defaultLang);
//         }
//       }
//     });
//   }

//   // ——— Helpers your pages/components can use ———

//   /** Instant translation (returns current string immediately). */
//   t(key: string, params?: Record<string, any>): string {
//     return this.translate.instant(key, params);
//   }

//   /**
//    * Reactive translation stream. Emits **on every language change**.
//    * Perfect for titles, toasts, or TS-only strings that must update live.
//    *
//    * Usage in a component:
//    *   title$ = this.lang.stream('emailEdit.title');
//    *   <ion-title>{{ title$ | async }}</ion-title>
//    */
//   stream(key: string | string[], params?: Record<string, any>): Observable<any> {
//     return this.translate.stream(key as any, params);
//   }

//   /** Promise-based convenience if you prefer async/await. */
//   get$(key: string | string[], params?: Record<string, any>): Observable<any> {
//     return this.translate.get(key as any, params);
//   }

//   async getSavedLanguage(): Promise<string | null> {
//     try {
//       return Promise.resolve(localStorage.getItem(LANG_STORAGE_KEY));
//     } catch {
//       return Promise.resolve(null);
//     }
//   }

//   getSavedLanguageSync(): string | null {
//     try { return localStorage.getItem(LANG_STORAGE_KEY); } catch { return null; }
//   }

//   getCurrentLanguage(): string {
//     return this._currentLang.value || this.translate.currentLang || this.getSavedLanguageSync() || this.defaultLang;
//   }

//   private getBrowserLangFallback(): string {
//     const browser = this.translate.getBrowserLang() || '';
//     if (browser === 'en') return this.defaultLang;
//     if (browser === 'ar') return 'ar';
//     if (browser === 'hi') return 'hi-IN';
//     return this.defaultLang;
//   }

//   private applyRtlIfNeeded(code: string) {
//     const rtlPrefixes = ['ar', 'he', 'fa', 'ur'];
//     const isRtl = rtlPrefixes.some(p => code.startsWith(p));
//     const html = document.documentElement;
//     html.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
//     if (isRtl) html.classList.add('app-rtl'); else html.classList.remove('app-rtl');
//   }

//   getAvailableLanguageCodes(): string[] {
//     return this.availableLanguages.map(l => l.code);
//   }

//   getLabelForCode(code: string): string {
//     return this.availableLanguages.find(l => l.code === code)?.label || code;
//   }
// }



import { Injectable } from '@angular/core';
import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
import { Platform } from '@ionic/angular';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { FirebaseChatService } from './firebase-chat.service';
// import { AuthService } from './auth.service';
// import { UserService } from './user.service';

const LANG_STORAGE_KEY = 'app_language';

@Injectable({ providedIn: 'root' })
export class Language {
  defaultLang = 'en-GB';

  availableLanguages: Array<{ code: string; label: string }> = [
    { code: 'ar-EG', label: 'Arabic (Egypt)' },
    { code: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
    { code: 'bn-BD', label: 'Bengali (Bangladesh)' },
    { code: 'zh-CN', label: 'Chinese (Simplified)' },
    { code: 'zh-TW', label: 'Chinese (Traditional)' },
    { code: 'en-IN', label: 'English (India)' },
    { code: 'en-GB', label: 'English (UK)' },
    { code: 'en-US', label: 'English (US)' },
    { code: 'fr-FR', label: 'French (France)' },
    { code: 'de-DE', label: 'German (Germany)' },
    { code: 'gu-IN', label: 'Gujarati (India)' },
    { code: 'hi-IN', label: 'Hindi (India)' },
    { code: 'it-IT', label: 'Italian (Italy)' },
    { code: 'ja-JP', label: 'Japanese' },
    { code: 'ko-KR', label: 'Korean' },
    { code: 'mr-IN', label: 'Marathi (India)' },
    { code: 'pa-IN', label: 'Punjabi (India)' },
    { code: 'pt-BR', label: 'Portuguese (Brazil)' },
    { code: 'pt-PT', label: 'Portuguese (Portugal)' },
    { code: 'ru-RU', label: 'Russian' },
    { code: 'es-MX', label: 'Spanish (Mexico)' },
    { code: 'es-ES', label: 'Spanish (Spain)' },
    { code: 'ta-IN', label: 'Tamil (India)' },
    { code: 'te-IN', label: 'Telugu (India)' },
    { code: 'th-TH', label: 'Thai' },
    { code: 'tr-TR', label: 'Turkish' },
    { code: 'ur-PK', label: 'Urdu (Pakistan)' },
    { code: 'vi-VN', label: 'Vietnamese' }
  ];

  private _currentLang = new BehaviorSubject<string>(this.defaultLang);
  public currentLang$ = this._currentLang.asObservable();

  constructor(
    private translate: TranslateService,
    private platform: Platform,
    private authService: AuthService,
    private userService: FirebaseChatService
  ) {
    this.translate.setDefaultLang(this.defaultLang);
    this.translate.addLangs(this.availableLanguages.map(l => l.code));

    this.translate.onLangChange.subscribe((ev: LangChangeEvent) => {
      // Can handle global side effects if needed
    });
  }

  /**
   * Initialize app language:
   * 1. Try API user preference
   * 2. Fallback to saved localStorage
   * 3. Fallback to default/browser
   */
  init(): void {
    const userId = Number(this.authService.authData?.userId || 0);

    if (userId > 0) {
      // Fetch from API if user is logged in
      this.userService.getUserLanguage(userId).pipe(
        tap(res => {
          if (res?.language) {
            const userLang = this.mapLanguageCode(res.language);
            this.saveLanguage(userLang);
            this.useLanguage(userLang);
          } else {
            this.loadFromLocalOrDefault();
          }
        }),
        catchError(() => {
          this.loadFromLocalOrDefault();
          return of(null);
        })
      ).subscribe();
    } else {
      this.loadFromLocalOrDefault();
    }
  }

  private loadFromLocalOrDefault(): void {
    const saved = this.getSavedLanguageSync();
    const toUse = saved || this.defaultLang || this.getBrowserLangFallback();
    this.useLanguage(toUse);
  }

  async useLanguage(code: string): Promise<void> {
    if (!code) return;
    this.saveLanguage(code);

    this.translate.use(code).subscribe({
      next: () => {
        this._currentLang.next(code);
        this.applyRtlIfNeeded(code);
      },
      error: () => {
        const base = code.split('-')[0];
        if (base && base !== code) {
          this.translate.use(base).subscribe({
            next: () => {
              this._currentLang.next(code);
              this.applyRtlIfNeeded(code);
            },
            error: () => {
              this.translate.use(this.defaultLang);
              this._currentLang.next(this.defaultLang);
              this.applyRtlIfNeeded(this.defaultLang);
            }
          });
        } else {
          this.translate.use(this.defaultLang);
          this._currentLang.next(this.defaultLang);
          this.applyRtlIfNeeded(this.defaultLang);
        }
      }
    });
  }

  // 🔹 Helpers
  t(key: string, params?: Record<string, any>): string {
    return this.translate.instant(key, params);
  }

  stream(key: string | string[], params?: Record<string, any>): Observable<any> {
    return this.translate.stream(key as any, params);
  }

  get$(key: string | string[], params?: Record<string, any>): Observable<any> {
    return this.translate.get(key as any, params);
  }

  async getSavedLanguage(): Promise<string | null> {
    try {
      return Promise.resolve(localStorage.getItem(LANG_STORAGE_KEY));
    } catch {
      return Promise.resolve(null);
    }
  }

  getSavedLanguageSync(): string | null {
    try { return localStorage.getItem(LANG_STORAGE_KEY); } catch { return null; }
  }

  saveLanguage(code: string): void {
    try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch {}
  }

  getCurrentLanguage(): string {
    return this._currentLang.value || this.translate.currentLang || this.getSavedLanguageSync() || this.defaultLang;
  }

  private getBrowserLangFallback(): string {
    const browser = this.translate.getBrowserLang() || '';
    if (browser === 'en') return this.defaultLang;
    if (browser === 'ar') return 'ar';
    if (browser === 'hi') return 'hi-IN';
    return this.defaultLang;
  }

  private applyRtlIfNeeded(code: string) {
    const rtlPrefixes = ['ar', 'he', 'fa', 'ur'];
    const isRtl = rtlPrefixes.some(p => code.startsWith(p));
    const html = document.documentElement;
    html.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    if (isRtl) html.classList.add('app-rtl'); else html.classList.remove('app-rtl');
  }

  getAvailableLanguageCodes(): string[] {
    return this.availableLanguages.map(l => l.code);
  }

  getLabelForCode(code: string): string {
    return this.availableLanguages.find(l => l.code === code)?.label || code;
  }

  /**
   * Normalize language code (like "hi" → "hi-IN")
   */
  private mapLanguageCode(code: string): string {
    if (!code) return this.defaultLang;

    const lower = code.toLowerCase();

    // Map short or generic codes to region-specific
    const mappings: Record<string, string> = {
      en: 'en-GB',
      hi: 'hi-IN',
      ur: 'ur-PK',
      pa: 'pa-IN',
      gu: 'gu-IN',
      ta: 'ta-IN',
      te: 'te-IN',
      mr: 'mr-IN',
      bn: 'bn-BD',
    };

    return mappings[lower] || this.availableLanguages.find(l => l.code.toLowerCase() === lower)?.code || this.defaultLang;
  }
}
