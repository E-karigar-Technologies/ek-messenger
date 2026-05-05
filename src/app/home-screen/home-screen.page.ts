import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import {
  ActionSheetController,
  AlertController,
  IonicModule,
  LoadingController,
  ModalController,
  PopoverController,
  ToastController,
} from '@ionic/angular';
import { FooterTabsComponent } from '../components/footer-tabs/footer-tabs.component';
import { ActivatedRoute, Router } from '@angular/router';
import { MenuPopoverComponent } from '../components/menu-popover/menu-popover.component';
import { FormsModule } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import { ApiService } from '../services/api/api.service';
import { FirebaseChatService } from '../services/firebase-chat.service';
import { ChatBackendSocketService } from '../services/chat-backend-socket.service';
import { Subscription } from 'rxjs';
import { EncryptionService } from '../services/encryption.service';
import { Capacitor } from '@capacitor/core';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';
import { AuthService } from '../auth/auth.service';
import { Observable } from 'rxjs';
import { Database } from '@angular/fire/database';
import { ContactSyncService } from '../services/contact-sync.service';
import { Device } from '@capacitor/device';
import { PushNotifications } from '@capacitor/push-notifications';
import { FcmService } from '../services/fcm-service';
import { NetworkService } from '../services/network-connection/network.service';
import {
  ChatListFilterService,
  ChatCustomList,
} from '../services/chat-list-filter.service';

// Firebase modular imports
import {
  getDatabase,
  ref as rtdbRef,
  onValue as rtdbOnValue,
  get,
  update,
  remove,
  set,
} from 'firebase/database';
import { TypingService } from '../services/typing.service';
import { Resetapp } from '../services/resetapp';
import { VersionCheck } from '../services/version-check';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MenuHomePopoverComponent } from '../components/menu-home-popover/menu-home-popover.component';
import { CommunityChat } from 'src/types';

import { SqliteService, IConversation } from '../services/sqlite.service';
import { ImageCropperModalComponent } from 'src/app/components/image-cropper-modal/image-cropper-modal.component';
import { CropResult } from 'src/types';
import { ChatPouchDb } from '../services/chat-pouch-db';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { take } from 'rxjs/operators';
import { ChooseListSheetComponent } from '../components/choose-list-sheet/choose-list-sheet.component';
import { NewListModalComponent } from '../components/new-list-modal/new-list-modal.component';

@Component({
  selector: 'app-home-screen',
  templateUrl: './home-screen.page.html',
  styleUrls: ['./home-screen.page.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FooterTabsComponent,
    FormsModule,
    TranslateModule,
    ScrollingModule,
  ],
})
export class HomeScreenPage implements OnInit, OnDestroy {
  // Search & Filter
  searchText = '';
  selectedFilter = 'all';

  // User Info
  currUserId: string | null = null;
  senderUserId: string | null = null;
  sender_name: string | undefined;

  // UI State
  isLoading: boolean = true;
  isChatsLoaded: boolean = false;
  showPopup = false;
  showPreviewModal: boolean = false;
  isOffline: boolean = false; // 🔥 NEW: Offline indicator
  isDarkMode: boolean = false; // 🔥 NEW: Dark mode indicator

  // Selection Mode
  selectedChats: any[] = [];
  selectedConversations: Set<string> = new Set();
  private longPressTimer: any = null;

  // Conversations
  conversations: (IConversation & {
    isTyping: boolean;
    isSelected: boolean;
    isSelfChat?: boolean;
  })[] = [];
  archievedCount: number = 0;
  keepArchivedChats: boolean = true;

  // Attachment & Preview
  selectedAttachment: any = null;
  selectedChat: any = null;
  selectedImage: string | null = null;
  messageText = '';
  theyBlocked?: boolean;

  // Maps & Sets
  private avatarErrorIds = new Set<string>();
  private typingUnsubs: Map<string, () => void> = new Map();
  private communityUnreadSubs: Map<string, any> = new Map();
  private archivedMap: Record<
    string,
    { archivedAt: number; isArchived: boolean }
  > = {};
  private lockedMap: Record<string, { lockedAt: number; isLocked: boolean }> =
    {};
  // Real-time listeners for last message updates
  private lastMessageListeners: Map<string, () => void> = new Map();

  // Subscriptions
  unreadSubs: Subscription[] = [];
  private pinUnsub: (() => void) | null = null;
  private archiveUnsub: (() => void) | null = null;
  private networkSub: Subscription | null = null; // 🔥 NEW: Network subscription

  // Constants
  private readonly MAX_PINNED = 3;
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  // Legacy compatibility (kept for HTML template)
  chatList: any[] = [];
  toggleGroupCreator = false;
  newGroupName = '';
  scannedText = '';
  capturedImage = '';
  isSending = false;
  receiver_name = '';
  typingUsers$: any;
  isTyping$: any;
  private isInitialLoadComplete = false;
  private conversationsSubscription: any = null;
  private prefetchedConversations = new Map<string, any>();
  private prefetchTimeout: any = null;
  isSyncing: boolean = false;

  // for redirection to contactpsge if chats are 0
  private autoRedirectTimer: any = null;

  // Conversation pagination loader
  private _convBatchesComplete = false;
  private _convBatchSub: Subscription | null = null;
  private _convCacheEmpty = false;
  private _convLoadingController: HTMLIonLoadingElement | null = null;
  private _convSafetyTimeout: any = null;
  showNewListModal = false;
  newListName = '';
  newListNameError = '';
  activeListFilterId: string | null = null;

  constructor(
    private router: Router,
    private popoverCtrl: PopoverController,
    private service: ApiService,
    private firebaseChatService: FirebaseChatService,
    private encryptionService: EncryptionService,
    private secureStorage: SecureStorageService,
    private authService: AuthService,
    private db: Database,
    private contactSyncService: ContactSyncService,
    private typingService: TypingService,
    private alertCtrl: AlertController,
    private resetapp: Resetapp,
    private versionService: VersionCheck,
    private translate: TranslateService,
    private sqlite: SqliteService,
    private toastCtrl: ToastController,
    private modalController: ModalController,
    private alertController: AlertController,
    private fcmService: FcmService,
    private networkService: NetworkService,
    private cdr: ChangeDetectorRef,
    private chatPouchDb: ChatPouchDb,
    private loadingCtrl: LoadingController,
    private actionSheetCtrl: ActionSheetController,
    public chatListFilterService: ChatListFilterService,
    private route: ActivatedRoute,
    private chatBackendSocket: ChatBackendSocketService
  ) {}

  async ngOnInit() {
    this.currUserId = this.authService.authData?.phone_number || '';
    this.senderUserId = this.authService.authData?.userId || '';

    // for contact names
    this.sender_name = this.authService.authData?.name || ''; // ✅ Initialize sender_name here
    this.isLoading = true;
    this.trackRouteChanges();

    // 🔥 NEW: Setup network monitoring
    this.setupNetworkMonitoring();
  }
  private contactsSub: Subscription | null = null;
  /**
   * ✅ Check and auto-redirect to contacts if no chats
   */
  private checkAndRedirectToContacts(): void {
    // Clear any existing timer
    if (this.autoRedirectTimer) {
      clearTimeout(this.autoRedirectTimer);
      this.autoRedirectTimer = null;
    }

    // Only redirect if no chats
    if (
      !this.isLoading &&
      this.conversations.length === 0 &&
      !this.isSelectionMode
    ) {
      console.log('⏰ No chats - starting 5 second redirect timer...');

      this.autoRedirectTimer = setTimeout(() => {
        console.log('🚀 Auto-redirecting to contacts...');
        this.goToContact(); // ✅ Use existing method
      }, 5000); // 5 seconds
    }
  }

  /**
   * 🔥 NEW: Setup network status monitoring
   */
  private setupNetworkMonitoring(): void {
    this.networkSub = this.networkService.isOnline$.subscribe(
      async (isOnline) => {
        const wasOffline = this.isOffline;
        this.isOffline = !isOnline;

        console.log(
          `🌐 Network status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`
        );

        if (isOnline && wasOffline) {
          // Just came back online - sync data
          console.log('📡 Back online - syncing data...');
          await this.showToast('Back online - syncing...', 'primary');
          await this.syncDataWhenOnline();
        } else if (!isOnline && !wasOffline) {
          // Just went offline
          console.log('📴 Went offline - using cached data');
          await this.showToast('You are offline', 'warning');
        }
      }
    );

    // Set initial state
    this.isOffline = !this.networkService.isOnline.value;
  }

  /**
   * 🔥 NEW: Sync data when coming back online
   */
  private async syncDataWhenOnline(): Promise<void> {
    try {
      if (!this.authService.senderId) return;

      // Process pending actions from queue
      await this.firebaseChatService.processPendingActions?.();

      // Refresh conversations from server
      await this.firebaseChatService.syncConversationWithServer();

      console.log('✅ Data synced successfully');
    } catch (error) {
      console.error('❌ Error syncing data:', error);
    }
  }

  //     private isSystemCommunityGroup(conv: any): boolean {
  //   if (conv.type !== 'group') return false;

  //   const title = (conv.title || '').trim().toLowerCase();
  //   const isSystemTitle = title === 'announcements' || title === 'general';

  //   // If it has a communityId field set, it's definitely a system group
  //   if (conv.communityId && isSystemTitle) return true;

  //   // Fallback: roomId pattern check (e.g. "xyz_announcement", "xyz_general")
  //   const roomId = (conv.roomId || '').toLowerCase();
  //   if (isSystemTitle) return true; // block all announcements/general regardless

  //   return false;
  // }

  private isSystemCommunityGroup(conv: any): boolean {
    if (conv.type !== 'group') return false;

    const title = (conv.title || '').trim().toLowerCase();
    const isSystemTitle = title === 'announcements' || title === 'general';

    // ✅ ONLY filter if communityId bhi hai — standalone group named "General" allow karo
    if (conv.communityId && isSystemTitle) return true;

    // ✅ roomId pattern check as fallback
    const roomId = (conv.roomId || '').toLowerCase();
    if (
      isSystemTitle &&
      (roomId.includes('_announcement') || roomId.includes('_general'))
    )
      return true;

    return false;
  }

  // updated function for auto selection and contact sync
  async ionViewWillEnter() {
    this.checkDarkMode();
    // this.buildContactLookupMap();  // <-- ADD THIS FIRST LINE

    // Load keepArchived setting on every enter so it's always in sync
    try {
      const raw = localStorage.getItem('settings.chats');
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.keepArchived === 'boolean') {
          this.keepArchivedChats = s.keepArchived;
        }
      }
    } catch {}
    try {
      // ✅ Phase 1: Show loading indicator
      if (!this.isInitialLoadComplete) {
        this.isLoading = true;
      }

      await this.firebaseChatService.closeChat();
      await this.chatListFilterService.loadFromFirebase();

      if (!this.isInitialLoadComplete) {
        console.info('🚀 First time initialization...');

        const isOnline = this.networkService.isOnline.value;
        console.log(`📡 Network status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

        // ✅ Phase 2: Load cache FIRST (instant - 0.5s)
        await this.loadChatsFromCache();

        // ✅ NEW: Show loader if cache empty + online
        if (this._convCacheEmpty && this.networkService.isOnline.value) {
          this._showConvLoader();
          this._convSafetyTimeout = setTimeout(() => {
            this._hideConvLoader();
          }, 30000);
        }

        // ✅ NEW: Subscribe to batch complete signal
        this._convBatchSub =
          this.firebaseChatService.conversationBatchesComplete$.subscribe(
            (done) => {
              if (done) {
                this._convBatchesComplete = true;
                this._hideConvLoader();
                if (this._convSafetyTimeout) {
                  clearTimeout(this._convSafetyTimeout);
                  this._convSafetyTimeout = null;
                }
              }
            }
          );

        // ✅ Phase 3: Hide loading, show cached data
        this.isLoading = false;

        // ✅ Phase 4: Start background sync (non-blocking)
        if (isOnline) {
          this.isSyncing = true;
          // ✅ OPTIMIZED: Don't await - let it run in background
          this.initializeApp()
            .catch((err) => console.warn('Init error:', err))
            .finally(() => (this.isSyncing = false));
        } else {
          // Offline: Just initialize without waiting
          this.initializeApp().catch((err) =>
            console.warn('Init error offline:', err)
          );
        }

        // ✅ Phase 5: Subscribe to conversations updated
        if (!this.conversationsSubscription) {
          this.conversationsSubscription =
            this.firebaseChatService.conversations.subscribe((convs) => {
              this.archievedCount =
                convs.filter((c) => c.isArchived).length || 0;

              // Auto-unarchive when keepArchived is OFF and chat got a new message
              if (!this.keepArchivedChats) {
                const toUnarchive = convs.filter(
                  (c) => c.isArchived && (c.unreadCount ?? 0) > 0
                );
                if (toUnarchive.length > 0) {
                  this.firebaseChatService
                    .setArchiveConversation(
                      toUnarchive.map((c) => c.roomId),
                      false
                    )
                    .catch((err) =>
                      console.warn('Auto-unarchive error:', err)
                    );
                }
              }

              const prevById = new Map(
                this.conversations.map((c) => [c.roomId, c as any])
              );

              this.conversations = convs
                .map((c) => {
                  const prev = prevById.get(c.roomId);
                  return {
                    ...c,
                    title: c.title || prev?.title,
                    isTyping: false,
                    isSelected: false,
                    lastMessage: c.lastMessage ?? '',
                    isSelfChat: this.isSelfChat(c),
                    theyBlocked: prev?.theyBlocked ?? false, // Keep previous value
                  };
                })
                // .filter((c) => !c.isLocked && !c.isArchived);
                .filter(
                  (c) =>
                    !c.isLocked &&
                    !c.isArchived &&
                    !this.isSystemCommunityGroup(c)
                );

              this.isChatsLoaded = true;

              // ✅ Always resolve - platformUsers already loaded by now on subsequent fires
              this.resolveContactNamesInPlace();

              // ✅ NEW: Resolve block status for all private chats
              this.resolveBlockStatusInPlace();

              this.cdr.detectChanges();
              this.checkAndRedirectToContacts();
              this.setupLastMessageListeners(this.conversations);
            });
        }

        if (!this.contactsSub) {
          this.contactsSub = this.firebaseChatService.platformUsers$.subscribe(
            (users) => {
              if (users && users.length > 0 && this.conversations.length > 0) {
                // conversations already loaded, platformUsers just arrived
                this.resolveContactNamesInPlace();
                this.cdr.detectChanges();
              }
            }
          );
        }

        // ✅ Phase 6: Online-only checks (background)
        if (isOnline) {
          this.performOnlineChecks().catch((err) =>
            console.warn('Online checks error:', err)
          );
        }

        this.isInitialLoadComplete = true;
      } else {
        // ✅ Subsequent visits: instant
        this.isLoading = false;
      }

      this.senderUserId =
        this.authService.authData?.userId || this.senderUserId || '';
      this.sender_name = this.authService.authData?.name || '';
      this.clearChatSelection();
      this.route.queryParams.pipe(take(1)).subscribe((params) => {
        if (params['filter'] === 'all') {
          this.activeListFilterId = null;
          this.selectedFilter = 'all';
          this.cdr.detectChanges();
        }
      });
    } catch (err) {
      console.warn('❌ ionViewWillEnter error:', err);
      this.isLoading = false;
      this.isSyncing = false;

      if (!this.networkService.isOnline.value) {
        await this.showToast('Using cached data (offline)', 'warning');
      } else {
        await this.showToast('Failed to load some data', 'danger');
      }
    }
  }

  private async _showConvLoader(): Promise<void> {
    if (this._convLoadingController) return;
    this._convLoadingController = await this.loadingCtrl.create({
      message: 'Loading chats...',
      spinner: 'crescent',
      cssClass: 'custom-loading',
    });
    await this._convLoadingController.present();
  }

  private async _hideConvLoader(): Promise<void> {
    if (this._convLoadingController) {
      await this._convLoadingController.dismiss().catch(() => {});
      this._convLoadingController = null;
    }
  }

  private async loadChatsFromCache(): Promise<void> {
    try {
      console.log('📦 Loading chats from PouchDB cache...');
      const startTime = performance.now();

      const cachedConversations = await this.chatPouchDb.getConversations(
        this.authService.senderId as string
      );

      const loadTime = performance.now() - startTime;
      console.log(`⏱️ Cache load time: ${loadTime.toFixed(2)}ms`);

      // Sanitize: drop corrupted conversations where roomId prefix contradicts stored type
      const validCachedConversations = cachedConversations.filter((c) => {
        if (c.roomId?.startsWith('group_') && c.type !== 'group') return false;
        if (c.roomId?.startsWith('community_') && c.type !== 'community') return false;
        return true;
      });

      // If sanitization removed entries, those will be re-fetched from Firebase
      this._convCacheEmpty = validCachedConversations.length === 0;

      if (validCachedConversations.length > 0) {
        this.conversations = validCachedConversations
          .map((c) => ({
            ...c,
            isTyping: false,
            isSelected: false,
            lastMessage: c.lastMessage ?? '',
            isSelfChat: this.isSelfChat(c),
            _nameResolved: true,
          }))
          // .filter((c) => !c.isLocked && !c.isArchived);
          .filter(
            (c) =>
              !c.isLocked && !c.isArchived && !this.isSystemCommunityGroup(c)
          );

        this.archievedCount =
          validCachedConversations.filter((c) => c.isArchived).length || 0;
        this.isChatsLoaded = true;
        this.cdr.detectChanges();
        console.log(
          `✅ Loaded ${this.conversations.length} chats from cache with titles`
        );
      } else {
        console.log('📭 No cached chats found');
      }
    } catch (error) {
      console.error('❌ Error loading from cache:', error);
    }
  }

  /**
   * 🔥 NEW: Initialize app with network awareness
   */
  private async initializeApp(): Promise<void> {
    try {
      const isOnline = this.networkService.isOnline.value;

      // ✅ Start Firebase init (triggers background sync)
      const initPromise = this.firebaseChatService.initApp(
        this.authService.senderId as string
      );

      if (isOnline) {
        // ✅ Run notification check in parallel (non-blocking)
        this.checkAndUpdateNotificationPermission().catch((err) =>
          console.warn('Notification check failed:', err)
        );

        // ✅ Wait for Firebase init to complete
        await initPromise;
        // this.buildContactLookupMap();  // ← ADD HERE (after initApp completes, contacts are loaded)
      } else {
        // ✅ Offline: just init without waiting
        await initPromise;
        // this.buildContactLookupMap();  // ← ADD HERE (after initApp completes, contacts are loaded)
      }
    } catch (error) {
      console.error('❌ initializeApp error:', error);
      // Don't throw - allow app to continue with cached data
      await this.showToast('Using cached data', 'warning');
    }
  }

  /**
   * 🔥 NEW: Perform online-only checks
   */
  private async performOnlineChecks(): Promise<void> {
    try {
      // Sequential checks (don't block UI if they fail)
      await this.checkForceLogout().catch((err) =>
        console.warn('Force logout check failed:', err)
      );

      const verified = await this.verifyDeviceOnEnter().catch((err) => {
        console.warn('Device verification failed:', err);
        return true; // Continue even if verification fails
      });

      if (!verified) {
        console.warn('⚠️ Device verification failed');
      }
    } catch (error) {
      console.warn('❌ performOnlineChecks error:', error);
      // Don't throw - allow app to continue with cached data
    }
  }

  /**
   * ✅ Check notification permission and update Firebase (ONLINE ONLY)
   */
  private async checkAndUpdateNotificationPermission(): Promise<void> {
    try {
      // 🔥 Skip if offline
      if (!this.networkService.isOnline.value) {
        console.log('⚠️ Skipping notification check - device is offline');
        return;
      }

      const userId = this.senderUserId || this.authService.authData?.userId;

      if (!userId) {
        console.warn(
          '⚠️ Cannot check notification permission: userId is missing'
        );
        return;
      }

      console.log('🔔 Checking notification permission status...');

      let permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt') {
        console.log('🔔 Requesting notification permission...');
        permStatus = await PushNotifications.requestPermissions();
      }

      const isGranted = permStatus.receive === 'granted';

      await this.fcmService.updatePermissionStatus(userId, isGranted);

      console.log(`✅ Firebase isPermission updated to: ${isGranted}`);
    } catch (error) {
      console.error(
        '❌ Error checking/updating notification permission:',
        error
      );
      // Don't throw - this is not critical
    }
  }

  private async checkNetworkBeforeAction(
    action:
      | 'pin'
      | 'unpin'
      | 'delete'
      | 'deleteGroup'
      | 'mute'
      | 'archive'
      | 'exitGroup'
      | 'exitGroups'
      | 'markRead'
      | 'markUnread'
      | 'exitCommunity'
  ): Promise<boolean> {
    // 🔥 CRITICAL: Check network status RIGHT NOW (not cached)
    const currentStatus = this.networkService.isOnline.value;

    // Update local state immediately
    this.isOffline = !currentStatus;
    this.cdr.detectChanges();

    console.log(
      `🔍 Real-time network check for "${action}": ${
        currentStatus ? 'ONLINE' : 'OFFLINE'
      }`
    );

    // If offline, show alert and return false
    if (!currentStatus) {
      await this.showOfflineAlert(action);
      return false;
    }

    return true;
  }

  /**
   * 🔥 NEW: Show offline alert with custom message
   */
  private async showOfflineAlert(
    action:
      | 'pin'
      | 'unpin'
      | 'delete'
      | 'deleteGroup'
      | 'mute'
      | 'archive'
      | 'exitGroup'
      | 'exitGroups'
      | 'markRead'
      | 'markUnread'
      | 'exitCommunity'
  ) {
    let message = '';

    switch (action) {
      case 'pin':
        message =
          'You are offline. Please connect to the internet to pin chats.';
        break;
      case 'unpin':
        message =
          'You are offline. Please connect to the internet to unpin chats.';
        break;
      case 'delete':
        message =
          'You are offline. Please connect to the internet to delete chats.';
        break;
      case 'deleteGroup':
        message =
          'You are offline. Please connect to the internet to delete this group.';
        break;
      case 'mute':
        message =
          'You are offline. Please connect to the internet to mute notifications.';
        break;
      case 'archive':
        message =
          'You are offline. Please connect to the internet to archive chats.';
        break;
      case 'exitGroup':
        message =
          'You are offline. Please connect to the internet to exit this group.';
        break;
      case 'exitGroups':
        message =
          'You are offline. Please connect to the internet to exit groups.';
        break;
      case 'markRead':
        message =
          'You are offline. Please connect to the internet to mark as read.';
        break;
      case 'markUnread':
        message =
          'You are offline. Please connect to the internet to mark as unread.';
        break;
      case 'exitCommunity':
        message =
          'You are offline. Please connect to the internet to exit community.';
        break;
    }

    const alert = await this.alertController.create({
      header: "You're Offline",
      message: message,
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
    });

    await alert.present();
  }

  /**
   * ✅ Get typing status for conversation
   */
  getTypingStatusForConv(roomId: string) {
    return this.firebaseChatService.getTypingStatusForRoom(roomId);
  }

  /**
   * ✅ Check if chat is self chat
   */
  isSelfChat(chat: any): boolean {
    if (chat.type !== 'private' || !chat.roomId || !this.senderUserId) {
      return false;
    }

    const parts = chat.roomId.split('_');
    return (
      parts.length === 2 &&
      parts[0] === this.senderUserId &&
      parts[1] === this.senderUserId
    );
  }

  /**
   * ✅ Show new chat prompt
   */
  get showNewChatPrompt(): boolean {
    return (
      !this.isLoading &&
      this.firebaseChatService.currentConversations.length === 0
    );
  }

  /**
   * ✅ Verify device on enter (ONLINE ONLY)
   */
  async verifyDeviceOnEnter(): Promise<boolean> {
    // 🔥 Skip if offline
    if (!this.networkService.isOnline.value) {
      console.log('⚠️ Skipping device verification - device is offline');
      return true;
    }

    if (!this.senderUserId) {
      console.warn('Skipping device verification: senderUserId is missing');
      return false;
    }

    try {
      const platform = Capacitor.getPlatform();
      let info: any;

      if (platform === 'web') {
        info = {
          model: navigator.userAgent.includes('Mobile')
            ? 'Mobile Web'
            : 'Desktop Web',
          operatingSystem: 'Web',
          osVersion: 'N/A',
          uuid: localStorage.getItem('device_uuid') || crypto.randomUUID(),
        };
        if (!localStorage.getItem('device_uuid')) {
          localStorage.setItem('device_uuid', info.uuid);
        }
      } else {
        info = await Device.getInfo();
      }

      let appVersion = '1.0.0';
      if (platform !== 'web') {
        try {
          const versionResult = await this.versionService.checkVersion();
          appVersion = versionResult.currentVersion || '1.0.0';
        } catch (versionErr) {
          console.warn('Version check failed:', versionErr);
        }
      } else {
        appVersion = 'web.1.0.0';
      }

      const uuid =
        localStorage.getItem('device_uuid') || info.uuid || crypto.randomUUID();
      if (!localStorage.getItem('device_uuid')) {
        localStorage.setItem('device_uuid', uuid);
      }

      const payload = {
        user_id: this.senderUserId,
        device_details: {
          device_uuid: uuid,
          device_model: info.model,
          os_name: info.operatingSystem,
          os_version: info.osVersion,
          app_version: appVersion,
        },
      };

      const res: any = await this.authService.verifyDevice(payload);

      if (res.device_mismatch) {
        const backButtonHandler = (ev: any) =>
          ev.detail.register(10000, () => {});
        document.addEventListener('ionBackButton', backButtonHandler);

        const alert = await this.alertCtrl.create({
          header: 'Logged in on another device',
          message:
            'Your account is currently active on a different device. For security reasons, please log in again to continue.',
          backdropDismiss: false,
          keyboardClose: false,
          buttons: [
            {
              text: 'OK',
              handler: () => {
                this.resetapp.resetApp();
              },
            },
          ],
        });

        await alert.present();
        alert.onDidDismiss().then(() => {
          document.removeEventListener('ionBackButton', backButtonHandler);
        });

        return false;
      }

      return true;
    } catch (err) {
      console.error('Verify Device API error:', err);
      return true; // 🔥 Allow app to continue even if verification fails
    }
  }

  /**
   * ✅ Check force logout (ONLINE ONLY)
   */
  private async checkForceLogout(): Promise<void> {
    try {
      // 🔥 Skip if offline
      if (!this.networkService.isOnline.value) {
        console.log('⚠️ Skipping force logout check - device is offline');
        return;
      }

      const uidStr = this.senderUserId || this.authService.authData?.userId;
      const uid = Number(uidStr);
      if (!uid) return;

      this.service.checkUserLogout(uid).subscribe({
        next: async (res: any) => {
          if (!res) return;
          const force = Number(res.force_logout);

          if (force === 2) {
            console.log(
              '🚫 User is banned, redirecting to banned-account page'
            );
            this.router.navigateByUrl('/banned-account', { replaceUrl: true });
            return;
          }

          if (force === 1) {
            const alert = await this.alertCtrl.create({
              header: this.translate.instant('home.logout.header'),
              message: this.translate.instant('home.logout.message'),
              backdropDismiss: false,
              buttons: [
                {
                  text: this.translate.instant('common.ok'),
                  handler: () => {
                    try {
                      this.resetapp.resetApp();
                    } catch {}
                  },
                },
              ],
            });
            await alert.present();
          }
        },
        error: (err) => {
          console.warn('Force logout check failed:', err);
        },
      });
    } catch (error) {
      console.warn('checkForceLogout error:', error);
    }
  }

  /**
   * ✅ Clear chat data
   */
  private clearChatData() {
    this.unreadSubs.forEach((sub) => sub.unsubscribe());
    this.unreadSubs = [];

    this.typingUnsubs.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {}
    });
    this.typingUnsubs.clear();

    this.chatList = [];
  }

  /**
   * ✅ Component cleanup
   */
  ngOnDestroy() {
    if (this.contactsSub) {
      this.contactsSub.unsubscribe();
      this.contactsSub = null;
    }
    // Clean up last message listeners
    this.cleanupLastMessageListeners();
    this.unreadSubs.forEach((sub) => sub.unsubscribe());
    this.unreadSubs = [];

    this.typingUnsubs.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {}
    });
    this.typingUnsubs.clear();

    try {
      this.pinUnsub?.();
    } catch {}
    this.pinUnsub = null;

    try {
      this.archiveUnsub?.();
    } catch {}
    this.archiveUnsub = null;

    if (this.conversationsSubscription) {
      this.conversationsSubscription.unsubscribe();
      this.conversationsSubscription = null;
    }

    // 🔥 NEW: Cleanup network subscription
    if (this.networkSub) {
      this.networkSub.unsubscribe();
      this.networkSub = null;
    }

    if (this.firebaseChatService._userChatsListener) {
      try {
        this.firebaseChatService._userChatsListener();
      } catch {}
    }

    if (this._convBatchSub) {
      this._convBatchSub.unsubscribe();
      this._convBatchSub = null;
    }
    if (this._convSafetyTimeout) {
      clearTimeout(this._convSafetyTimeout);
      this._convSafetyTimeout = null;
    }
    this._hideConvLoader();
  }

  // ========================================
  // 🎯 POPUP & NAVIGATION
  // ========================================

  /**
   * ✅ Navigate to user profile
   */
  goToUserAbout() {
    this.showPopup = false;

    setTimeout(async () => {
      try {
        const chat = this.selectedChat;

        if (!chat?.roomId) {
          await this.showToast('Invalid chat data', 'warning');
          return;
        }

        await this.firebaseChatService.openChat(chat);

        let receiverId: string;

        if (chat.type === 'private') {
          const parts = chat.roomId.split('_');
          receiverId =
            parts.find((p: string) => p !== this.senderUserId) ??
            parts[parts.length - 1];
        } else {
          receiverId = chat.roomId;
        }

        this.router.navigate(['/profile-screen'], {
          queryParams: {
            receiverId: receiverId,
            isGroup: chat.type === 'group',
          },
        });

        this.selectedChat = null;
        this.selectedImage = null;
      } catch (error) {
        console.error('❌ Error opening profile:', error);
        await this.showToast('Failed to open profile', 'danger');
      }
    }, 100);
  }

  /**
   * ✅ Navigate to user chat
   */
  async goToUserchat() {
    this.showPopup = false;

    setTimeout(async () => {
      try {
        const chat = this.selectedChat;

        if (!chat?.roomId) {
          await this.showToast('Invalid chat data', 'warning');
          return;
        }

        await this.firebaseChatService.openChat(chat);

        if (chat.type === 'private') {
          const parts = chat.roomId.split('_');
          const receiverId =
            parts.find((p: string) => p !== this.senderUserId) ??
            parts[parts.length - 1];
          this.router.navigate(['/chatting-screen'], {
            queryParams: { receiverId },
          });
        } else if (chat.type === 'group') {
          this.router.navigate(['/chatting-screen'], {
            queryParams: { receiverId: chat.roomId },
          });
        } else if (chat.type === 'community') {
          this.router.navigate(['/community-detail'], {
            queryParams: { receiverId: chat.roomId },
          });
        }

        this.selectedChat = null;
        this.selectedImage = null;
      } catch (error) {
        console.error('❌ Error opening chat:', error);
        await this.showToast('Failed to open chat', 'danger');
      }
    }, 100);
  }

  goToUsercall() {
    // 🔥 Check network before allowing calls
    if (this.isOffline) {
      this.showToast('Calls require internet connection', 'warning');
      return;
    }
    this.showPopup = false;
    setTimeout(() => {
      // this.router.navigate(['/calls-screen']);
    }, 100);
  }

  goToUservideocall() {
    // 🔥 Check network before allowing video calls
    if (this.isOffline) {
      this.showToast('Video calls require internet connection', 'warning');
      return;
    }
    this.showPopup = false;
    setTimeout(() => {
      // this.router.navigate(['/calling-screen']);
    }, 100);
  }

  /**
   * ✅ Open image popup
   */
  openImagePopup(chat: any) {
    if (!chat?.roomId) {
      this.showToast('Invalid chat data', 'warning');
      return;
    }

    // ✅ Guard: If blocked, stop user from viewing full image popup
    if (chat.type === 'private' && chat.theyBlocked) {
      console.warn('🚫 Cannot view profile picture: user has blocked you');
      return;
    }

    this.selectedChat = chat;
    this.selectedImage = chat.avatar || 'assets/images/user.jfif';
    this.showPopup = true;
  }

  /**
   * ✅ Open Profile DP viewer from Home modal
   * Same behaviour as UseraboutPage
   */
  openProfileFromModal() {
    const chat = this.selectedChat;
    if (!chat) return;

    // ✅ Guard: If blocked, stop user from opening full profile view
    if (chat.type === 'private' && chat.theyBlocked) {
      console.warn('🚫 Cannot view profile picture: user has blocked you');
      this.showPopup = false;
      return;
    }

    // close modal first
    this.showPopup = false;

    const imageToShow = chat.avatar || 'assets/images/user.jfif';

    let receiverId: string;
    let isGroup = false;

    if (chat.type === 'private') {
      const parts = chat.roomId.split('_');
      receiverId =
        parts.find((p: string) => p !== this.senderUserId) ??
        parts[parts.length - 1];
    } else {
      receiverId = chat.roomId;
      isGroup = chat.type === 'group';
    }

    // slight delay for smooth modal close
    setTimeout(() => {
      this.router.navigate(['/profile-dp-view'], {
        queryParams: {
          image: imageToShow,
          isGroup,
          receiverId,
        },
      });

      this.selectedChat = null;
      this.selectedImage = null;
    }, 100);
  }

  /**
   * ✅ Close image popup
   */
  closeImagePopup() {
    this.selectedImage = null;
    this.selectedChat = null;
    this.showPopup = false;
  }

  // 🔹 Handle chat row click (LINE ~850)
  onChatRowClick(chat: any, ev: Event) {
    if (this.selectedChats.length > 0) {
      this.toggleChatSelection(chat, ev);
      return;
    }
    this.openChat(chat);
  }

  // 🔹 Handle checkbox click (LINE ~860)
  onCheckboxClick(chat: any, ev: Event) {
    // CRITICAL: Stop all event propagation
    ev.stopPropagation();
    ev.preventDefault();
    ev.stopImmediatePropagation();

    // Check if chat can be selected
    if (!this.canSelectChat(chat)) {
      return;
    }

    // Toggle selection
    this.toggleChatSelection(chat);

    // CRITICAL: Force immediate UI update
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  // 🔹 Handle avatar click (LINE ~870)
  onAvatarClick(chat: any, ev: Event) {
    ev.stopPropagation();
    ev.preventDefault();
    if (this.selectedChats.length > 0) {
      this.toggleChatSelection(chat);
    } else {
      this.openImagePopup(chat);
    }
  }

  // 🔹 Check if conversation is selected (LINE ~880)
  isConvSelected(roomId: string): boolean {
    return this.selectedConversations.has(roomId);
  }

  // 🔹 Check if chat is selected (LINE ~885)
  isChatSelected(chat: any): boolean {
    if (chat.roomId) {
      return this.selectedConversations.has(chat.roomId);
    }
    return this.selectedChats.some((c: any) => this.sameItem(c, chat));
  }

  // 🔹 Get selected count (LINE ~895)
  get selectedCount(): number {
    return this.selectedChats.length;
  }

  // 🔹 Check if has selection (LINE ~900)
  get hasSelection(): boolean {
    return this.selectedChats.length > 0;
  }

  // ✅ ADD THIS NEW FUNCTION HERE (After line 985)
  /**
   * Check if a chat can be selected based on current selection rules
   * - Community selected → Only communities can be selected
   * - Private/Group selected → Only private/group can be selected
   * - Already selected items can always be deselected
   */
  canSelectChat(chat: any): boolean {
    const isCommunity = chat.type === 'community';

    // Rule 1: If nothing selected, everything is available
    if (this.selectedChats.length === 0) {
      return true;
    }

    // Rule 2: Already selected items can always be deselected
    if (this.isChatSelected(chat)) {
      return true;
    }

    // Rule 3: If community is selected, block private/group
    if (this.hasCommunitySelected()) {
      return isCommunity; // Only communities can be selected
    }

    // Rule 4: If private/group is selected, block communities
    if (this.hasNonCommunitySelected()) {
      return !isCommunity; // Only private/group can be selected
    }

    // Default: Allow selection
    return true;
  }

  // 🔹 Toggle chat selection (LINE ~905)
  toggleChatSelection(chat: any, ev?: Event) {
    if (ev) {
      ev.stopPropagation();
      ev.preventDefault();
    }

    const isCommunity = chat.type === 'community';
    const already = this.selectedChats.find((c) => this.sameItem(c, chat));

    if (isCommunity) {
      if (this.hasNonCommunitySelected()) {
        console.log(
          '❌ Cannot select community while other chats are selected'
        );
        return;
      }

      // ✅ FIXED: Proper toggle logic for communities
      if (already) {
        // Deselect community
        this.selectedChats = this.selectedChats.filter(
          (c) => !this.sameItem(c, chat)
        );
        if (chat.roomId) this.selectedConversations.delete(chat.roomId);
      } else {
        // Select community (replace previous community selection)
        const previouslySelectedCommunity = this.selectedChats.find(
          (c) => c.type === 'community'
        );

        if (previouslySelectedCommunity && previouslySelectedCommunity.roomId) {
          this.selectedConversations.delete(previouslySelectedCommunity.roomId);
        }

        // ✅ Clear and set new selection
        this.selectedChats = [chat];
        this.selectedConversations.clear();

        if (chat.roomId) {
          this.selectedConversations.add(chat.roomId);
        }
      }

      if (this.selectedChats.length === 0) this.cancelHomeLongPress();

      // ✅ Force UI update
      this.cdr.detectChanges();
      return;
    }

    // Handle non-community chats
    if (this.hasCommunitySelected()) {
      console.log('❌ Cannot select other chats while community is selected');
      return;
    }

    if (already) {
      this.selectedChats = this.selectedChats.filter(
        (c) => !this.sameItem(c, chat)
      );
      if (chat.roomId) this.selectedConversations.delete(chat.roomId);
      if (this.selectedChats.length === 0) this.cancelHomeLongPress();
    } else {
      this.selectedChats.push(chat);
      if (chat.roomId) this.selectedConversations.add(chat.roomId);
    }

    // ✅ Force UI update
    this.cdr.detectChanges();
  }

  private hasCommunitySelected(): boolean {
    return this.selectedChats.some((c) => c.type === 'community');
  }

  private hasNonCommunitySelected(): boolean {
    return this.selectedChats.some((c) => c.type !== 'community');
  }

  private sameItem(a: any, b: any): boolean {
    if (a?.roomId && b?.roomId) {
      return a.roomId === b.roomId;
    }
    return (
      a?.receiver_Id === b?.receiver_Id &&
      !!a?.group === !!b?.group &&
      !!a?.isCommunity === !!b?.isCommunity
    );
  }

  /**
   * ✅ Clear selection
   */
  clearChatSelection() {
    this.selectedChats = [];
    this.selectedConversations.clear();
    this.cancelHomeLongPress();
  }

  /**
   * ✅ Start long press
   */
  startHomeLongPress(chat: any) {
    this.cancelHomeLongPress();
    this.longPressTimer = setTimeout(() => {
      if (!this.isChatSelected(chat)) {
        this.selectedChats = [chat];
        if (chat.roomId) {
          this.selectedConversations.clear();
          this.selectedConversations.add(chat.roomId);
        }
      }
    }, 500);
  }

  /**
   * ✅ Cancel long press
   */
  cancelHomeLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /**
   * ✅ Selection metadata
   */
  get selectionMeta() {
    const sel = this.selectedChats || [];
    const count = sel.length;

    const includesCommunity = sel.some((c) => c.type === 'community');
    const includesGroup = sel.some((c) => c.type === 'group');
    const includesPrivate = sel.some((c) => c.type === 'private');

    const isSingleSelection = count === 1;
    const singleChat = isSingleSelection ? sel[0] : null;
    const isChatPinned = singleChat?.isPinned === true;

    const isSinglePrivate = isSingleSelection && singleChat?.type === 'private';
    const isSingleGroup = isSingleSelection && singleChat?.type === 'group';
    // ✅ NEW: Add community selection types
    const isSingleCommunity =
      isSingleSelection && singleChat?.type === 'community';

    const isMultiPrivateOnly =
      count > 1 &&
      includesPrivate &&
      !includesGroup &&
      !includesCommunity &&
      sel.every((c) => c.type === 'private');

    const isMultiGroupsOnly =
      count > 1 &&
      includesGroup &&
      !includesPrivate &&
      !includesCommunity &&
      sel.every((c) => c.type === 'group');

    const isMixedPrivateAndGroups =
      count > 1 && includesPrivate && includesGroup && !includesCommunity;

    return {
      count,
      includesCommunity,
      includesGroup,
      includesPrivate,
      isSinglePrivatePinned: isSinglePrivate && isChatPinned,
      isSinglePrivateUnpinned: isSinglePrivate && !isChatPinned,
      isSingleGroupPinned: isSingleGroup && isChatPinned,
      isSingleGroupUnpinned: isSingleGroup && !isChatPinned,
      isSingleCommunityPinned: isSingleCommunity && isChatPinned,
      isSingleCommunityUnpinned: isSingleCommunity && !isChatPinned,
      isMultiPrivateOnly,
      isMultiGroupsOnly,
      isMixedPrivateAndGroups,
      // Legacy properties
      isSingleUser: isSinglePrivate && !isChatPinned,
      isSinglePinned: (isSinglePrivate || isSingleGroup) && isChatPinned,
      isMultiUsersOnly: isMultiPrivateOnly,
    };
  }

  // ========================================
  // 🎯 SELECTION ACTIONS
  // ========================================

  /**
   * ✅ Pin selected chats
   */
  async onPinSelected() {
    if (!(await this.checkNetworkBeforeAction('pin'))) {
      return;
    }
    const userId = this.senderUserId || this.authService.authData?.userId || '';
    if (!userId) {
      this.clearChatSelection();
      return;
    }

    const result = await this.firebaseChatService.setPinConversation(
      this.selectedChats.map((c) => c.roomId),
      true
    );

    if (!result.success && result.message) {
      const alert = await this.alertCtrl.create({
        header: 'Cannot Pin',
        message: result.message,
        buttons: ['OK'],
      });
      await alert.present();
    }

    this.clearChatSelection();
  }

  /**
   * ✅ Unpin selected chats
   */
  async onUnpinSelected() {
    if (!(await this.checkNetworkBeforeAction('unpin'))) {
      return;
    }
    const userId = this.senderUserId || this.authService.authData?.userId || '';
    if (!userId) {
      this.clearChatSelection();
      return;
    }

    await this.firebaseChatService.setPinConversation(
      this.selectedChats.map((c) => c.roomId),
      false
    );

    this.clearChatSelection();
  }

  /**
   * ✅ Delete multiple chats
   */
  async deleteMultipleChats() {
    if (!(await this.checkNetworkBeforeAction('delete'))) {
      return;
    }
    if (!this.selectedChats || this.selectedChats.length === 0) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Delete Chats',
      message: 'Are you sure you want to delete selected chats?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.firebaseChatService.deleteChats(
                this.selectedChats.map((c) => c.roomId)
              );
              this.clearChatSelection();
            } catch (error) {
              console.error('Error deleting chats:', error);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * ✅ Delete chats for me
   */
  private async deleteChatsForMe(chats: any[]) {
    try {
      const userId = this.senderUserId;
      if (!userId) return;

      for (const chat of chats) {
        const roomId = chat.group
          ? chat.receiver_Id
          : this.getRoomId(userId, chat.receiver_Id);

        await this.firebaseChatService.deleteChatForUser(roomId);

        this.chatList = this.chatList.filter((c) => {
          if (chat.group && c.group) return c.receiver_Id !== chat.receiver_Id;
          if (chat.isCommunity && c.isCommunity)
            return c.receiver_Id !== chat.receiver_Id;
          if (!chat.group && !chat.isCommunity && !c.group && !c.isCommunity) {
            return c.receiver_Id !== chat.receiver_Id;
          }
          return true;
        });

        this.stopTypingListenerForChat(chat);
        const unreadSub = this.unreadSubs.find(() => true);
        if (unreadSub) {
          unreadSub.unsubscribe();
          this.unreadSubs = this.unreadSubs.filter((s) => s !== unreadSub);
        }
      }

      this.clearChatSelection();
    } catch (error) {
      console.error('❌ Error deleting chats:', error);
    }
  }

  /**
   * ✅ Mute selected
   */
  async onMuteSelected() {
    if (!(await this.checkNetworkBeforeAction('mute'))) {
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Mute notification',
      message: 'Work in progress',
      buttons: ['OK'],
    });
    await alert.present();
    this.clearChatSelection();
  }

  /**
   * ✅ Archive selected
   */
  async onArchievedSelected() {
    if (!(await this.checkNetworkBeforeAction('archive'))) {
      return;
    }

    try {
      const userId =
        this.senderUserId || this.authService.authData?.userId || '';

      if (!userId) {
        this.clearChatSelection();

        return;
      }

      const roomIds = this.selectedChats.map((c) => c.roomId);

      // ✅ Archive chats

      await this.firebaseChatService.setArchiveConversation(roomIds);

      // ✅ Mute each archived chat

      for (const roomId of roomIds) {
        await this.firebaseChatService.muteChat(roomId, userId);
      }

      this.clearChatSelection();
    } catch (error) {
      console.error('❌ Error archiving chats:', error);
    }
  }
  get lockedCount(): number {
    return Object.values(this.lockedMap).filter((v) => v?.isLocked).length;
  }

  get archivedCount(): number {
    return Object.values(this.archivedMap).filter((v) => v?.isArchived).length;
  }

  openLockedChats() {
    this.router.navigate(['/locked-chats']);
  }

  openArchived() {
    this.router.navigate(['/archieved-screen']);
  }


  async onMoreSelected(ev: any) {
    const sel = this.selectedChats || [];

    const users = sel.filter((c) => c.type === 'private');
    const groups = sel.filter((c) => c.type === 'group');
    const communities = sel.filter((c) => c.type === 'community');

    const isSingleUser =
      users.length === 1 && groups.length === 0 && communities.length === 0;
    const isMultiUsers =
      users.length > 1 && groups.length === 0 && communities.length === 0;
    const isSingleGroup =
      groups.length === 1 && users.length === 0 && communities.length === 0;
    const isMultiGroups =
      groups.length > 1 && users.length === 0 && communities.length === 0;
    const isSingleCommunity =
      communities.length === 1 && users.length === 0 && groups.length === 0;
    const isMixedChats =
      users.length > 0 && groups.length > 0 && communities.length === 0;

    const unreadOf = (x: any) => Number(x?.unreadCount || 0) > 0;
    const single = sel.length === 1 ? sel[0] : null;
    const canMarkReadSingle = !!single && unreadOf(single);
    const canMarkUnreadSingle = !!single && !unreadOf(single);
    const anyUnreadSelected = sel.some(unreadOf);
    const allSelectedRead = sel.length > 0 && sel.every((x) => !unreadOf(x));
    const canMarkReadMulti = !single && anyUnreadSelected;
    const canMarkUnreadMulti = !single && allSelectedRead;

    let isCurrentUserMember = false;
    let canDeleteGroup = false;

    if (isSingleGroup && groups[0]) {
      const selectedGroup = groups[0];
      const currentUserId = this.senderUserId;
      if (selectedGroup.members && Array.isArray(selectedGroup.members)) {
        isCurrentUserMember = selectedGroup.members.includes(currentUserId);
        canDeleteGroup = !isCurrentUserMember;
      }
    }

    let isCommunityAdmin = false;
    let isCommunityMember = false;

    if (isSingleCommunity && communities[0]) {
      const selectedCommunity = communities[0];
      const currentUserId = this.senderUserId;
      if (
        selectedCommunity.adminIds &&
        Array.isArray(selectedCommunity.adminIds)
      ) {
        isCommunityAdmin = selectedCommunity.adminIds.includes(currentUserId);
      }
      if (
        selectedCommunity.members &&
        Array.isArray(selectedCommunity.members)
      ) {
        isCommunityMember = selectedCommunity.members.includes(currentUserId);
      }
    }

    // ★ Check if single selected chat is already a favourite
    const isFavourite = single
      ? this.chatListFilterService.isFavourite(single.roomId)
      : false;

    const pop = await this.popoverCtrl.create({
      component: MenuHomePopoverComponent,
      event: ev,
      translucent: true,
      componentProps: {
        canLock: true,
        allSelected: this.areAllVisibleSelected(),
        isAllSelectedMode: this.areAllVisibleSelected(),
        isSingleUser,
        isMultiUsers,
        isSingleGroup,
        isMultiGroups,
        isMixedChats,
        isSingleCommunity,
        canMarkReadSingle,
        canMarkUnreadSingle,
        canMarkReadMulti,
        canMarkUnreadMulti,
        isCurrentUserMember,
        canDeleteGroup,
        isCommunityAdmin,
        isCommunityMember,
        isFavourite,
      },
    });
    await pop.present();

    const { data } = await pop.onDidDismiss();
    if (!data?.action) return;

    const actionHandlers: Record<string, () => Promise<void>> = {
      viewContact: () => this.openSelectedContactProfile(),
      groupInfo: () => this.openSelectedGroupInfo(),
      markUnread: () => this.markAsUnread(),
      markRead: () => this.markRoomAsRead(),
      selectAll: async () => this.selectAllVisible(),
      exitGroup: () => this.confirmAndExitSingleSelectedGroup(),
      exitGroups: () => this.confirmAndExitMultipleSelectedGroups(),
      deleteGroup: () => this.confirmAndDeleteGroup(),
      communityInfo: () => this.goToCommunityInfo(),
      exitCommunity: () => this.confirmAndExitCommunity(),
      block: async () => {
        console.log('Block user action');
      },
      addToFavourite: async () => {
        const chatsToAdd = this.selectedChats.filter(
          (c) => c?.roomId && !this.chatListFilterService.isFavourite(c.roomId)
        );
        for (const chat of chatsToAdd) {
          await this.chatListFilterService.addToFavourites(chat.roomId);
        }
        await this.showToast(
          `${chatsToAdd.length} chat(s) added to Favourites`,
          'primary'
        );
        this.clearChatSelection();
        this.cdr.detectChanges();
      },

      removeFromFavourite: async () => {
        const chatsToRemove = this.selectedChats.filter(
          (c) => c?.roomId && this.chatListFilterService.isFavourite(c.roomId)
        );
        for (const chat of chatsToRemove) {
          await this.chatListFilterService.removeFromFavourites(chat.roomId);
        }
        await this.showToast('Removed from Favourites', 'primary');
        this.clearChatSelection();
        this.cdr.detectChanges();
      },
      addToList: async () => {
        await this.showAddToListSheet();
      },
    };

    const handler = actionHandlers[data.action];
    if (handler) {
      await handler();
    }
  }

  /**
   * ✅ Confirm and delete group
   */
  private async confirmAndDeleteGroup(): Promise<void> {
    if (!(await this.checkNetworkBeforeAction('deleteGroup'))) {
      return;
    }
    const groups = this.selectedChats.filter((c) => c.type === 'group');
    const group = groups[0];

    if (!group) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete Group',
      message: `Are you sure you want to delete "${group.title}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          cssClass: 'danger-button',
          handler: async () => {
            try {
              await this.firebaseChatService.deleteGroup(group.roomId);

              this.chatList = this.chatList.filter(
                (c) => !(c.receiver_Id === group.receiver_Id && c.group)
              );

              this.conversations = this.conversations.filter(
                (c) => c.roomId !== group.roomId
              );

              this.stopTypingListenerForChat(group);
              this.clearChatSelection();

              await this.showToast('Group deleted successfully', 'primary');
            } catch (error) {
              console.error('Error deleting group:', error);
              await this.showToast('Failed to delete group', 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * ✅ Navigate to community info page
   */
  private async goToCommunityInfo(): Promise<void> {
    const communities = this.selectedChats.filter(
      (c) => c.type === 'community'
    );
    const community = communities[0];

    if (!community) {
      await this.showToast('No community selected', 'warning');
      return;
    }

    await this.firebaseChatService.openChat(community);

    this.router.navigate(['/community-info'], {
      queryParams: {
        communityId: community.roomId,
      },
    });

    this.clearChatSelection();
  }

  /**
   * ✅ Confirm and exit community
   */
  private async confirmAndExitCommunity(): Promise<void> {
    if (!(await this.checkNetworkBeforeAction('exitCommunity'))) {
      return;
    }

    const communities = this.selectedChats.filter(
      (c) => c.type === 'community'
    );
    const community = communities[0];

    if (!community) {
      await this.showToast('No community selected', 'warning');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Exit Community',
      message: `Are you sure you want to exit "${community.title}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Exit',
          cssClass: 'danger-button',
          handler: async () => {
            try {
              const userId =
                this.senderUserId || this.authService.authData?.userId || '';

              if (!userId) {
                await this.showToast('User ID not found', 'danger');
                return;
              }

              // Call the Firebase service method
              const result = await this.firebaseChatService.exitCommunity(
                community.roomId,
                userId
              );

              if (result.success) {
                // Remove from local chat list
                this.chatList = this.chatList.filter(
                  (c: any) =>
                    !(c.receiver_Id === community.receiver_Id && c.isCommunity)
                );

                // Remove from conversations
                this.conversations = this.conversations.filter(
                  (c) => c.roomId !== community.roomId
                );

                // Stop typing listener
                this.stopTypingListenerForChat(community);

                // Clear selection
                this.clearChatSelection();

                // Show success message
                await this.showToast(result.message, 'primary');
              } else {
                // Show error message
                await this.showToast(result.message, 'danger');
              }
            } catch (error) {
              console.error('❌ Error exiting community:', error);
              await this.showToast(
                'Failed to exit community. Please try again.',
                'danger'
              );
            }
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * ✅ Open selected contact profile
   */
  private async openSelectedContactProfile(): Promise<void> {
    const chat = this.selectedChats[0];
    await this.firebaseChatService.openChat(chat);

    if (!chat) return;

    const parts = chat.roomId.split('_');
    const receiverId =
      parts.find((p: string | null) => p !== this.senderUserId) ??
      parts[parts.length - 1];

    this.router.navigate(['/profile-screen'], { queryParams: { receiverId } });
    this.clearChatSelection();
  }

  /**
   * ✅ Open selected group info
   */
  private async openSelectedGroupInfo(): Promise<void> {
    const chat = this.selectedChats[0];
    await this.firebaseChatService.openChat(chat);

    if (!chat) return;

    this.router.navigate(['/profile-screen'], {
      queryParams: {
        receiverId: chat.roomId,
        isGroup: chat.type === 'group',
      },
    });
    this.clearChatSelection();
  }

  private get visibleNonCommunityChats(): any[] {
    return this.filteredChats.filter((c) => c.type !== 'community');
  }

  private areAllVisibleSelected(): boolean {
    const visible = this.visibleNonCommunityChats;
    if (visible.length === 0) return false;

    const selectedRoomIds = new Set(this.selectedChats.map((c) => c.roomId));
    return visible.every((c) => selectedRoomIds.has(c.roomId));
  }

  private selectAllVisible(): void {
    if (this.areAllVisibleSelected()) {
      this.clearChatSelection();
      return;
    }

    const nonCommunityChats = this.visibleNonCommunityChats;

    this.selectedChats = [];
    this.selectedConversations.clear();

    nonCommunityChats.forEach((chat) => {
      this.selectedChats.push(chat);
      if (chat.roomId) {
        this.selectedConversations.add(chat.roomId);
      }
    });

    console.log(
      `✅ Selected ${this.selectedChats.length} chats (excluding communities)`
    );
  }

  /**
   * ✅ Exit single group
   */
  private async confirmAndExitSingleSelectedGroup(): Promise<void> {
    if (!(await this.checkNetworkBeforeAction('exitGroup'))) {
      return;
    }
    const sel = this.selectedChats.filter((c) => c.type == 'group');
    const chat = sel[0];
    if (!chat) return;

    const alert = await this.alertCtrl.create({
      header: 'Exit Group',
      message: `Are you sure you want to exit "${chat.title}"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Exit',
          handler: async () => {
            await this.exitGroup(chat.roomId);

            this.chatList = this.chatList.filter(
              (c) =>
                !(
                  c.receiver_Id === chat.receiver_Id &&
                  c.group &&
                  !c.isCommunity
                )
            );

            this.stopTypingListenerForChat(chat);
            this.clearChatSelection();

            const t = await this.alertCtrl.create({
              header: 'Exited',
              message: 'You exited the group.',
              buttons: ['OK'],
            });
            await t.present();
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * ✅ Exit multiple groups
   */
  private async confirmAndExitMultipleSelectedGroups(): Promise<void> {
    if (!(await this.checkNetworkBeforeAction('exitGroups'))) {
      return;
    }
    const groups = this.selectedChats.filter((c) => c.group && !c.isCommunity);
    if (groups.length === 0) return;

    const alert = await this.alertCtrl.create({
      header: 'Exit Groups',
      message: `Exit ${groups.length} selected groups?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Exit',
          handler: async () => {
            let success = 0,
              fail = 0;

            for (const g of groups) {
              try {
                await this.exitGroup(g.receiver_Id);

                this.chatList = this.chatList.filter(
                  (c) =>
                    !(
                      c.receiver_Id === g.receiver_Id &&
                      c.group &&
                      !c.isCommunity
                    )
                );

                this.stopTypingListenerForChat(g);
                success++;
              } catch (e) {
                console.warn('exit group failed:', g.receiver_Id, e);
                fail++;
              }
            }

            this.clearChatSelection();

            const msg =
              fail === 0
                ? `Exited ${success} groups`
                : `Exited ${success} groups, ${fail} failed`;
            const done = await this.alertCtrl.create({
              header: 'Done',
              message: msg,
              buttons: ['OK'],
            });
            await done.present();
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * ✅ Exit group core logic
   */
  private async exitGroup(groupId: string): Promise<void> {
    const userId = this.senderUserId || this.authService.authData?.userId || '';
    if (!groupId || !userId) throw new Error('Missing groupId/userId');

    const memberPath = `groups/${groupId}/members/${userId}`;
    const memberSnap = await get(rtdbRef(this.db, memberPath));

    if (!memberSnap.exists()) return;

    const myMember = memberSnap.val();
    const wasAdmin = String(myMember?.role || '').toLowerCase() === 'admin';

    // Backend handles member removal, pastmembers migration, and admin reassignment
    await this.chatBackendSocket.emitWithAck('removeGroupMember', { groupId, targetUserId: userId });

    try {
      await this.firebaseChatService.resetUnreadCount(groupId);
    } catch (e) {
      console.warn('resetUnreadCount failed:', e);
    }
  }

  /**
   * ✅ Mark room as read
   */
  async markRoomAsRead() {
    if (!(await this.checkNetworkBeforeAction('markRead'))) {
      return;
    }
    const me = this.senderUserId || this.authService.authData?.userId || '';
    if (!me) return;

    const selected = this.selectedChats || [];
    const roomIds = selected.filter((c) => !c.isCommunity).map((c) => c.roomId);

    selected.forEach((c) => {
      c.unreadCount = 0;
      c.unread = false;
    });

    for (const roomId of roomIds) {
      try {
        const metaPath = `userchats/${me}/${roomId}`;
        const meta = await this.firebaseChatService.fetchOnce(metaPath);

        const unreadCount = Number((meta && meta.unreadCount) || 0);
        if (!unreadCount) continue;

        const messagesSnap = await this.firebaseChatService.getMessagesSnap(
          roomId,
          unreadCount
        );
        const messagesObj = messagesSnap.exists() ? messagesSnap.val() : {};

        const messages = Object.keys(messagesObj)
          .map((k) => ({
            ...messagesObj[k],
            msgId: k,
            timestamp: messagesObj[k].timestamp ?? 0,
          }))
          .sort((a, b) => a.timestamp - b.timestamp);

        for (const m of messages) {
          if (m.msgId) {
            await this.firebaseChatService.markAsRead(
              m.msgId,
              roomId as string
            );
          }
        }

        this.firebaseChatService.setUnreadCount(roomId);
      } catch (err) {
        console.error(`Error processing room ${roomId}`, err);
      }
    }

    this.clearChatSelection();
  }

  /**
   * ✅ Mark as unread
   */
  async markAsUnread() {
    if (!(await this.checkNetworkBeforeAction('markUnread'))) {
      return;
    }
    const me = this.senderUserId || this.authService.authData?.userId || '';
    if (!me) return;

    const roomIds = (this.selectedChats || [])
      .filter((c) => !c.isCommunity)
      .map((c) => c.roomId);

    if (roomIds.length === 0) return;

    for (const roomId of roomIds) {
      await this.firebaseChatService.markUnreadChat(roomId, 1);
    }

    this.clearChatSelection();
  }

  // ========================================
  // 🎯 CHAT OPERATIONS
  // ========================================

  /**
   * ✅ Get chat avatar URL
   */
  getChatAvatarUrl(chat: any): string | null {
    const id = chat.group ? chat.receiver_Id : chat.receiver_Id;
    if (id && this.avatarErrorIds.has(String(id))) return null;

    const url = chat.avatar;
    return url && String(url).trim() ? url : null;
  }

  /**
   * ✅ Get chat alt text
   */
  getChatAlt(chat: any): string {
    const name = chat.group ? chat.group_name || chat.name : chat.name;
    return name || this.translate.instant('home.alt.profile');
  }

  /**
   * ✅ Get chat initial
   */
  getChatInitial(chat: any): string {
    const name = (chat.group ? chat.group_name || chat.name : chat.name) || '';
    const letter = name.trim().charAt(0);
    return letter ? letter.toUpperCase() : '?';
  }

  /**
   * ✅ Handle avatar error
   */
  onAvatarError(chat: any): void {
    const id = chat.group ? chat.receiver_Id : chat.receiver_Id;
    if (id) this.avatarErrorIds.add(String(id));
  }

  /**
   * ✅ User rooms observable
   */
  userRooms(): Observable<string[]> {
    return new Observable((observer) => {
      const chatsRef = rtdbRef(getDatabase(), 'roomIds');

      const unsub = rtdbOnValue(chatsRef, (snapshot: any) => {
        const data = snapshot.val();
        observer.next(!!data ? Object.keys(data) : []);
      });

      return {
        unsubscribe() {
          try {
            unsub();
          } catch (e) {}
        },
      };
    });
  }

  get isSelectionMode(): boolean {
    return this.selectedChats.length > 0;
  }

  private trackRouteChanges() {
    this.versionService.checkAndNotify();
  }

  private mediaPreviewLabels: Record<string, string> = {
    image: '📷 Photo',
    video: '🎥 Video',
    audio: '🎵 Audio',
    file: '📎 Attachment',
    document: '📎 Document',
    contact: '👤 Contact',
    location: '📍 Location',
  };

  /**
   * ✅ Get preview text
   */
  private truncatePreview(text: string | undefined | null, max = 35): string {
    if (!text) return '';
    const s = String(text).trim();
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
  }

  getPreviewText(chat: any): string {
    try {
      const type = (chat?.lastMessageType || '').toString().toLowerCase();

      if (type && this.mediaPreviewLabels[type]) {
        return this.mediaPreviewLabels[type];
      }

      const lm = chat?.lastMessage;
      if (lm && typeof lm === 'string') {
        // ★ Invite link checks — URL check se PEHLE
        if (lm.includes('ekmessenger.com/join/c_') || lm.includes('/join/c_')) {
          return '🔗 Community Invite Link';
        }
        if (
          lm.includes('ekmessenger.com/join/comm_') ||
          lm.includes('/join/comm_')
        ) {
          return '🔗 Community Invite Link';
        }
        if (
          lm.includes('ekmessenger.com/join/group_') ||
          lm.includes('/join/group_')
        ) {
          return '🔗 Group Invite Link';
        }
        if (
          lm.includes('ekmessenger.com/join/channel_') ||
          lm.includes('/join/channel_')
        ) {
          return '🔗 Channel Invite Link';
        }
        if (lm.includes('ekmessenger.com/join/')) {
          return '🔗 Invite Link';
        }

        // ★ Generic URL / media check — invite checks ke BAAD
        if (/^(https?:\/\/)|mediaId|data:image\/|^\/?uploads\//i.test(lm)) {
          return this.mediaPreviewLabels['file'];
        }
      }

      return this.truncatePreview(lm ?? '');
    } catch (err) {
      console.warn('getPreviewText error', err);
      return '';
    }
  }

  /**
   * ✅ Format timestamp
   */
  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } else if (isYesterday) {
      return this.translate.instant('home.time.yesterday');
    } else if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * ✅ Get timestamp
   */
  getTimeStamp(lastMessageAt: string | Date | undefined): string {
    if (!lastMessageAt) return '';

    const date = new Date(lastMessageAt);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } else if (isYesterday) {
      return this.translate.instant('home.time.yesterday');
    } else if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    } else {
      return date.toLocaleDateString();
    }
  }

  // ✅ Add this method to your component
  // handler function to resolve contact names
  private resolveContactNamesInPlace(): void {
    const deviceContacts = this.firebaseChatService.currentDeviceContacts || [];
    const platformUsers = this.firebaseChatService.currentUsers || [];

    // ✅ Only need platformUsers to resolve names - deviceContacts is always empty on mobile
    if (!platformUsers || platformUsers.length === 0) {
      console.log('⚠️ No platform users, skipping name resolution');
      return;
    }

    // ✅ Also skip if no conversations to resolve
    if (!this.conversations || this.conversations.length === 0) {
      console.log('⚠️ No conversations, skipping name resolution');
      return;
    }

    let updatedCount = 0;
    const senderId = this.authService.authData?.userId || '';

    this.conversations.forEach((chat) => {
      if (chat.type === 'private') {
        // ✅ receiverId correctly extracted here
        const parts = (chat.roomId || '').split('_');
        const receiverId = parts.find((p: string) => p !== senderId);

        let bestName: string | undefined;
        let bestPriority = 0;

        // Priority 3: Match by userId → device_contact_name
        if (receiverId) {
          const pf = platformUsers.find(
            (u: any) => String(u.userId) === String(receiverId)
          );
          if (pf?.device_contact_name) {
            bestName = pf.device_contact_name;
            bestPriority = 3;
          }
        }

        // Priority 2: Match by phone from device contacts (only if available)
        if (bestPriority < 2 && deviceContacts.length > 0) {
          const phoneNumber = chat.phoneNumber || chat.title;
          if (phoneNumber) {
            const last10 = String(phoneNumber).replace(/\D/g, '').slice(-10);
            if (last10.length === 10) {
              const byPhone = deviceContacts.find((dc: any) => {
                const dcPhone = dc.phoneNumber?.replace(/\D/g, '')?.slice(-10);
                return dcPhone === last10;
              });
              if (byPhone?.username) {
                bestName = byPhone.username;
                bestPriority = 2;
              }
            }
          }
        }

        // Apply best name found
        const currentTitle = chat.title || '';
        if (bestName && bestName !== currentTitle) {
          chat.title = bestName;
          updatedCount++;
        }
      }

      if (
        (chat.type === 'group' || chat.roomId?.startsWith('group_')) &&
        (!chat.title || chat.title.trim() === '')
      ) {
        chat.title = chat.roomId.replace('group_', 'Group ') || 'Unnamed Group';
        updatedCount++;
      }

      // Communities with blank titles (also catches community roomIds misfiled as 'private')
      if (
        (chat.type === 'community' || chat.roomId?.startsWith('community_')) &&
        (!chat.title || chat.title.trim() === '')
      ) {
        chat.title =
          chat.roomId.replace('community_', 'Community ') ||
          'Unnamed Community';
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      console.log(`✅ Resolved ${updatedCount} contact names in place`);
      this.cdr.detectChanges();
    }
  }

  /**
   * ✅ NEW: Resolve block status for all private chats
   * Checks if current user is blocked by the receiver via BACKEND
   */
  private async resolveBlockStatusInPlace(): Promise<void> {
    if (!this.conversations || this.conversations.length === 0) return;

    const currentUserId = this.authService.authData?.userId;
    if (!currentUserId) return;

    let updatedCount = 0;
    const receiverIdsToFetch = new Set<string>();

    for (const chat of this.conversations) {
      if (chat.type === 'private' && chat.roomId && !chat.isSelfChat) {
        const parts = chat.roomId.split('_');
        const receiverId = parts.find((p) => p !== currentUserId);
        if (receiverId) receiverIdsToFetch.add(receiverId);
      }
    }

    if (receiverIdsToFetch.size === 0) return;

    try {
      const { blockMap } = await this.chatBackendSocket.checkBlockStatuses({
         receiverIds: Array.from(receiverIdsToFetch)
      });
      
      for (const chat of this.conversations) {
        if (chat.type === 'private' && chat.roomId && !chat.isSelfChat) {
          const parts = chat.roomId.split('_');
          const receiverId = parts.find((p) => p !== currentUserId);
          if (receiverId && blockMap[receiverId] !== undefined) {
             const isBlocked = blockMap[receiverId];
             if (chat.theyBlocked !== isBlocked) {
               chat.theyBlocked = isBlocked;
               updatedCount++;
             }
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Error resolving block statuses:', err);
    }

    if (updatedCount > 0) {
      console.log(`✅ Resolved block status for ${updatedCount} chats via backend`);
      this.cdr.detectChanges();
    }
  }

  // final updation along with autoselection resolved with contact names
  // get filteredChats() {
  //   let filtered = this.conversations;

  //   // console.log(
  //   //   '📊 All chat data:',
  //   //   filtered.map((c) => ({
  //   //     roomId: c.roomId,
  //   //     title: c.title || 'NO_TITLE',
  //   //     phoneNumber: c.phoneNumber || 'NO_PHONE',
  //   //     type: c.type,
  //   //   }))
  //   // );

  //   // Apply filters
  //   if (this.selectedFilter === 'read') {
  //     filtered = filtered.filter((chat) => chat.unreadCount === 0);
  //   } else if (this.selectedFilter === 'unread') {
  //     filtered = filtered.filter((chat) => (chat.unreadCount as number) > 0);
  //   } else if (this.selectedFilter === 'groups') {
  //     filtered = filtered.filter((chat) => chat.type === 'group');
  //   }

  //   // Apply search filter
  //   if (this.searchText.trim() !== '') {
  //     const q = this.searchText.toLowerCase();
  //     filtered = filtered.filter((chat) =>
  //       (chat.title || '').toLowerCase().includes(q)
  //     );
  //   }

  //   // Sort pinned first, then by time
  //   return [...filtered].sort((a: any, b: any) => {
  //     const aPinned = a.isPinned ? 1 : 0;
  //     const bPinned = b.isPinned ? 1 : 0;

  //     if (aPinned === bPinned) {
  //       if (aPinned === 1) {
  //         const pinnedAtA = Number(a.pinnedAt || 0);
  //         const pinnedAtB = Number(b.pinnedAt || 0);
  //         return pinnedAtB - pinnedAtA;
  //       } else {
  //         const timeA = a.lastMessageAt
  //           ? new Date(a.lastMessageAt).getTime()
  //           : 0;
  //         const timeB = b.lastMessageAt
  //           ? new Date(b.lastMessageAt).getTime()
  //           : 0;
  //         return timeB - timeA;
  //       }
  //     }

  //     return bPinned - aPinned;
  //   });
  // }

  get filteredChats() {
    let filtered = this.conversations as any[];

    // ★ NEW: List / Favourite filter (highest priority, overrides selectedFilter)
    if (this.activeListFilterId === 'favourites') {
      const favIds = this.chatListFilterService.currentFavouriteIds;
      filtered = filtered.filter((chat) => favIds.includes(chat.roomId));
    } else if (this.activeListFilterId) {
      const list = this.chatListFilterService.currentLists.find(
        (l) => l.listId === this.activeListFilterId
      );
      filtered = filtered.filter(
        (chat) => list?.roomIds.includes(chat.roomId) ?? false
      );
    }

    // ── Existing filters (UNCHANGED) ──────────────────────────
    if (this.selectedFilter === 'read') {
      filtered = filtered.filter((chat: any) => chat.unreadCount === 0);
    } else if (this.selectedFilter === 'unread') {
      filtered = filtered.filter(
        (chat: any) => (chat.unreadCount as number) > 0
      );
    } else if (this.selectedFilter === 'groups') {
      filtered = filtered.filter((chat: any) => chat.type === 'group');
    }

    if (this.searchText.trim() !== '') {
      const q = this.searchText.toLowerCase();
      filtered = filtered.filter((chat: any) =>
        (chat.title || '').toLowerCase().includes(q)
      );
    }

    // ── Existing sort (UNCHANGED) ──────────────────────────────
    return [...filtered].sort((a: any, b: any) => {
      const aPinned = a.isPinned ? 1 : 0;
      const bPinned = b.isPinned ? 1 : 0;

      if (aPinned === bPinned) {
        if (aPinned === 1) {
          return Number(b.pinnedAt || 0) - Number(a.pinnedAt || 0);
        } else {
          const timeA = a.lastMessageAt
            ? new Date(a.lastMessageAt).getTime()
            : 0;
          const timeB = b.lastMessageAt
            ? new Date(b.lastMessageAt).getTime()
            : 0;
          return timeB - timeA;
        }
      }
      return bPinned - aPinned;
    });
  }

  get pinnedChatsCount(): number {
    return this.conversations.filter((c) => c.isPinned).length;
  }

  get canPinMore(): boolean {
    return this.pinnedChatsCount < 3;
  }

  get remainingPinSlots(): number {
    return Math.max(0, 3 - this.pinnedChatsCount);
  }

  get totalUnreadCount(): number {
    return this.conversations.reduce(
      (sum, chat) => sum + ((chat?.unreadCount || 0) > 0 ? 1 : 0),
      0
    );
  }

  setFilter(filter: string) {
    this.selectedFilter = filter;
    this.activeListFilterId = null;
  }

  setListFilter(filterId: string | null) {
    this.activeListFilterId = filterId;
    this.selectedFilter = 'all';
  }

  prefetchConversation(chat: any) {
    // Debounce to avoid excessive prefetching
    if (this.prefetchTimeout) {
      clearTimeout(this.prefetchTimeout);
    }

    this.prefetchTimeout = setTimeout(async () => {
      if (this.prefetchedConversations.has(chat.roomId)) return;

      try {
        // Prefetch basic data only
        const prefetchData = {
          roomId: chat.roomId,
          type: chat.type,
          title: chat.title,
          members: chat.members,
          cachedAt: Date.now(),
        };

        this.prefetchedConversations.set(chat.roomId, prefetchData);
        console.log(`✅ Prefetched conversation: ${chat.roomId}`);
      } catch (error) {
        console.warn('Prefetch failed:', error);
      }
    }, 300); // Wait 300ms before prefetching
  }

  /**
   * ✅ Clear prefetch timeout when mouse/touch leaves
   */
  cancelPrefetch() {
    if (this.prefetchTimeout) {
      clearTimeout(this.prefetchTimeout);
      this.prefetchTimeout = null;
    }
  }

  /**
   * ✅ OPTIMIZED: Instant chat opening with background data loading
   */
  async openChat(chat: any) {
    try {
      const prefetched = this.prefetchedConversations.get(chat.roomId);

      // Call openChat but race it with 50ms timeout
      const openChatPromise = this.firebaseChatService.openChat(
        prefetched || chat
      );

      // Wait max 50ms, then navigate
      await Promise.race([
        openChatPromise,
        new Promise((resolve) => setTimeout(resolve, 50)),
      ]);

      // Navigate immediately
      this.navigateToChat(chat);

      // Continue loading in background
      openChatPromise.catch((err) => {
        console.error('Background chat loading error:', err);
      });
    } catch (error) {
      console.error('❌ Error opening chat:', error);
      await this.showToast('Failed to open chat', 'danger');
    }
  }

  /**
   * 🔥 Instant navigation (no await)
   */
  private navigateToChat(chat: any) {
    // ✅ FIX: Derive effective type from roomId prefix as safety guard
    // This handles cases where meta.type was missing in Firebase and the
    // conversation was incorrectly stored as 'private' during batch fetch.
    let effectiveType = chat.type as string;
    if (chat.roomId?.startsWith('group_')) {
      effectiveType = 'group';
    } else if (chat.roomId?.startsWith('community_')) {
      effectiveType = 'community';
    }

    const routes: Record<string, string> = {
      private: '/chatting-screen',
      community: '/community-detail',
      group: '/chatting-screen',
    };

    const route = routes[effectiveType];
    if (!route) {
      console.error('Unknown chat type:', effectiveType, 'roomId:', chat.roomId);
      return;
    }

    let receiverId: string;
    if (effectiveType === 'private') {
      const parts = chat.roomId.split('_');
      receiverId =
        parts.find((p: string) => p !== this.senderUserId) ??
        parts[parts.length - 1];
    } else {
      receiverId = chat.roomId;
    }

    // ✅ Navigate immediately - no await
    this.router.navigate([route], {
      queryParams: { receiverId: receiverId, from: 'home' },
    });
  }

  /**
   * 🔥 Load chat data in background (non-blocking)
   */
  private async loadChatDataInBackground(chat: any) {
    try {
      // ✅ Call the full openChat method in background
      await this.firebaseChatService.openChat(chat, false);
    } catch (error) {
      console.error('Background chat loading error:', error);
    }
  }

  /**
   * ✅ Load user communities for home
   */
  async loadUserCommunitiesForHome() {
    try {
      const userid = this.senderUserId;
      if (!userid) return;

      const communityIds: string[] =
        (await this.firebaseChatService.getUserCommunities(userid)) || [];

      for (const cid of communityIds) {
        const exists = this.chatList.find(
          (c: any) => c.receiver_Id === cid && c.isCommunity
        );
        if (exists) continue;

        const commSnap = await get(
          rtdbRef(getDatabase(), `communities/${cid}`)
        );
        if (!commSnap.exists()) continue;

        const comm = commSnap.val();
        const groupIds = await this.firebaseChatService.getGroupsInCommunity(
          cid
        );

        let previewGroupId: string | null = null;
        let previewGroupName = '';

        // ✅ NEW CODE (FIXED - SKIPS announcement/general):
        if (groupIds && groupIds.length > 0) {
          // Find first group that is NOT announcement/general
          for (const gid of groupIds) {
            const g = await this.firebaseChatService.getGroupInfo(gid);
            if (!g) continue;

            // ✅ SKIP announcement type groups
            if (g.type === 'announcement') {
              console.log(
                `⏭️ Skipping announcement group "${g.name}" in community "${comm.name}"`
              );
              continue;
            }

            // ✅ SKIP general named groups
            if ((g.name || '').toLowerCase() === 'general') {
              console.log(
                `⏭️ Skipping general group in community "${comm.name}"`
              );
              continue;
            }

            // ✅ Found valid preview group (not announcement, not general)
            previewGroupId = gid;
            previewGroupName = g.name || 'Group';
            break;
          }
        }

        let previewText = '';
        let previewTime = '';

        if (previewGroupId) {
          try {
            const chatsSnap = await get(
              rtdbRef(getDatabase(), `chats/${previewGroupId}`)
            );
            const chatsVal = chatsSnap.val();

            if (chatsVal) {
              const msgs = Object.entries(chatsVal).map(([k, v]: any) => ({
                key: k,
                ...(v as any),
              }));

              const last = msgs[msgs.length - 1];
              if (last) {
                if (last.isDeleted) {
                  previewText = 'This message was deleted';
                } else if (
                  last.attachment?.type &&
                  last.attachment.type !== 'text'
                ) {
                  const typeMap: Record<string, string> = {
                    image: '📷 Photo',
                    video: '🎥 Video',
                    audio: '🎵 Audio',
                    file: '📎 Attachment',
                  };
                  previewText = typeMap[last.attachment.type] || '[Media]';
                } else {
                  try {
                    const dec = await this.encryptionService.decrypt(last.text);
                    previewText = dec;
                  } catch {
                    previewText = '[Encrypted]';
                  }
                }

                if (last.timestamp) {
                  previewTime = this.formatTimestamp(last.timestamp);
                }
              }
            }
          } catch (err) {
            console.warn(
              'failed to fetch last message for previewGroup',
              previewGroupId,
              err
            );
          }
        }

        const communityChat: CommunityChat = {
          name: comm.name || 'Community',
          receiver_Id: cid,
          group: true,
          isCommunity: true,
          group_name: previewGroupName || '',
          message: previewText || '',
          time: previewTime || '',
          unread: false,
          unreadCount: 0,
          dp: comm.icon || 'assets/images/multiple-users-silhouette (1).png',
        };

        this.chatList.push(communityChat as any);

        if (previewGroupId) {
          const sub = this.firebaseChatService
            .listenToUnreadCount(previewGroupId, userid)
            .subscribe((count: number) => {
              const target = this.chatList.find(
                (c: any) => c.receiver_Id === cid && c.isCommunity
              ) as CommunityChat | undefined;

              if (target) {
                target.unreadCount = count;
                target.unread = count > 0;
              }
            });

          this.unreadSubs.push(sub);
          this.communityUnreadSubs.set(cid, sub);
        }
      }

      this.chatList.sort((a: any, b: any) => b.unreadCount - a.unreadCount);
    } catch (err) {
      console.error('loadUserCommunitiesForHome error', err);
    }
  }

  /**
   * ✅ Present popover
   */
  async presentPopover(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data?.action === 'readAll') {
      await this.markAllAsReadOnHome();
    }
  }

  /**
   * ✅ Mark all as read on home
   */
  private async markAllAsReadOnHome(): Promise<void> {
    if (!(await this.checkNetworkBeforeAction('markRead'))) {
      return;
    }
    const me = this.senderUserId || this.authService.authData?.userId || '';
    if (!me) return;

    const roomIds: string[] = [];

    for (const chat of this.chatList || []) {
      if (chat.isCommunity) {
        if (chat.previewGroupId) roomIds.push(String(chat.previewGroupId));
        continue;
      }

      if (chat.group) {
        roomIds.push(String(chat.receiver_Id));
      } else {
        roomIds.push(this.getRoomId(String(me), String(chat.receiver_Id)));
      }
    }

    const uniqueRoomIds = Array.from(new Set(roomIds)).filter((r) => !!r);

    if (uniqueRoomIds.length === 0) return;

    try {
      await this.firebaseChatService.markManyRoomsAsRead(
        uniqueRoomIds,
        String(me)
      );

      this.chatList.forEach((c) => {
        c.unread = false;
        c.unreadCount = 0;
      });
    } catch (err) {
      console.warn('markAllAsReadFromHome failed', err);
    }
  }

  goToContact() {
    this.router.navigate(['/contact-screen']);
  }

  // ========================================
  // 🎯 CAMERA & ATTACHMENTS
  // ========================================

  /**
   * ✅ Open camera
   */
  async openCamera() {
    if (this.isOffline) {
      await this.showToast(
        'Camera requires internet connection to send photos',
        'warning'
      );
      return;
    }
    try {
      const image = await Camera.getPhoto({
        source: CameraSource.Camera,
        quality: 90,
        resultType: CameraResultType.Uri,
      });

      if (!image.webPath) {
        throw new Error('No image path returned');
      }

      const response = await fetch(image.webPath);
      const blob = await response.blob();

      const timestamp = Date.now();
      const fileName = `camera_${timestamp}.${image.format || 'jpg'}`;
      const mimeType = `image/${image.format || 'jpeg'}`;
      const previewUrl = URL.createObjectURL(blob);

      this.selectedAttachment = {
        type: 'image',
        blob: blob,
        fileName: fileName,
        mimeType: mimeType,
        fileSize: blob.size,
        previewUrl: previewUrl,
      };

      this.showPreviewModal = true;
    } catch (error) {
      console.error('Camera error:', error);
      await this.showToast(
        'Failed to capture photo. Please try again.',
        'danger'
      );
    }
  }

  /**
   * ✅ Open cropper modal
   */
  async openCropperModal(attachment: any) {
    if (!attachment || attachment.type !== 'image') {
      console.warn('⚠️ No image attachment to crop');
      return;
    }

    try {
      const modal = await this.modalController.create({
        component: ImageCropperModalComponent,
        componentProps: {
          imageUrl: attachment.previewUrl,
          aspectRatio: 0,
          cropQuality: 0.9,
        },
        cssClass: 'image-cropper-modal',
        backdropDismiss: false,
      });

      await modal.present();
      const { data } = await modal.onDidDismiss<CropResult>();

      if (data && data.success && data.originalBlob) {
        if (attachment.previewUrl) {
          try {
            URL.revokeObjectURL(attachment.previewUrl);
          } catch (e) {
            console.warn('Failed to revoke old preview URL:', e);
          }
        }

        const newPreviewUrl = URL.createObjectURL(data.originalBlob);
        const timestamp = Date.now();
        const fileExtension = attachment.fileName.split('.').pop() || 'jpg';
        const newFileName = `cropped_${timestamp}.${fileExtension}`;

        this.selectedAttachment = {
          ...attachment,
          blob: data.originalBlob,
          previewUrl: newPreviewUrl,
          fileName: newFileName,
          fileSize: data.originalBlob.size,
          mimeType: data.originalBlob.type || attachment.mimeType,
          caption: '',
        };

        this.firebaseChatService.setSelectedAttachment(this.selectedAttachment);
        this.showPreviewModal = true;

        await this.showToast('Image cropped successfully', 'primary');
      } else if (data && data.cancelled) {
        if (attachment.previewUrl) {
          try {
            URL.revokeObjectURL(attachment.previewUrl);
          } catch (e) {}
        }
      } else if (data && data.error) {
        await this.showToast(data.error, 'danger');
      }
    } catch (error) {
      console.error('❌ Error opening cropper modal:', error);
      await this.showToast('Failed to open image editor', 'danger');
    }
  }

  /**
   * ✅ Cancel attachment
   */
  cancelAttachment() {
    if (this.selectedAttachment?.previewUrl) {
      try {
        URL.revokeObjectURL(this.selectedAttachment.previewUrl);
      } catch (e) {
        console.warn('Failed to revoke preview URL:', e);
      }
    }

    this.selectedAttachment = null;
    this.showPreviewModal = false;
    this.messageText = '';
  }

  /**
   * ✅ Go to contact list
   */
  async goToContactList() {
    if (!this.selectedAttachment) {
      await this.showToast('No attachment to send', 'warning');
      return;
    }

    this.selectedAttachment.caption = this.messageText.trim();
    this.firebaseChatService.setSelectedAttachment(this.selectedAttachment);
    this.showPreviewModal = false;

    setTimeout(() => {
      this.router.navigate(['/select-contact-list'], {
        state: {
          attachmentData: this.selectedAttachment,
          caption: this.messageText.trim(),
          fromCamera: true,
        },
      });

      this.messageText = '';
    }, 100);
  }

  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  async scanBarcode() {
    // Implementation commented out
  }

  // getRoomId(a: string, b: string): string {
  //   return a < b ? `${a}_${b}` : `${b}_${a}`;
  // }

  getRoomId(a: string, b: string): string {
    // ✅ FIX: Numeric comparison
    const numA = Number(a);
    const numB = Number(b);

    if (!isNaN(numA) && !isNaN(numB) && numA > 0 && numB > 0) {
      return numA < numB ? `${numA}_${numB}` : `${numB}_${numA}`;
    }

    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  // ========================================
  // 🎯 TYPING LISTENERS
  // ========================================

  /**
   * ✅ Start typing listener for chat
   */
  private startTypingListenerForChat(chat: any) {
    try {
      const db = getDatabase();
      const roomId = chat.group
        ? chat.receiver_Id
        : this.getRoomId(this.senderUserId || '', chat.receiver_Id);

      if (!roomId || this.typingUnsubs.has(roomId)) return;

      const typingRef = rtdbRef(db, `typing/${roomId}`);

      const unsub = rtdbOnValue(typingRef, (snapshot) => {
        const val = snapshot.val() || {};
        const now = Date.now();

        if (!chat.group) {
          const otherUserKey = chat.receiver_Id;
          const entry = val[otherUserKey] || null;
          const isTyping = entry
            ? !!entry.typing
            : Object.keys(val).length === 0
            ? false
            : !!val;

          chat.isTyping = !!isTyping;
          chat.typingText = isTyping ? chat.name || 'typing...' : null;
        } else {
          const entries = Object.keys(val).map((k) => ({
            userId: k,
            typing: val[k]?.typing ?? !!val[k],
            lastUpdated: val[k]?.lastUpdated ?? 0,
            name: val[k]?.name ?? null,
          }));

          const recent = entries.filter(
            (e) =>
              e.userId !== this.senderUserId &&
              e.typing &&
              now - (e.lastUpdated || 0) < 10000
          );

          chat.typingCount = recent.length;
          chat.isTyping = recent.length > 0;

          if (recent.length === 1) {
            const r = recent[0];
            chat.typingText =
              r.name || this.lookupMemberName(chat, r.userId) || null;
          } else {
            chat.typingText = null;
          }
        }
      });

      this.typingUnsubs.set(roomId, unsub);
    } catch (err) {
      console.warn('startTypingListenerForChat error', err);
    }
  }

  /**
   * ✅ Stop typing listener for chat
   */
  private stopTypingListenerForChat(chat: any) {
    try {
      const roomId = chat.group
        ? chat.receiver_Id
        : this.getRoomId(this.senderUserId || '', chat.receiver_Id);
      if (!roomId) return;

      const unsub = this.typingUnsubs.get(roomId);
      if (unsub) {
        try {
          unsub();
        } catch (e) {}
        this.typingUnsubs.delete(roomId);
      }
    } catch (err) {}
  }

  /**
   * ✅ Lookup member name
   */
  private lookupMemberName(groupChat: any, userId: string): string | null {
    try {
      if (!groupChat || !groupChat.members) return null;
      const m = groupChat.members[userId];
      return m?.name || null;
    } catch (e) {
      return null;
    }
  }

  // ========================================
  // 🎯 HELPER METHODS
  // ========================================

  /**
   * ✅ Show toast helper
   */
  private async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
    });
    await toast.present();
  }

  /**
   * ✅ Normalize phone number
   */
  private normalizePhone(num?: string): string {
    if (!num) return '';
    return num.replace(/\D/g, '').slice(-10);
  }

  trackByRoomId(index: number, chat: any): string {
    return chat.roomId || index.toString();
  }

  /**
   *  Setup real-time listeners for last message updates
   * Listens to userchats/{userId}/{roomId} changes to update last message instantly
   */
  // private setupLastMessageListeners(conversations: any[]): void {
  //   const userId = this.authService.senderId || this.senderUserId;
  //   if (!userId) return;

  //   // Clean up old listeners for conversations that no longer exist
  //   const currentRoomIds = new Set(conversations.map(c => c.roomId));
  //   for (const [roomId, unsubscribe] of this.lastMessageListeners.entries()) {
  //     if (!currentRoomIds.has(roomId)) {
  //       try {
  //         unsubscribe();
  //       } catch (e) { }
  //       this.lastMessageListeners.delete(roomId);
  //     }
  //   }

  //   // Setup listeners for each conversation
  //   for (const conv of conversations) {
  //     const roomId = conv.roomId;
  //     if (!roomId || this.lastMessageListeners.has(roomId)) continue;

  //     try {
  //       const userChatRef = rtdbRef(
  //         this.db,
  //         `userchats/${userId}/${roomId}`
  //       );

  //       const unsubscribe = rtdbOnValue(userChatRef, (snapshot) => {
  //         if (!snapshot.exists()) return;

  //         const userChatData = snapshot.val();
  //         const lastMessage = userChatData?.lastmessage || '';
  //         const lastMessageType = userChatData?.lastmessageType || 'text';
  //         const lastMessageAtRaw = userChatData?.lastmessageAt || 0;
  //         // 🔥 Convert timestamp to Date object
  //         const lastMessageAt = lastMessageAtRaw ? new Date(lastMessageAtRaw) : new Date(0);

  //         // Update conversation in local array
  //         const index = this.conversations.findIndex(c => c.roomId === roomId);
  //         if (index >= 0) {
  //           // 🔥 Filter deleted messages - don't show deleted message as last message
  //           if (lastMessage && lastMessage.trim() !== '') {
  //             this.conversations[index] = {
  //               ...this.conversations[index],
  //               lastMessage,
  //               lastMessageType,
  //               lastMessageAt,
  //             };
  //             this.cdr.detectChanges();
  //           } else {
  //             // Last message cleared (all messages deleted)
  //             this.conversations[index] = {
  //               ...this.conversations[index],
  //               lastMessage: '',
  //               lastMessageType: 'text',
  //               lastMessageAt: new Date(0),
  //             };
  //             this.cdr.detectChanges();
  //           }
  //         }

  //         // Also update cache
  //         this.chatPouchDb.updateConversationField(
  //           userId,
  //           roomId,
  //           {
  //             lastMessage,
  //             lastMessageType,
  //             lastMessageAt,
  //           } as any
  //         ).catch(err => console.warn('Failed to update cache:', err));
  //       });

  //       this.lastMessageListeners.set(roomId, unsubscribe);
  //     } catch (err) {
  //       console.warn(`Failed to setup listener for ${roomId}:`, err);
  //     }
  //   }
  // }

  private setupLastMessageListeners(conversations: any[]): void {
    const userId = this.authService.senderId || this.senderUserId;
    if (!userId) return;

    const currentRoomIds = new Set(conversations.map((c) => c.roomId));
    for (const [roomId, unsubscribe] of this.lastMessageListeners.entries()) {
      if (!currentRoomIds.has(roomId)) {
        try {
          unsubscribe();
        } catch (e) {}
        this.lastMessageListeners.delete(roomId);
      }
    }

    for (const conv of conversations) {
      const roomId = conv.roomId;
      if (!roomId || this.lastMessageListeners.has(roomId)) continue;

      try {
        const userChatRef = rtdbRef(this.db, `userchats/${userId}/${roomId}`);

        const unsubscribe = rtdbOnValue(userChatRef, async (snapshot) => {
          if (!snapshot.exists()) return;

          const userChatData = snapshot.val();
          const rawLastMessage = userChatData?.lastmessage || '';
          const lastMessageType = userChatData?.lastmessageType || 'text';
          const lastMessageAtRaw = userChatData?.lastmessageAt || 0;
          const lastMessageAt = lastMessageAtRaw
            ? new Date(lastMessageAtRaw)
            : new Date(0);

          // ✅ FIX: Har case mein decrypt karo — ENC: prefix ho ya na ho
          let lastMessage = rawLastMessage;
          if (
            rawLastMessage &&
            typeof rawLastMessage === 'string' &&
            rawLastMessage.trim()
          ) {
            try {
              const decrypted = await this.encryptionService.decrypt(
                rawLastMessage
              );
              // ✅ Decrypt successful aur meaningful result mila
              if (decrypted && decrypted !== rawLastMessage) {
                lastMessage = decrypted;
              } else {
                lastMessage = rawLastMessage; // already plain text tha
              }
            } catch (e) {
              // Decrypt fail = already plain text
              lastMessage = rawLastMessage;
            }
          }

          const unreadCount = Number(userChatData?.unreadCount ?? 0);

          const index = this.conversations.findIndex(
            (c) => c.roomId === roomId
          );
          if (index >= 0) {
            this.conversations[index] = {
              ...this.conversations[index],
              lastMessage,
              lastMessageType,
              lastMessageAt,
              unreadCount,
            };
            this.cdr.detectChanges();
          }

          this.chatPouchDb
            .updateConversationField(userId, roomId, {
              lastMessage,
              lastMessageType,
              lastMessageAt,
              unreadCount,
            } as any)
            .catch((err) => console.warn('Failed to update cache:', err));
        });

        this.lastMessageListeners.set(roomId, unsubscribe);
      } catch (err) {
        console.warn(`Failed to setup listener for ${roomId}:`, err);
      }
    }
  }

  /**
   * Clean up last message listeners
   */
  private cleanupLastMessageListeners(): void {
    for (const [roomId, unsubscribe] of this.lastMessageListeners.entries()) {
      try {
        unsubscribe();
      } catch (e) {}
    }
    this.lastMessageListeners.clear();
  }

  // ════════════════════════════════════════════════════════
  // ★ FAVOURITE — ADD / REMOVE / TOGGLE
  // ════════════════════════════════════════════════════════

  async onAddToFavourite(chat: any, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!chat?.roomId) return;

    try {
      const isNowFav = await this.chatListFilterService.toggleFavourite(
        chat.roomId
      );
      await this.showToast(
        isNowFav ? 'Added to Favourites' : 'Removed from Favourites',
        'primary'
      );
      this.clearChatSelection();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('[Home] toggleFavourite error:', err);
      await this.showToast('Something went wrong', 'danger');
    }
  }

  // ════════════════════════════════════════════════════════
  // ★ NEW LIST MODAL — OPEN / CLOSE / CREATE
  // ════════════════════════════════════════════════════════

  async openNewListModal(): Promise<void> {
    const modal = await this.modalController.create({
      component: NewListModalComponent,
      breakpoints: [0, 0.6, 1],
      initialBreakpoint: 0.6,
      backdropDismiss: true,
      cssClass: 'new-list-sheet-modal',
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data?.created && data?.list) {
      await this.showToast(`List "${data.list.name}" created`, 'primary');
      this.cdr.detectChanges();
    }
  }

  closeNewListModal(): void {
    this.showNewListModal = false;
    this.newListName = '';
    this.newListNameError = '';
  }

  async confirmCreateList(): Promise<void> {
    const name = this.newListName.trim();

    // Validation
    if (!name) {
      this.newListNameError = 'List name cannot be empty';
      return;
    }
    if (this.chatListFilterService.listNameExists(name)) {
      this.newListNameError = 'A list with this name already exists';
      return;
    }

    try {
      const newList = await this.chatListFilterService.createList(name);
      this.closeNewListModal();
      await this.showToast(`List "${name}" created`, 'primary');
      this.cdr.detectChanges();
    } catch (err) {
      console.error('[Home] createList error:', err);
      await this.showToast('Failed to create list', 'danger');
    }
  }

  // ════════════════════════════════════════════════════════
  // ★ ADD / REMOVE CHAT FROM CUSTOM LIST
  // ════════════════════════════════════════════════════════

  async onAddToCustomList(
    chat: any,
    listId: string,
    event?: Event
  ): Promise<void> {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!chat?.roomId || !listId) return;

    try {
      const alreadyIn = this.chatListFilterService
        .getListsContainingRoom(chat.roomId)
        .some((l) => l.listId === listId);

      if (alreadyIn) {
        await this.chatListFilterService.removeRoomFromList(
          listId,
          chat.roomId
        );
        await this.showToast('Removed from list', 'primary');
      } else {
        await this.chatListFilterService.addRoomToList(listId, chat.roomId);
        await this.showToast('Added to list', 'primary');
      }

      this.clearChatSelection();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('[Home] onAddToCustomList error:', err);
      await this.showToast('Something went wrong', 'danger');
    }
  }

  // ════════════════════════════════════════════════════════
  // ★ DELETE CUSTOM LIST
  // ════════════════════════════════════════════════════════

  async onDeleteCustomList(listId: string, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    const list = this.chatListFilterService.currentLists.find(
      (l) => l.listId === listId
    );
    if (!list) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete list',
      message: `Delete "${list.name}"? Chats will not be deleted.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          cssClass: 'danger-button',
          handler: async () => {
            try {
              await this.chatListFilterService.deleteList(listId);
              // If currently viewing this list, go back to All
              if (this.activeListFilterId === listId) {
                this.activeListFilterId = null;
              }
              await this.showToast(`"${list.name}" deleted`, 'primary');
              this.cdr.detectChanges();
            } catch (err) {
              console.error('[Home] deleteList error:', err);
              await this.showToast('Failed to delete list', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // ════════════════════════════════════════════════════════
  // ★ DARK MODE
  // ════════════════════════════════════════════════════════

  private checkDarkMode() {
    const isDark =
      document.body.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.isDarkMode = isDark;
    this.cdr.detectChanges();
  }

  // ════════════════════════════════════════════════════════
  // ★ ACTION SHEET — "Add to list" (long press → More → Add to list)
  // ════════════════════════════════════════════════════════

  async showAddToListSheet(): Promise<void> {
    const roomIds = this.selectedChats
      .filter((c) => !!c?.roomId)
      .map((c) => c.roomId);

    if (roomIds.length === 0) return;

    const modal = await this.modalController.create({
      component: ChooseListSheetComponent,
      componentProps: {
        roomId: roomIds[0],
        roomIds: roomIds,
      },
      breakpoints: [0, 0.5, 0.85],
      initialBreakpoint: 0.85,
      backdropDismiss: true,
      cssClass: 'choose-list-sheet-modal',
    });

    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data?.saved) {
      this.clearChatSelection();
      this.cdr.detectChanges();
      await this.showToast('List updated', 'primary');
    }
  }

  goToManageFavorites(): void {
    this.router.navigate(['/manage-favorite']);
  }

  // ── Get active list name ─────────────────────────────────────
  getActiveListName(): string {
    if (!this.activeListFilterId || this.activeListFilterId === 'favourites') {
      return 'Favourites';
    }
    const list = this.chatListFilterService.currentLists.find(
      (l) => l.listId === this.activeListFilterId
    );
    return list?.name || 'List';
  }

  // ── Navigate to manage custom list ───────────────────────────
  goToManageList(listId: string): void {
    this.router.navigate(['/manage-list'], {
      queryParams: { listId },
    });
  }
}
