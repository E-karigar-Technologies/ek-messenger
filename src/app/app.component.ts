// import {
//   ChangeDetectorRef,
//   Component,
//   NgZone,
//   OnInit,
//   OnDestroy,
// } from '@angular/core';
// import {
//   ToastController,
//   Platform,
//   ModalController,
//   PopoverController,
//   ActionSheetController,
//   AlertController,
// } from '@ionic/angular';
// import { NavigationEnd, Router } from '@angular/router';
// import { filter } from 'rxjs/operators';
// import { Subscription } from 'rxjs';

// import { NetworkService } from './services/network-connection/network.service';
// import { FirebasePushService } from './services/push_notification/firebase-push.service';
// import { FileSystemService } from './services/file-system.service';
// import { AuthService } from './auth/auth.service';
// import { FcmService } from './services/fcm-service';
// import { SqliteService } from './services/sqlite.service';
// import { PresenceService } from './services/presence.service';
// import { Language } from './services/language';
// import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
// import { ThemeService } from './services/theme';
// import { FirebaseChatService } from './services/firebase-chat.service';
// import { ContactSyncService } from './services/contact-sync.service';
// import { SyncRecoveryService } from './contact-sync/sync-recovery';

// import { StatusBar, Style } from '@capacitor/status-bar';
// import { App as CapacitorApp } from '@capacitor/app';
// import { EdgeToEdge } from '@capawesome/capacitor-android-edge-to-edge-support';
// import { Storage } from '@ionic/storage-angular';

// import { register } from 'swiper/element/bundle';
// register();

// const STORAGE_KEY = 'settings.accessibility';

// @Component({
//   selector: 'app-root',
//   templateUrl: 'app.component.html',
//   styleUrls: ['app.component.scss'],
//   standalone: false,
// })
// export class AppComponent implements OnInit, OnDestroy {
//   private homeRoutes = ['/home-screen', '/home'];
//   private appStateListener: any = null;
//   private beforeUnloadHandler: any = null;

//   private authSub?: Subscription;
//   private presenceSub?: Subscription;
//   private langSub?: Subscription;
//   private langSvcSub?: Subscription;

//   constructor(
//     private networkService: NetworkService,
//     private storage: Storage,
//     private toastController: ToastController,
//     private FirebasePushService: FirebasePushService,
//     private FileSystemService: FileSystemService,
//     private authService: AuthService,
//     private router: Router,
//     private platform: Platform,
//     private fcmService: FcmService,
//     private sqliteService: SqliteService,
//     private modalCtrl: ModalController,
//     private popoverCtrl: PopoverController,
//     private actionSheetCtrl: ActionSheetController,
//     private alertCtrl: AlertController,
//     private presence: PresenceService,
//     private langSvc: Language,
//     private translate: TranslateService,
//     private zone: NgZone,
//     private themeSvc: ThemeService,
//     private lang: Language,
//     private cd: ChangeDetectorRef,
//     private firebaseChatService: FirebaseChatService,
//     private contactSyncService: ContactSyncService,
//     private syncRecovery: SyncRecoveryService
//   ) {
//     this.testStorage();
//     this.initializeApp();
//     this.applyAccessibilityFromStorage();
//     this.NavBar_initialize();

//     this.platform.ready().then(() => {
//       this.langSvc.init();

//       this.langSub = this.translate.onLangChange.subscribe(
//         (evt: LangChangeEvent) => {
//           this.zone.run(() => this.applyLanguageChange(evt.lang));
//         }
//       );

//       if ((this.langSvc as any).langChanged$) {
//         this.langSvcSub = (this.langSvc as any).langChanged$.subscribe(
//           (newLang: string) => {
//             this.zone.run(() => this.applyLanguageChange(newLang));
//           }
//         );
//       }
//     });
//   }

//   // ---------------- INIT ----------------

//   async ngOnInit() {
//     this.lang.init();
//     this.themeSvc.apply();

//     await this.fcmService.initializePushNotifications();
//     await this.FileSystemService.init();
//     await this.platform.ready();
//     await this.authService.hydrateAuth();

//     // 🔥 AUTH STATE LISTENER (Background deletion sync)
//     if (this.authService.isAuthenticated && this.authService.authData?.userId) {
//       try {
//         console.log(
//           '🧹 Initializing background deletion sync for:',
//           this.authService.authData.userId
//         );

//         await this.firebaseChatService.initializeBackgroundDeletionSync(
//           String(this.authService.authData.userId)
//         );
//       } catch (e) {
//         console.error('❌ Background deletion sync failed', e);
//       }
//     }

//     // ---------------- AUTH FLOW ----------------
//     if (this.authService.isAuthenticated && this.authService.authData?.userId) {
//       const userId = Number(this.authService.authData.userId);

//       try {
//         console.log('🔄 Initializing Firebase chat service...');
//         await this.firebaseChatService.initApp(String(userId));
//         console.log('✅ Firebase chat initialized');
//       } catch (e) {
//         console.error('❌ Firebase init failed', e);
//       }

//       await this.firebaseChatService.cleanupExpiredMessages();
//       console.log('🧹 Startup cleanup done');

//       // ✅ TEST: 2 min baad cleanup (test ke baad hata dena)
//       // setTimeout(() => {
//       //   this.firebaseChatService.cleanupExpiredMessages();
//       //   console.log('🧹 2 min cleanup triggered');
//       // }, 2 * 60 * 1000);

//       this.presence.setOnline(userId).subscribe();

//       try {
//         this.appStateListener = CapacitorApp.addListener(
//           'appStateChange',
//           (state: any) => {
//             state.isActive
//               ? this.presence.setOnline(userId).subscribe()
//               : this.presence.setOffline(userId).subscribe();
//           }
//         );
//       } catch {}

//       this.beforeUnloadHandler = () => {
//         try {
//           this.presence.setOffline(userId).subscribe();
//         } finally {
//         }
//       };
//       window.addEventListener('beforeunload', this.beforeUnloadHandler);

//       this.router.navigateByUrl('/home-screen', { replaceUrl: true });
//     } else {
//       this.router.navigateByUrl('/welcome-screen', { replaceUrl: true });
//     }
//   }

//   // ---------------- LOGOUT ----------------

//   async onLogout() {
//     try {
//       console.log('🧹 Cleaning Firebase background listeners...');
//       this.firebaseChatService.cleanupBackgroundListeners();
//       this.firebaseChatService.stopAllDisappearingTimers();
//     } catch (e) {
//       console.warn('Cleanup failed', e);
//     }

//     await this.authService.logout();
//     this.router.navigateByUrl('/welcome-screen', { replaceUrl: true });
//   }

//   // ---------------- HELPERS ----------------

//   private async testStorage() {
//     try {
//       const s = await this.storage.create();
//       await s.set('test_key', 'ok');
//       await s.get('test_key');
//     } catch (e) {
//       console.error('[Storage error]', e);
//     }
//   }

//   private applyLanguageChange(newLang: string) {
//     this.langSvc.useLanguage(newLang);
//     const isRtl = /^(ar|he|fa|ur)/.test(newLang);
//     document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
//     document.documentElement.classList.toggle('rtl', isRtl);
//     this.cd.detectChanges();
//   }

//   async NavBar_initialize() {
//     await EdgeToEdge.enable();
//     await EdgeToEdge.setBackgroundColor({ color: '#ffffff' });
//     await StatusBar.setStyle({ style: Style.Light });
//   }

//   private applyAccessibilityFromStorage() {
//     try {
//       const raw = localStorage.getItem(STORAGE_KEY);
//       if (!raw) return;
//       const s = JSON.parse(raw);
//       const body = document.body;
//       body.classList.toggle(
//         'accessibility-high-contrast',
//         !!s.increaseContrast
//       );
//       body.classList.toggle('accessibility-reduced-motion', !!s.reduceMotion);
//       body.classList.toggle('accessibility-large-text', !!s.largeText);
//       body.classList.toggle(
//         'accessibility-simple-animations',
//         !!s.simpleAnimations
//       );
//       body.classList.toggle('accessibility-grayscale', !!s.grayscale);
//     } catch {}
//   }

//   async initializeApp() {
//     await this.platform.ready();
//     this.platform.backButton.subscribeWithPriority(10, async () => {
//       if (!this.platform.is('android')) return;

//       const currentUrl = this.router.url.split('?')[0];
//       if (!this.homeRoutes.includes(currentUrl)) {
//         window.history.length > 1
//           ? window.history.back()
//           : this.router.navigate(['/home-screen']);
//         return;
//       }

//       const top =
//         (await this.modalCtrl.getTop()) ||
//         (await this.popoverCtrl.getTop()) ||
//         (await this.actionSheetCtrl.getTop()) ||
//         (await this.alertCtrl.getTop());

//       if (top) {
//         await top.dismiss();
//         return;
//       }

//       await CapacitorApp.exitApp();
//     });
//   }

//   // ---------------- DESTROY ----------------

//   ngOnDestroy() {
//     this.authSub?.unsubscribe();
//     this.presenceSub?.unsubscribe();
//     this.langSub?.unsubscribe();
//     this.langSvcSub?.unsubscribe();

//     if (this.appStateListener?.remove) this.appStateListener.remove();
//     if (this.beforeUnloadHandler) {
//       window.removeEventListener('beforeunload', this.beforeUnloadHandler);
//     }
//   }
// }


import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnInit,
  OnDestroy,
} from '@angular/core';
import {
  ToastController,
  Platform,
  ModalController,
  PopoverController,
  ActionSheetController,
  AlertController,
} from '@ionic/angular';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { getDatabase, ref, get, set, remove } from 'firebase/database';
 
import { NetworkService } from './services/network-connection/network.service';
import { FirebasePushService } from './services/push_notification/firebase-push.service';
import { FileSystemService } from './services/file-system.service';
import { AuthService } from './auth/auth.service';
import { FcmService } from './services/fcm-service';
import { SqliteService } from './services/sqlite.service';
import { PresenceService } from './services/presence.service';
import { Language } from './services/language';
import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
import { ThemeService } from './services/theme';
import { FirebaseChatService } from './services/firebase-chat.service';
import { ContactSyncService } from './services/contact-sync.service';
import { SyncRecoveryService } from './contact-sync/sync-recovery';
import { GlobalSettingsSyncService } from './services/global-settings-sync.service';
import { ChatBackendSocketService } from './services/chat-backend-socket.service';
 
import { StatusBar, Style } from '@capacitor/status-bar';
import { App as CapacitorApp } from '@capacitor/app';
import { EdgeToEdge } from '@capawesome/capacitor-android-edge-to-edge-support';
import { Storage } from '@ionic/storage-angular';
 
import { register } from 'swiper/element/bundle';
register();
 
const STORAGE_KEY = 'settings.accessibility';
const GLOBAL_SETTINGS_LOCAL_UPDATED_EVENT = 'global-settings:local-updated';
 
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {
  private homeRoutes = ['/home-screen', '/home'];
  private appStateListener: any = null;
  private beforeUnloadHandler: any = null;
  private pendingDeepLinkChannelId: string | null = null;
  private appInitDone = false;
 
  private authSub?: Subscription;
  private presenceSub?: Subscription;
  private langSub?: Subscription;
  private langSvcSub?: Subscription;
  private globalSettingsUpdatedListener?: EventListener;
 
  // ── Favorite mute expiry timer (app-level) ──────────────────────────────
  private _favMuteExpiryTimer: any = null;
 
  constructor(
    private networkService: NetworkService,
    private storage: Storage,
    private toastController: ToastController,
    private FirebasePushService: FirebasePushService,
    private FileSystemService: FileSystemService,
    private authService: AuthService,
    private router: Router,
    private platform: Platform,
    private fcmService: FcmService,
    private sqliteService: SqliteService,
    private modalCtrl: ModalController,
    private popoverCtrl: PopoverController,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    private presence: PresenceService,
    private langSvc: Language,
    private translate: TranslateService,
    private zone: NgZone,
    private themeSvc: ThemeService,
    private lang: Language,
    private cd: ChangeDetectorRef,
    private firebaseChatService: FirebaseChatService,
    private contactSyncService: ContactSyncService,
    private syncRecovery: SyncRecoveryService,
    private globalSettingsSync: GlobalSettingsSyncService,
    private chatBackendSocket: ChatBackendSocketService
  ) {
    this.testStorage();
    this.initializeApp();
    this.applyAccessibilityFromStorage();
    this.NavBar_initialize();
 
    this.platform.ready().then(() => {
      this.globalSettingsUpdatedListener = () => {
        this.zone.run(() => {
          this.applySyncedPreferencesFromStorage().catch(() => undefined);
        });
      };

      window.addEventListener(
        GLOBAL_SETTINGS_LOCAL_UPDATED_EVENT,
        this.globalSettingsUpdatedListener
      );
 
      this.langSub = this.translate.onLangChange.subscribe(
        (evt: LangChangeEvent) => {
          this.zone.run(() => this.applyLanguageChange(evt.lang));
        }
      );
 
      if ((this.langSvc as any).langChanged$) {
        this.langSvcSub = (this.langSvc as any).langChanged$.subscribe(
          (newLang: string) => {
            this.zone.run(() => this.applyLanguageChange(newLang));
          }
        );
      }
    });
  }
 
  // ── INIT ─────────────────────────────────────────────────────────────────
  async ngOnInit() {
    this.themeSvc.apply();
 
    await this.fcmService.initializePushNotifications();
    await this.FileSystemService.init();
    await this.platform.ready();
    await this.authService.hydrateAuth();
    this.themeSvc.initTheme();

    // ── DEEP LINK HANDLER ─────────────────────────────────────────────────
    CapacitorApp.addListener('appUrlOpen', (event: any) => {
      this.zone.run(() => {
        const url: string = event.url;
        const match = url.match(/\/channel\/(\d+)/);
        if (match) {
          const channelId = match[1];
          if (this.appInitDone) {
            // App already initialised — navigate immediately
            this.router.navigate(['/channel-feed'], { queryParams: { channelId } });
          } else {
            // App still booting — save for after init
            this.pendingDeepLinkChannelId = channelId;
          }
        }
      });
    });

    let languageAppliedFromStorage = false;

    try {
      await this.globalSettingsSync.initialize();
      await this.applySyncedPreferencesFromStorage();
      languageAppliedFromStorage = !!localStorage.getItem('app_language');
    } catch (e) {
      console.warn('Global settings sync init failed', e);
    }

    if (!languageAppliedFromStorage) {
      this.langSvc.init();
    }
 
    // 🔥 Background deletion sync (online only)
    if (this.authService.isAuthenticated && this.authService.authData?.userId && this.networkService.isOnline.value) {
      try {
        await this.firebaseChatService.initializeBackgroundDeletionSync(
          String(this.authService.authData.userId)
        );
      } catch (e) {
        console.error('❌ Background deletion sync failed', e);
      }
    }
 
    // ── AUTH FLOW ──────────────────────────────────────────────────────────
    if (this.authService.isAuthenticated && this.authService.authData?.userId) {
      const userId = Number(this.authService.authData.userId);

      // ── Re-authenticate Firebase when network recovers after offline start ──
      // If hydrateAuth() skipped Firebase auth because we were offline,
      // retry as soon as the first online event fires.
      let firebaseReauthDone = this.networkService.isOnline.value; // true = was online at start
      this.networkService.isOnline$.subscribe(async (isOnline) => {
        if (isOnline && !firebaseReauthDone) {
          firebaseReauthDone = true;
          try {
            await this.authService.hydrateAuth();
            console.log('🔄 Firebase re-auth on network recovery done');
          } catch (e) {
            console.warn('⚠️ Firebase re-auth on network recovery failed', e);
          }
          // Re-establish socket connection now that we're back online
          try {
            await this.chatBackendSocket.reconnect();
            console.log('🔄 Socket reconnected on network recovery');
          } catch (e) {
            console.warn('⚠️ Socket reconnect on network recovery failed', e);
          }
        }
      });

      try {
        await this.firebaseChatService.initApp(String(userId));
      } catch (e) {
        console.error('❌ Firebase init failed', e);
      }

      // These calls touch Firebase/network — wrap so they never block routing
      try { await this.firebaseChatService.cleanupExpiredMessages(); } catch {}
      try { await this.checkAndExpireFavoriteMutes(); } catch {}

      // Only set presence online if we actually have a network connection
      if (this.networkService.isOnline.value) {
        this.presence.setOnline(userId).subscribe();
      }
 
      try {
        this.appStateListener = CapacitorApp.addListener(
          'appStateChange',
          async (state: any) => {
            if (state.isActive) {
              this.presence.setOnline(userId).subscribe();
              // ✅ Check favorite mute expiry when app comes to foreground
              console.log('[App] Foreground — checking favorite mute expiry');
              await this.checkAndExpireFavoriteMutes();
              // ✅ Re-activate current chat if user is still on chat screen
              await this.firebaseChatService.reactivateCurrentChat();
            } else {
              this.presence.setOffline(userId).subscribe();
              // ✅ Clear active chat on minimize so notifications aren't blocked
              await this.firebaseChatService.clearActiveChat();
            }
          }
        );
      } catch {}
 
      this.beforeUnloadHandler = () => {
        try {
          this.presence.setOffline(userId).subscribe();
        } finally {}
      };
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
 
      // ── CHECK FOR DEEP LINK ON COLD START ─────────────────────────────
      // getLaunchUrl() returns the URL used to open the app (cold start only)
      let navigated = false;
      try {
        const launchUrl = await CapacitorApp.getLaunchUrl();
        if (launchUrl?.url) {
          const match = launchUrl.url.match(/\/channel\/(\d+)/);
          if (match) {
            const channelId = match[1];
            this.router.navigate(['/channel-feed'], { queryParams: { channelId }, replaceUrl: true });
            navigated = true;
          }
        }
      } catch (e) { /* not on native, ignore */ }

      // Also consume any pending deep link captured by appUrlOpen before init finished
      if (!navigated && this.pendingDeepLinkChannelId) {
        const channelId = this.pendingDeepLinkChannelId;
        this.pendingDeepLinkChannelId = null;
        this.router.navigate(['/channel-feed'], { queryParams: { channelId }, replaceUrl: true });
        navigated = true;
      }

      if (!navigated) {
        this.router.navigateByUrl('/home-screen', { replaceUrl: true });
      }

      this.appInitDone = true;
    } else {
      this.router.navigateByUrl('/welcome-screen', { replaceUrl: true });
      this.appInitDone = true;
    }
  }
   ngAfterViewInit(){
    this.themeSvc.initTheme();
  }
 
  // ── FAVORITE MUTE EXPIRY (App-level) ─────────────────────────────────────
  /**
   * Reads users/{userId}/mutedChatsUntil from Firebase.
   * For each roomId whose timestamp has passed → unmute it.
   * Also schedules a setTimeout for the next upcoming expiry.
   */
  private async checkAndExpireFavoriteMutes(): Promise<void> {
    try {
      const userId = this.authService.authData?.userId;
      if (!userId) return;
 
      const db = getDatabase();
      const snap = await get(ref(db, `users/${userId}/mutedChatsUntil`));
      if (!snap.exists()) return;
 
      const mutedChatsUntil: Record<string, number> = snap.val() || {};
      const now = Date.now();
      const expiredRoomIds: string[] = [];
 
      for (const [roomId, muteUntilTs] of Object.entries(mutedChatsUntil)) {
        if (muteUntilTs === 0) continue; // 0 = always muted, skip
        if (muteUntilTs <= now) {
          expiredRoomIds.push(roomId);
        }
      }
 
      if (expiredRoomIds.length > 0) {
        console.log(
          `[App] ${expiredRoomIds.length} favorite mute(s) expired — unmuting`
        );
 
        for (const roomId of expiredRoomIds) {
          // Use existing FirebaseChatService method
          await this.firebaseChatService.unmuteChat(roomId, String(userId));
            // Use secure proxy to remove the expiry timestamp entry
          await this.firebaseChatService.applySecuredBatchUpdates({
            [`users/${userId}/mutedChatsUntil/${roomId}`]: null,
          });
        }
      }
 
      // ── Schedule next check at the earliest upcoming expiry ──────────────
      this.scheduleNextFavMuteCheck(mutedChatsUntil, now, expiredRoomIds);
    } catch (err) {
      console.error('[App] checkAndExpireFavoriteMutes error:', err);
    }
  }
 
  /**
   * Sets a single setTimeout that fires exactly when the next mute expires.
   * Re-runs checkAndExpireFavoriteMutes at that point.
   */
  private scheduleNextFavMuteCheck(
    mutedChatsUntil: Record<string, number>,
    now: number,
    alreadyExpired: string[]
  ): void {
    // Clear any existing timer
    if (this._favMuteExpiryTimer) {
      clearTimeout(this._favMuteExpiryTimer);
      this._favMuteExpiryTimer = null;
    }
 
    // Find earliest future expiry among remaining (non-expired, non-always) rooms
    const futureTimes = Object.entries(mutedChatsUntil)
      .filter(([roomId, ts]) => ts > 0 && ts > now && !alreadyExpired.includes(roomId))
      .map(([, ts]) => ts);
 
    if (futureTimes.length === 0) return;
 
    const earliest = Math.min(...futureTimes);
    const msUntil = earliest - now;
 
    console.log(
      `[App] Next favorite mute expiry in ${Math.round(msUntil / 1000)}s`
    );
 
    this._favMuteExpiryTimer = setTimeout(async () => {
      console.log('[App] Timer fired — running mute expiry check');
      await this.checkAndExpireFavoriteMutes();
    }, msUntil);
  }
 
  // ── LOGOUT ────────────────────────────────────────────────────────────────
  async onLogout() {
    // Clear app-level mute timer on logout
    if (this._favMuteExpiryTimer) {
      clearTimeout(this._favMuteExpiryTimer);
      this._favMuteExpiryTimer = null;
    }
 
    try {
      this.firebaseChatService.cleanupBackgroundListeners();
      this.firebaseChatService.stopAllDisappearingTimers();
    } catch (e) {
      console.warn('Cleanup failed', e);
    }
 
    await this.authService.logout();
    this.router.navigateByUrl('/welcome-screen', { replaceUrl: true });
  }
 
  // ── HELPERS ───────────────────────────────────────────────────────────────
  private async testStorage() {
    try {
      const s = await this.storage.create();
      await s.set('test_key', 'ok');
      await s.get('test_key');
    } catch (e) {
      console.error('[Storage error]', e);
    }
  }
 
  private applyLanguageChange(newLang: string) {
    // Do NOT call langSvc.useLanguage() here — this method is invoked FROM
    // translate.onLangChange and langChanged$, both of which are already
    // triggered by useLanguage().  Calling it again creates an infinite loop
    // (useLanguage → onLangChange → applyLanguageChange → useLanguage → …)
    // which blows the call stack and produces the regex "Stack overflow" error.
    const rtlPrefixes = ['ar', 'he', 'fa', 'ur'];
    const isRtl = rtlPrefixes.some(p => newLang.startsWith(p));
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.classList.toggle('rtl', isRtl);
    this.cd.detectChanges();
  }
 
  async NavBar_initialize() {
    await EdgeToEdge.enable();
    await this.updateThemeColors();

    // Listen for system theme changes
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkQuery.addEventListener('change', () => {
      this.updateThemeColors();
    });
  }

  private async updateThemeColors() {
    let isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Check manual override from storage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.darkMode === 'boolean') {
          isDark = s.darkMode;
        }
      }
    } catch { }

    const bgColor = isDark ? '#121212' : '#ffffff';
    const statusStyle = isDark ? Style.Dark : Style.Light;

    // Synchronize DOM class as well to be sure
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);

    await EdgeToEdge.setBackgroundColor({ color: bgColor });
    await StatusBar.setStyle({ style: statusStyle });
    if (this.platform.is('android')) {
      await StatusBar.setBackgroundColor({ color: bgColor });
    }
  }

  private async applySyncedPreferencesFromStorage(): Promise<void> {
    this.applyAccessibilityFromStorage();
    this.themeSvc.apply();

    const syncedLang = localStorage.getItem('app_language');
    if (syncedLang) {
      await this.langSvc.useLanguage(syncedLang);
    }
  }
 
  private applyAccessibilityFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      const root = document.documentElement;
      const body = document.body;

      // Dark Mode
      const isDark = !!s.darkMode;
      root.classList.toggle('dark', isDark);
      body.classList.toggle('dark', isDark);

      // Other Accessibility
      body.classList.toggle('accessibility-high-contrast', !!s.increaseContrast);
      body.classList.toggle('accessibility-reduced-motion', !!s.reduceMotion);
      body.classList.toggle('accessibility-large-text', !!s.largeText);
      body.classList.toggle('accessibility-simple-animations', !!s.simpleAnimations);
      body.classList.toggle('accessibility-grayscale', !!s.grayscale);

      // Status Bar & EdgeToEdge sync
      this.updateThemeColors();
    } catch { }
  }
 
  async initializeApp() {
    await this.platform.ready();
    this.platform.backButton.subscribeWithPriority(10, async () => {
      if (!this.platform.is('android')) return;
 
      const currentUrl = this.router.url.split('?')[0];
      if (!this.homeRoutes.includes(currentUrl)) {
        window.history.length > 1
          ? window.history.back()
          : this.router.navigate(['/home-screen']);
        return;
      }
 
      const top =
        (await this.modalCtrl.getTop()) ||
        (await this.popoverCtrl.getTop()) ||
        (await this.actionSheetCtrl.getTop()) ||
        (await this.alertCtrl.getTop());
 
      if (top) {
        await top.dismiss();
        return;
      }
 
      await CapacitorApp.exitApp();
    });
  }
 
  // ── DESTROY ───────────────────────────────────────────────────────────────
  ngOnDestroy() {
    this.authSub?.unsubscribe();
    this.presenceSub?.unsubscribe();
    this.langSub?.unsubscribe();
    this.langSvcSub?.unsubscribe();
 
    if (this._favMuteExpiryTimer) {
      clearTimeout(this._favMuteExpiryTimer);
    }
    if (this.appStateListener?.remove) this.appStateListener.remove();
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    if (this.globalSettingsUpdatedListener) {
      window.removeEventListener(
        GLOBAL_SETTINGS_LOCAL_UPDATED_EVENT,
        this.globalSettingsUpdatedListener
      );
    }
  }
}