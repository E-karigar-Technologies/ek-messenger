import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { Language } from 'src/app/services/language';
import { GlobalSettingsSyncService } from 'src/app/services/global-settings-sync.service';

// ⬇️ import your Language service (path may differ in your project)
// import { Language } from '../../services/language'; // adjust relative path if needed

const LANG_STORAGE_KEY = 'app_language';

@Component({
  selector: 'app-app-language',
  templateUrl: './app-language.page.html',
  styleUrls: ['./app-language.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class AppLanguagePage implements OnInit, OnDestroy {
  selectedLanguage = 'en-US';
  searchTerm = '';
  private langSub?: Subscription;

  // Alphabetically sorted list of languages (label ascending)
  languages = [
    { code: 'ar-EG', label: 'Arabic (Egypt)' },
    { code: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
    { code: 'bn-BD', label: 'Bengali (Bangladesh)' },
    { code: 'de-DE', label: 'German (Germany)' },
    { code: 'en-GB', label: 'English (UK)' },
    { code: 'en-IN', label: 'English (India)' },
    { code: 'en-US', label: 'English (US)' },
    { code: 'es-ES', label: 'Spanish (Spain)' },
    { code: 'es-MX', label: 'Spanish (Mexico)' },
    { code: 'fa-IR', label: 'Persian (Iran)' },
    { code: 'fr-FR', label: 'French (France)' },
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
    { code: 'ta-IN', label: 'Tamil (India)' },
    { code: 'te-IN', label: 'Telugu (India)' },
    { code: 'th-TH', label: 'Thai' },
    { code: 'tr-TR', label: 'Turkish' },
    { code: 'ur-PK', label: 'Urdu (Pakistan)' },
    { code: 'vi-VN', label: 'Vietnamese' },
    { code: 'zh-CN', label: 'Chinese (Simplified)' },
    { code: 'zh-TW', label: 'Chinese (Traditional)' },
  ];

  filteredLanguages = [...this.languages];

  constructor(
    private toastCtrl: ToastController,
    private langSvc: Language,
    private authService:AuthService,
    private loadingCtrl: LoadingController,
    private api: ApiService,
    private globalSettingsSync: GlobalSettingsSyncService
  ) {}

  ngOnInit() {
    // sort defensively
    this.languages.sort((a, b) => a.label.localeCompare(b.label));
    this.filteredLanguages = [...this.languages];

    // read current language from service (it reads saved value or default)
    this.selectedLanguage = this.langSvc.getCurrentLanguage() || this.selectedLanguage;

    this.globalSettingsSync.initialize().then(async () => {
      const syncedLanguage = localStorage.getItem(LANG_STORAGE_KEY);
      if (syncedLanguage && syncedLanguage !== this.selectedLanguage) {
        this.selectedLanguage = syncedLanguage;
        await this.langSvc.useLanguage(syncedLanguage);
      }
    });

    // OPTIONAL: keep radio selection in sync if language changes elsewhere
    // (only if you added currentLang$ in the service)
    // this.langSub = this.langSvc.currentLang$.subscribe(code => {
    //   this.selectedLanguage = code;
    // });
  }

  ngOnDestroy() {
    this.langSub?.unsubscribe();
  }

  // Radio list changed
  async changeLanguage(event: any) {
    const code = event?.detail?.value ?? this.selectedLanguage;
    await this.setLanguage(code);
  }

  // If you also have a dropdown
  onSelectChange(event: any) {
    const code = event?.detail?.value ?? this.selectedLanguage;
    this.setLanguage(code);
  }

  // Central setter
  // private async setLanguage(langCode: string) {
  //   if (!langCode) return;

  //   // ⬇️ THIS is the important part: switch translations right now
  //   await this.langSvc.useLanguage(langCode);

  //   // (The service already persists to localStorage; keeping this is harmless but redundant)
  //   localStorage.setItem(LANG_STORAGE_KEY, langCode);

  //   this.selectedLanguage = langCode;

  //   const t = await this.toastCtrl.create({
  //     message: `Language set to ${this.getLabel(langCode)} (${langCode})`,
  //     duration: 1200,
  //     position: 'bottom'
  //   });
  //   await t.present();
  // }

    async setLanguage(langCode: string) {
    if (!langCode) return;

    // const user_id = localStorage.getItem(USER_ID_KEY);
    const userId = Number(this.authService.authData?.userId || 0);
    // if (!userId) return;
    if (!userId) {
      console.warn('User not logged in');
      return;
    }

    const loader = await this.loadingCtrl.create({ message: 'Updating language...' });
    await loader.present();

    try {
      // ✅ Update in backend
      await this.api.updateUserLanguage(+userId, langCode).toPromise();

      // ✅ Update in local storage + service
      await this.langSvc.useLanguage(langCode);
      this.globalSettingsSync.saveSection('appLanguage', langCode);

      this.selectedLanguage = langCode;

      const t = await this.toastCtrl.create({
        message: `Language updated to ${this.getLabel(langCode)} (${langCode})`,
        duration: 1500,
        position: 'bottom',
        color: 'success',
      });
      await t.present();
    } catch (err) {
      console.error('Error updating language', err);
      const t = await this.toastCtrl.create({
        message: 'Failed to update language',
        duration: 1500,
        color: 'danger',
      });
      await t.present();
    } finally {
      loader.dismiss();
   
    }
  }

  getLabel(code: string) {
    return this.languages.find(l => l.code === code)?.label || code;
  }

  filterLanguages() {
    const q = (this.searchTerm || '').trim().toLowerCase();
    if (!q) {
      this.filteredLanguages = [...this.languages];
      return;
    }
    this.filteredLanguages = this.languages.filter(l => {
      const label = l.label.toLowerCase();
      const code = l.code.toLowerCase();
      return label.includes(q) || code.includes(q);
    });
  }
}
