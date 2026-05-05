import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { AlertController, IonicModule, NavController, Platform } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslateModule, TranslateService, LangChangeEvent } from '@ngx-translate/core';

import { ApiService } from '../services/api/api.service';
import { AuthService } from '../auth/auth.service';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';
import { Resetapp } from '../services/resetapp';
import { ChatPouchDb } from '../services/chat-pouch-db';
import { NetworkService } from '../services/network-connection/network.service';

@Component({
  selector: 'app-setting-screen',
  templateUrl: './setting-screen.page.html',
  styleUrls: ['./setting-screen.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule]
})
export class SettingScreenPage implements OnInit, OnDestroy {

  profileImageUrl = 'assets/images/user.jfif';
  sender_name = '';
  dpStatus = '';
  isLoading = true;
  isOffline = false;

  private langSub?: Subscription;
  private backButtonSub?: Subscription;

  constructor(
    private service: ApiService,
    private authService: AuthService,
    private secureStorage: SecureStorageService,
    private router: Router,
    private alertController: AlertController,
    private navCtrl: NavController,
    private resetapp: Resetapp,
    private translate: TranslateService,
    private cd: ChangeDetectorRef,
    private zone: NgZone,
    private platform: Platform,
    private chatPouchDb: ChatPouchDb,
    private networkService: NetworkService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.sender_name = this.authService.authData?.name || '';

    this.langSub = this.translate.onLangChange.subscribe((evt: LangChangeEvent) => {
      this.zone.run(() => {
        const isRtl = /^(ar|he|fa|ur)/.test(evt.lang);
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
        try { this.cd.detectChanges(); } catch { this.cd.markForCheck(); }
      });
    });
  }

  async ionViewWillEnter() {
    this.sender_name = this.authService.authData?.name || '';
    this.isOffline = !this.networkService.isOnline.value;

    await this.loadFromCache();

    if (!this.isOffline) {
      this.syncUserProfileInBackground();
    }

    this.backButtonSub = this.platform.backButton.subscribeWithPriority(10, () => {
      this.navCtrl.navigateRoot('/home-screen', { animationDirection: 'back' });
    });
  }

  ionViewWillLeave() {
    this.backButtonSub?.unsubscribe();
  }

  ngOnDestroy() {
    this.langSub?.unsubscribe();
    this.backButtonSub?.unsubscribe();
  }

  // ============================
  // 📦 CACHE FIRST LOAD
  // ============================
  private async loadFromCache() {
    try {
      const userId = this.authService.authData?.userId;
      if (!userId) {
        this.isLoading = false;
        return;
      }

      const cached = await this.chatPouchDb.getCachedUserProfile(userId);

      if (cached) {
        this.zone.run(() => {
          this.profileImageUrl =
            cached.profile ||
            cached.avatar ||
            'assets/images/user.jfif';

          this.dpStatus =
            cached.dp_status ||
            this.translate.instant('settingsPage.defaultStatus');

          this.isLoading = false;
        });
      } else {
        this.isLoading = false;
      }
    } catch {
      this.isLoading = false;
    }
  }

  // ============================
  // 🔄 BACKGROUND SYNC
  // ============================
  private syncUserProfileInBackground() {
    const userId = this.authService.authData?.userId;
    if (!userId) return;

    this.service.getUserProfilebyId(userId).subscribe({
      next: async (res: any) => {
        this.zone.run(() => {
          if (res?.profile || res?.image_url) {
            this.profileImageUrl = res.profile || res.image_url;
          }

          this.dpStatus =
            res?.dp_status ||
            this.translate.instant('settingsPage.defaultStatus');
        });

        await this.chatPouchDb.cacheUserProfile(userId, {
          profile: this.profileImageUrl,
          avatar: this.profileImageUrl,
          dp_status: this.dpStatus,
          dp_status_updated_on: res?.dp_status_updated_on || '',
          name: this.sender_name,
          phone_number: this.authService.authData?.phone_number || ''
        });
      }
    });
  }

  private async checkNetworkBeforeAction(
  action: 
    | 'profile'
      | 'account'
      | 'privacy'
      | 'avatar'
      | 'chats'
      | 'accessibility'
      | 'notifications'
      | 'storage'
      | 'language'
      | 'help'
      | 'updates'
      | 'invite'
      | 'logout'
): Promise<boolean> {
  // 🔥 CRITICAL: Check network status RIGHT NOW (not cached)
  const currentStatus = this.networkService.isOnline.value;
  
  // Update local state immediately
  this.isOffline = !currentStatus;
  this.cdr.detectChanges();
  
  console.log(`🔍 Real-time network check for "${action}": ${currentStatus ? 'ONLINE' : 'OFFLINE'}`);
  
  // If offline, show alert and return false
  if (!currentStatus) {
    await this.showOfflineAlert(action);
    return false;
  }
  
  return true;
}


  // ============================
  // 🚫 OFFLINE ALERT (SAME AS PROFILE PAGE)
  // ============================
  private async showOfflineAlert(
    action:
      | 'profile'
      | 'account'
      | 'privacy'
      | 'avatar'
      | 'chats'
      | 'accessibility'
      | 'notifications'
      | 'storage'
      | 'language'
      | 'help'
      | 'updates'
      | 'invite'
      | 'logout'
  ) {
    let message = '';

    switch (action) {
      case 'profile':
        message = 'You are offline. Please connect to the internet to view or edit your profile.';
        break;
      case 'account':
        message = 'You are offline. Please connect to the internet to access account settings.';
        break;
      case 'privacy':
        message = 'You are offline. Please connect to the internet to manage privacy settings.';
        break;
      case 'avatar':
        message = 'You are offline. Please connect to the internet to update your avatar.';
        break;
      case 'chats':
        message = 'You are offline. Please connect to the internet to access chat settings.';
        break;
      case 'accessibility':
        message = 'You are offline. Please connect to the internet to change accessibility settings.';
        break;
      case 'notifications':
        message = 'You are offline. Please connect to the internet to manage notification settings.';
        break;
      case 'storage':
        message = 'You are offline. Please connect to the internet to access storage and data settings.';
        break;
      case 'language':
        message = 'You are offline. Please connect to the internet to change app language.';
        break;
      case 'help':
        message = 'You are offline. Please connect to the internet to access help and feedback.';
        break;
      case 'updates':
        message = 'You are offline. Please connect to the internet to check app updates.';
        break;
      case 'invite':
        message = 'You are offline. Please connect to the internet to invite friends.';
        break;
      case 'logout':
        message = 'You are offline. Please connect to the internet to logout.';
        break;
    }

    const alert = await this.alertController.create({
      header: "You're Offline",
      message,
      buttons: [{ text: 'OK', role: 'cancel' }]
    });

    await alert.present();
  }
  
    onImageError(event: any) {
    event.target.src = 'assets/images/user.jfif';
  }

  // ============================
  // ➡️ NAVIGATION (OFFLINE SAFE)
  // ============================
  async goToProfile() {
    // if (this.isOffline) { await this.showOfflineAlert('profile'); return; }
    this.router.navigateByUrl('/setting-profile');
  }

  async goToAccount() {
    if (!(await this.checkNetworkBeforeAction('account'))) {
    return;
  }
    this.router.navigateByUrl('account');
  }

  async goToPrivacy() {
    if (!(await this.checkNetworkBeforeAction('privacy'))) {
    return;
  }
    this.router.navigateByUrl('privacy');
  }

  async goToAvatar() {
    if (!(await this.checkNetworkBeforeAction('avatar'))) {
    return;
  }
    this.router.navigateByUrl('avatar');
  }

  async goToChats() {
    if (!(await this.checkNetworkBeforeAction('chats'))) {
    return;
  }
    this.router.navigateByUrl('chats');
  }

  async goToAccessibility() {
    if (!(await this.checkNetworkBeforeAction('accessibility'))) {
    return;
  }
    this.router.navigateByUrl('accessibility');
  }

  async goToNotifications() {
    if (!(await this.checkNetworkBeforeAction('notifications'))) {
    return;
  }
    this.router.navigateByUrl('notification');
  }

  async goToStorageData() {
    if (!(await this.checkNetworkBeforeAction('storage'))) {
    return;
  }
    this.router.navigateByUrl('storage-data');
  }

  async goToAppLanguage() {
    if (!(await this.checkNetworkBeforeAction('language'))) {
    return;
  }
    this.router.navigateByUrl('app-language');
  }

  async goToHelpFeedback() {
    if (!(await this.checkNetworkBeforeAction('help'))) {
    return;
  }
    this.router.navigateByUrl('help-feedback');
  }

  async goToAppUpdates() {
    if (!(await this.checkNetworkBeforeAction('updates'))) {
    return;
  }
    this.router.navigateByUrl('app-updates');
  }

  async goToInviteFriend() {
    if (!(await this.checkNetworkBeforeAction('invite'))) {
    return;
  }
    this.router.navigateByUrl('invite-friend');
  }

  // ============================
  // 🚪 LOGOUT (OFFLINE BLOCKED)
  // ============================
  async logout() {
    if (!(await this.checkNetworkBeforeAction('logout'))) {
    return;
  }

    const alert = await this.alertController.create({
      header: this.translate.instant('settingsPage.logout.confirmHeader'),
      message: this.translate.instant('settingsPage.logout.confirmMessage'),
      buttons: [
        { text: this.translate.instant('common.cancel'), role: 'cancel' },
        {
          text: this.translate.instant('common.logout'),
          cssClass: 'danger',
          handler: async () => await this.resetapp.resetApp()
        }
      ]
    });

    await alert.present();
  }
}
