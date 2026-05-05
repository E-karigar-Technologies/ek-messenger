import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { GlobalSettingsSyncService } from 'src/app/services/global-settings-sync.service';

const STORAGE_KEY = 'settings.storageData';

@Component({
  selector: 'app-storage-data',
  templateUrl: './storage-data.page.html',
  styleUrls: ['./storage-data.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
})
export class StorageDataPage implements OnInit {
  usedMB = 612;
  totalMB = 1024;
  dataSent = '1.2 GB';
  dataReceived = '3.4 GB';

  constructor(
    private toastCtrl: ToastController,
    private router: Router,
    private translate: TranslateService,
    private globalSettingsSync: GlobalSettingsSyncService
  ) {}

  ngOnInit(): void {
    this.loadSavedStats();

    this.globalSettingsSync.initialize().then(() => {
      this.loadSavedStats();
    });
  }

  get storageFraction(): number {
    return Math.min(1, this.usedMB / (this.totalMB || 1));
  }

  get totalUsedHuman(): string {
    // "612 MB of 1024 MB"
    return this.translate.instant('storage.totalUsedHuman', {
      used: this.usedMB,
      total: this.totalMB
    });
  }

  get dataSentHuman(): string {
    return this.dataSent; // already formatted number; label is translated in template
  }

  get dataReceivedHuman(): string {
    return this.dataReceived;
  }

  async clearCache() {
    const freed = 100;
    this.usedMB = Math.max(0, this.usedMB - freed);
    this.saveStats();

    const t = await this.toastCtrl.create({
      message: this.translate.instant('storage.toast.cleared', { mb: freed }),
      duration: 1400,
      position: 'bottom'
    });
    await t.present();
  }

  analyzeStorage() {
    this.router.navigateByUrl('storage-data/manage-storage');
  }

  openManageStorage() {
    this.router.navigateByUrl('storage-data/manage-storage');
  }

  openMediaAutoDownload() {
    this.router.navigateByUrl('storage-data/media-auto-download');
  }

  async resetNetworkStats() {
    this.dataSent = '0 B';
    this.dataReceived = '0 B';
    this.saveStats();
    await this.toast(this.translate.instant('storage.toast.statsReset'));
  }

  private saveStats() {
    this.globalSettingsSync.saveSection('storageData', {
      usedMB: this.usedMB,
      totalMB: this.totalMB,
      dataSent: this.dataSent,
      dataReceived: this.dataReceived
    });
  }

  private loadSavedStats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.usedMB === 'number') this.usedMB = s.usedMB;
      if (typeof s.totalMB === 'number') this.totalMB = s.totalMB;
      if (typeof s.dataSent === 'string') this.dataSent = s.dataSent;
      if (typeof s.dataReceived === 'string') this.dataReceived = s.dataReceived;
    } catch (e) {
      console.warn('Could not load storage stats', e);
    }
  }

  private async toast(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 1400, position: 'bottom' });
    await t.present();
  }
}
