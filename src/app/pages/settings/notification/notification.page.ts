import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, AlertController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { FcmService } from '../../../services/fcm-service';
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';
import { AuthService } from 'src/app/auth/auth.service';
import { App } from '@capacitor/app';
import { GlobalSettingsSyncService } from 'src/app/services/global-settings-sync.service';

const STORAGE_KEY = 'settings.notifications';
const PERMISSION_CHECK_KEY = 'settings.notification.permission.check';

@Component({
  selector: 'app-notification',
  templateUrl: './notification.page.html',
  styleUrls: ['./notification.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class NotificationPage implements OnInit {
  highPriority = false;
  userId : string | null = null;
  private appStateListener: any;
  
  constructor(
    private router: Router, 
    private translate: TranslateService,
    private fcmService: FcmService,
    private alertController: AlertController,
    private authService : AuthService,
    private globalSettingsSync: GlobalSettingsSyncService
  ) {}
  
  async ngOnInit(): Promise<void> {
    this.globalSettingsSync.initialize().catch(() => undefined);
    await this.checkNotificationPermission();
    
    // ✅ Listen to app state changes (when user returns from settings)
    this.setupAppStateListener();
  }

  /**
   * ✅ Setup listener for app becoming active (returns from settings)
   */
  private setupAppStateListener(): void {
    this.appStateListener = App.addListener('appStateChange', async (state) => {
      if (state.isActive) {
        console.log('📱 App became active - checking for permission changes...');
        await this.handleAppResumed();
      }
    });
  }

  /**
   * ✅ Handle when app resumes from settings
   */
  private async handleAppResumed(): Promise<void> {
    const previousPermissionState = localStorage.getItem(PERMISSION_CHECK_KEY);
    
    if (!previousPermissionState) {
      return; // No settings navigation happened
    }
    
    // Check current permission
    const permStatus = await PushNotifications.checkPermissions();
    const currentlyEnabled = permStatus.receive === 'granted';
    
    console.log('Previous state:', previousPermissionState);
    console.log('Current state:', currentlyEnabled ? 'enabled' : 'disabled');
    
    // ✅ User went to settings and ENABLED notifications
    if (previousPermissionState === 'disabled' && currentlyEnabled) {
      console.log('🔄 User enabled notifications from settings - reloading app...');
      
      // Update UI immediately
      this.highPriority = true;
      this.saveSettings();
      
      // Clear flag
      localStorage.removeItem(PERMISSION_CHECK_KEY);
      
      // Small delay to show updated UI, then reload
      setTimeout(() => {
        this.reloadApp();
      }, 500);
      return;
    }
    
    // ✅ User went to settings and DISABLED notifications
    if (previousPermissionState === 'enabled' && !currentlyEnabled) {
      console.log('✅ User disabled notifications from settings');
      
      // Update UI immediately
      this.highPriority = false;
      this.saveSettings();
      
      // Clear flag
      localStorage.removeItem(PERMISSION_CHECK_KEY);
      return;
    }
    
    // ✅ No change - clear flag
    localStorage.removeItem(PERMISSION_CHECK_KEY);
  }

  async ionViewWillEnter(): Promise<void> {
    await this.checkNotificationPermission();
  }

  /**
   * ✅ Check current notification permission status and update toggle
   */
  private async checkNotificationPermission(): Promise<void> {
    try {
      const permStatus = await PushNotifications.checkPermissions();
      console.log('📱 Current permission status:', permStatus.receive);
      
      // ✅ Update toggle based ONLY on current permission
      this.highPriority = permStatus.receive === 'granted';
      
      // ✅ Save current state to localStorage
      this.saveSettings();
      
      console.log('✅ Toggle state updated:', this.highPriority ? 'ON' : 'OFF');
    } catch (error) {
      console.error('❌ Error checking notification permission:', error);
      this.highPriority = false;
    }
  }

  /**
   * ✅ Handle toggle change - request or disable notifications
   */
  async onToggleChange(event: any): Promise<void> {
    const isEnabled = event.detail.checked;
    console.log('🔔 Toggle changed to:', isEnabled);

    if (isEnabled) {
      await this.enableNotifications();
    } else {
      await this.disableNotifications();
    }
  }

  /**
   * ✅ Enable notifications - request permission
   */
  private async enableNotifications(): Promise<void> {
    try {
      console.log('✅ Requesting notification permissions...');
      
      let permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        permStatus = await PushNotifications.requestPermissions();
      } else if (permStatus.receive === 'denied') {
        console.warn('⚠️ Notification permission denied - redirecting to settings');
        this.highPriority = false;
        await this.showPermissionDeniedAlert();
        return;
      }
      
      if (permStatus.receive === 'granted') {
        console.log('✅ Notification permission granted');
        this.highPriority = true;
        
        await this.fcmService.initializePushNotifications();
        this.saveSettings();
        await this.showSuccessAlert();
      } else {
        console.warn('⚠️ Permission not granted:', permStatus.receive);
        this.highPriority = false;
        
        if (permStatus.receive === 'denied') {
          await this.showPermissionDeniedAlert();
        }
      }
      
    } catch (error) {
      console.error('❌ Error enabling notifications:', error);
      this.highPriority = false;
      await this.showErrorAlert();
    }
  }

  /**
   * ✅ Disable notifications
   */
  private async disableNotifications(): Promise<void> {
    try {
      console.log('🔕 Disabling notifications...');
      
      const permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'granted') {
        // ✅ Set flag - user wants to disable
        localStorage.setItem(PERMISSION_CHECK_KEY, 'enabled');
        
        await this.showDisabledAlert();
        await this.checkNotificationPermission();
        return;
      }
      
      await this.fcmService.clearAllNotifications();
      this.highPriority = false;
      this.saveSettings();
      
      console.log('✅ Notifications disabled in app');
      
    } catch (error) {
      console.error('❌ Error disabling notifications:', error);
      await this.showErrorAlert();
    }
  }

  /**
   * ✅ Open device app settings
   */
  private async openAppSettings(): Promise<void> {
    try {
      await NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.AppNotification,
      });
    } catch (error) {
      console.error('❌ Error opening native settings:', error);
    }
  }

  /**
   * ✅ Reload app
   */
  private reloadApp(): void {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }

  /**
   * ✅ Show success alert
   */
  private async showSuccessAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant('notifications.alerts.success.title') || 'Notifications Enabled',
      message: this.translate.instant('notifications.alerts.success.message') || 'You will now receive push notifications from this app.',
      buttons: [
        {
          text: this.translate.instant('common.ok') || 'OK',
          role: 'cancel'
        }
      ]
    });

    await alert.present();
  }

  /**
   * ✅ Show alert when notifications are disabled
   */
  private async showDisabledAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant('Disable Notifications'),
      message: this.translate.instant('To completely turn off notifications, please disable them from your device settings.'),
      buttons: [
        {
          text: this.translate.instant('common.cancel') || 'Cancel',
          role: 'cancel',
          handler: () => {
            localStorage.removeItem(PERMISSION_CHECK_KEY);
            console.log('User cancelled');
          }
        },
        {
          text: this.translate.instant('Open Settings'),
          handler: () => {
            this.openAppSettings();
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * ✅ Show alert when permission is denied
   */
  private async showPermissionDeniedAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant('Permission Denied'),
      message: this.translate.instant('Notification permission was denied. Please enable it from your device settings to receive notifications.'),
      buttons: [
        {
          text: this.translate.instant('common.cancel') || 'Cancel',
          role: 'cancel',
          handler: () => {
            localStorage.removeItem(PERMISSION_CHECK_KEY);
          }
        },
        {
          text: this.translate.instant('Open Settings'),
          handler: () => {
            // ✅ Set flag - user wants to enable
            localStorage.setItem(PERMISSION_CHECK_KEY, 'disabled');
            this.openAppSettings();
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * ✅ Show error alert
   */
 private async showErrorAlert(): Promise<void> {
  const alert = await this.alertController.create({
    header: 'Error',
    message: 'Something went wrong. Please try again or check your device settings.',
    buttons: [
      {
        text: 'OK',
        role: 'cancel'
      }
    ]
  });

  await alert.present();
}

  openMessageNotifications() {
    if (!this.highPriority) return;
    this.router.navigate(['settings/notifications/message']);
  }

  openGroupNotifications() {
    if (!this.highPriority) return;
    this.router.navigate(['settings/notifications/group']);
  }

  openCallNotifications() {
    if (!this.highPriority) return;
    this.router.navigate(['settings/notifications/call']);
  }

  ionViewWillLeave() {
    this.saveSettings();
  }

  ngOnDestroy() {
    // ✅ Cleanup listener
    if (this.appStateListener) {
      this.appStateListener.remove();
    }
  }

  /**
   * ✅ Save current toggle state
   */
  private saveSettings() {
    this.globalSettingsSync.saveSection('notifications', {
      highPriority: this.highPriority,
    });
    console.log('💾 Settings saved:', this.highPriority ? 'ON' : 'OFF');
  }
}