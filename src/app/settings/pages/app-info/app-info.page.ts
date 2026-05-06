import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { IonicModule, LoadingController, ToastController, Platform } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { VersionCheck } from 'src/app/services/version-check';

const CURRENT_VERSION_KEY = 'app_current_version';
const LATEST_VERSION_KEY  = 'app_latest_version';
const UPDATE_AVAILABLE_KEY = 'app_update_available';
const PKG_KEY             = 'app_package_name';

@Component({
  selector: 'app-app-info',
  templateUrl: './app-info.page.html',
  styleUrls: ['./app-info.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
})
export class AppInfoPage implements OnInit {

  currentVersion  = '0.0.0';
  latestVersion: string | null = null;
  updateAvailable = false;
  packageName     = '';
  isChecking      = false;
  currentYear     = new Date().getFullYear();

  constructor(
    private versionCheck: VersionCheck,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private translate: TranslateService,
    private platform: Platform
  ) {}

  ngOnInit() {
    this.loadFromStorage();
  }

  ionViewWillEnter() {
    this.loadFromStorage();
  }

  /** Read cached values written by VersionCheck service */
  private loadFromStorage() {
    this.currentVersion  = localStorage.getItem(CURRENT_VERSION_KEY) || this.currentVersion;
    this.latestVersion   = localStorage.getItem(LATEST_VERSION_KEY)  || null;
    this.updateAvailable = localStorage.getItem(UPDATE_AVAILABLE_KEY) === 'true';
    this.packageName     = localStorage.getItem(PKG_KEY)             || 'com.ekarigar.ekmessenger';
  }

  async checkForUpdates() {
    this.isChecking = true;

    const loading = await this.loadingCtrl.create({
      message: this.translate.instant('appInfo.checking'),
    });
    await loading.present();

    try {
      const result = await this.versionCheck.checkAndNotify();

      this.currentVersion  = result.currentVersion  || this.currentVersion;
      this.latestVersion   = result.latestVersion;
      this.updateAvailable = result.updateAvailable;
      this.packageName     = result.packageName     || this.packageName;

      const msg = result.updateAvailable
        ? this.translate.instant('appInfo.toast.updateAvailable', { version: result.latestVersion })
        : this.translate.instant('appInfo.toast.latest');

      const toast = await this.toastCtrl.create({
        message: msg,
        duration: 1800,
        position: 'bottom',
        color: result.updateAvailable ? 'warning' : 'success',
      });
      await toast.present();

    } catch {
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('appInfo.toast.error'),
        duration: 1800,
        position: 'bottom',
        color: 'danger',
      });
      await toast.present();
    } finally {
      loading.dismiss();
      this.isChecking = false;
    }
  }
}