import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { App } from '@capacitor/app';
import { AlertController, Platform } from '@ionic/angular';
import { environment } from 'src/environments/environment';

type VersionCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  packageName: string;
  updateAvailable: boolean;
};

const LS_KEYS = {
  current: 'app_current_version',
  latest: 'app_latest_version',
  pkg: 'app_package_name',
  checkedAt: 'app_version_checked_at',
  updateAvailable: 'app_update_available',
};

@Injectable({ providedIn: 'root' })
export class VersionCheck {
  constructor(
    private http: HttpClient,
    private alertCtrl: AlertController,
    private platform: Platform
  ) {}

  package_name = '';

  async checkVersion(): Promise<VersionCheckResult> {
    const appInfo = await App.getInfo();
    const currentVersion = appInfo.version;
    const packageName = appInfo.id;

    // persist current + package
    localStorage.setItem(LS_KEYS.current, currentVersion);
    localStorage.setItem(LS_KEYS.pkg, packageName);
    this.package_name = packageName;

    let latestVersion: string | null = null;

    if (this.platform.is('android')) {
      latestVersion = await this.getLatestFromPlayStore(packageName);
    } else if (this.platform.is('ios')) {
      latestVersion = await this.getLatestFromAppStore(packageName);
    }

    // normalize + persist latest if any
    if (latestVersion) {
      const cleaned = this.cleanVersion(latestVersion);
      latestVersion = cleaned;
      //console.log("cleaned",cleaned);
      localStorage.setItem(LS_KEYS.latest, cleaned);
    }

    const updateAvailable =
      !!latestVersion && this.isUpdateAvailable(currentVersion, latestVersion);

    localStorage.setItem(LS_KEYS.updateAvailable, String(updateAvailable));
    localStorage.setItem(LS_KEYS.checkedAt, new Date().toISOString());

    return { currentVersion, latestVersion, packageName, updateAvailable };
  }

  async checkAndNotify(): Promise<VersionCheckResult> {
    const result = await this.checkVersion();
    if (result.updateAvailable) {
      await this.showUpdateAlert();
    }
    return result;
  }

  private async getLatestFromAppStore(bundleId: string): Promise<string | null> {
    try {
      const url = `https://itunes.apple.com/lookup?bundleId=${bundleId}`;
      const data: any = await this.http.get(url).toPromise();
      if (data?.resultCount > 0) {
        return data.results[0].version as string;
      }
      return null;
    } catch (err) {
      console.error('App Store fetch failed:', err);
      return null;
    }
  }

  private async getLatestFromPlayStore(packageName: string): Promise<string | null> {
    try {
      // Your backend should return something like { latestVersion: "8 (8.0)" } or "8.0"
      const url = `${environment.checkVersionUrl}?package=${packageName}`;
      const data: any = await this.http.get(url).toPromise();

      //console.log(data);
      // {"packageName":"com.ekarigar.telldemm","latestVersion":"13 (12.1)"}

      // accept either raw string or { latestVersion: string }
      const raw = typeof data === 'string' ? data : data?.latestVersion;
      return raw ?? null;
    } catch (err) {
      console.error('Play Store fetch failed:', err);
      return null;
    }
  }

  // private cleanVersion(v: string): string {
  //   // e.g. "8 (8.0)" -> "8.0"
  //   const match = v.match(/\d+(\.\d+)*/);
  //   return match ? match[0] : v;
  //   }
 private cleanVersion(v: string): string {
  // If version string looks like "13 (12.1)" → extract "12.1"
  const match = v.match(/\(([^)]+)\)/);
  if (match) {
    return match[1]; // content inside parentheses
  }

  // Otherwise, extract the first decimal version number like "12.1"
  const versionMatch = v.match(/\d+(\.\d+)+|\d+\.\d+/);
  if (versionMatch) {
    return versionMatch[0];
  }

  // Fallback: if version has only a single number, make it "x.0"
  const numMatch = v.match(/\d+/);
  return numMatch ? `${numMatch[0]}.0` : v;
}



  private isUpdateAvailable(current: string, latest: string): boolean {
    const currParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    const maxLen = Math.max(currParts.length, latestParts.length);
    for (let i = 0; i < maxLen; i++) {
      const c = currParts[i] ?? 0;
      const l = latestParts[i] ?? 0;
      if (c < l) return true;
      if (c > l) return false;
    }
    return false;
  }

  private async showUpdateAlert() {
    const packageName = this.package_name;
    const alert = await this.alertCtrl.create({
      header: 'Update Available',
      message: 'A new version of the app is available. Please update.',
      buttons: [
        {
          text: 'Update',
          handler: () => {
            if (this.platform.is('android')) {
              window.open(`https://play.google.com/store/apps/details?id=${packageName}`, '_system');
            } else if (this.platform.is('ios')) {
              // NOTE: For iOS you typically need the numeric App Store ID; if you only have bundleId,
              // consider saving the appId in config and using it here.
              window.open(`itms-apps://itunes.apple.com/app/id=${packageName}`, '_system');
            }
          },
        },
        { text: 'Later', role: 'cancel' }
      ],
      backdropDismiss: false,
    });
    await alert.present();
  }
}
