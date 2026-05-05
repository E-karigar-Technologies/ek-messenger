import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { GlobalSettingsSyncService } from 'src/app/services/global-settings-sync.service';

const STORAGE_KEY = 'settings.accessibility';

@Component({
  selector: 'app-accessibility',
  templateUrl: './accessibility.page.html',
  styleUrls: ['./accessibility.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class AccessibilityPage implements OnInit {
  increaseContrast = false;
  reduceMotion = true;
  largeText = false;
  simpleAnimations = true;
  grayscale = false;
  darkMode = false;   // 👈 new

  constructor(
    private translate: TranslateService,
    private globalSettingsSync: GlobalSettingsSyncService
  ) {}

  ngOnInit(): void {
    this.loadSettings();
    this.applyVisualSettings();

    this.globalSettingsSync.initialize().then(() => {
      this.loadSettings();
      this.applyVisualSettings();
    });
  }

  onToggle(_key: keyof AccessibilityPage, _ev: any) {
    this.saveSettings();
    this.applyVisualSettings();
  }

  private saveSettings() {
    const payload = {
      increaseContrast: this.increaseContrast,
      // reduceMotion: this.reduceMotion,
      largeText: this.largeText,
      // simpleAnimations: this.simpleAnimations,
      grayscale: this.grayscale,
      darkMode: this.darkMode   // 👈 added
    };
    this.globalSettingsSync.saveSection('accessibility', payload);
  }

  private loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Default to device setting if no manual override
        this.darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return;
      }
      const s = JSON.parse(raw);
      if (typeof s.increaseContrast === 'boolean') this.increaseContrast = s.increaseContrast;
      if (typeof s.reduceMotion === 'boolean') this.reduceMotion = s.reduceMotion;
      if (typeof s.largeText === 'boolean') this.largeText = s.largeText;
      if (typeof s.simpleAnimations === 'boolean') this.simpleAnimations = s.simpleAnimations;
      if (typeof s.grayscale === 'boolean') this.grayscale = s.grayscale;
      if (typeof s.darkMode === 'boolean') this.darkMode = s.darkMode;  // 👈 load darkMode
    } catch (e) {
      console.warn('Could not load accessibility settings', e);
    }
  }

  private applyVisualSettings() {
    const root = document.documentElement;
    const body = document.body;

    root.classList.toggle('dark', this.darkMode);
    body.classList.toggle('dark', this.darkMode);

    body.classList.toggle('accessibility-high-contrast', this.increaseContrast);
    body.classList.toggle('accessibility-reduced-motion', this.reduceMotion);
    body.classList.toggle('accessibility-large-text', this.largeText);
    body.classList.toggle('accessibility-simple-animations', this.simpleAnimations);
    body.classList.toggle('accessibility-grayscale', this.grayscale);
  }
}

