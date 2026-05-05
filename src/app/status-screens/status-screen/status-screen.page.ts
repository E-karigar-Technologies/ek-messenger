import {
  Component,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  NgZone,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { FormsModule } from '@angular/forms';
import {
  ActionSheetController,
  IonicModule,
  ModalController,
  PopoverController,
  ToastController,
} from '@ionic/angular';
import { Router } from '@angular/router';
import { MenuPopoverComponent } from '../../components/menu-popover/menu-popover.component';
import { register } from 'swiper/element/bundle';
import { FooterTabsComponent } from 'src/app/components/footer-tabs/footer-tabs.component';
import { Channel, ChannelService } from 'src/app/pages/channels/services/channel';
import { AuthService } from 'src/app/auth/auth.service';
import { AddChannelModalComponent } from 'src/app/pages/channels/modals/add-channel-modal/add-channel-modal.component';
import { ChannelPouchDbService } from 'src/app/pages/channels/services/pouch-db';
import { ChannelUiStateService } from 'src/app/pages/channels/services/channel-ui-state';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { firstValueFrom, Subscription, interval } from 'rxjs';
import { NetworkService } from 'src/app/services/network-connection/network.service';
import { ContactSyncService } from 'src/app/services/contact-sync.service';
import { SqliteService } from 'src/app/services/sqlite.service';
import {
  StatusContactOption,
  StatusDoc,
  StatusDraft,
  StatusOwnerGroup,
  StatusPrivacyDefault,
  StatusPrivacyMode,
  StatusViewDoc,
} from './models/status.model';
import { StatusApiService } from './services/status-api.service';
import { StatusCacheService } from './services/status-cache.service';
import { StatusPrivacyModalComponent } from './components/status-privacy-modal/status-privacy-modal.component';
import { ChatBackendSocketService } from 'src/app/services/chat-backend-socket.service';
import { getDatabase, ref, onValue } from 'firebase/database';

register();

@Component({
  selector: 'app-status-screen',
  templateUrl: './status-screen.page.html',
  styleUrls: ['./status-screen.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, FooterTabsComponent, ScrollingModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatusScreenPage implements OnInit, OnDestroy {
  @ViewChild('statusFileInput') statusFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('viewerVideo') viewerVideoRef?: ElementRef<HTMLVideoElement>;

  isLoadingChannels = false;
  loadingChannelId: number | null = null;
  isRotated = false;

  myChannels: Channel[] = [];
  publicChannels: Channel[] = [];
  filteredChannels: Channel[] = [];

  private followedChannelIds = new Set<number>();
  userId: any = this.authService.authData?.userId || '';
  private userUid = String(this.userId || '');

  statusFeedReady = false;
  statusError = '';

  myStatusList: StatusDoc[] = [];
  recentStatusGroups: StatusOwnerGroup[] = [];
  mutedStatusGroups: StatusOwnerGroup[] = [];
  hiddenStatusGroups: StatusOwnerGroup[] = [];

  contactsForPrivacy: StatusContactOption[] = [];
  statusDrafts: StatusDraft[] = [];

  defaultPrivacy: StatusPrivacyDefault = {
    uid: '',
    privacyMode: 'my_contacts',
    privacyUsers: {},
  };

  composerOpen = false;
  composerCaption = '';
  composerFile: File | null = null;
  composerPreviewUrl = '';
  composerPosting = false;

  isViewerOpen = false;
  viewerIsOwner = false;
  viewerOwnerName = '';
  viewerOwnerAvatar = '';
  viewerMediaSrc = '';
  viewerMediaReady = false;
  viewerMediaLoading = true;
  viewerReplyText = '';
  currentViewerStatus: StatusDoc | null = null;
  viewerStatusGroup: StatusOwnerGroup | null = null;
  viewerCurrentIndex = 0;
  viewerStatuses: StatusDoc[] = [];
  viewerStatusIndex = 0;
  viewerProgressBars: number[] = [];
  viewerPaused = false;
  showViewerTestingButtons = true;
  viewerOwnerQueue: StatusOwnerGroup[] = [];
  viewerOwnerQueueIndex = 0;
  private viewerOpenedAsOwner = false;

  // Progress timer
  private viewerTimer: ReturnType<typeof setInterval> | null = null;
  private viewerStepMs = 50;
  private viewerDurationMs = 5000;
  private viewerElapsed = 0;

  // Hold detection
  private holdTimeout: ReturnType<typeof setTimeout> | null = null;
  private isHolding = false;

  isViewsSheetOpen = false;
  isLoadingOwnerViews = false;
  ownerStatusViews: Array<StatusViewDoc & { viewerName: string; viewerAvatar: string }> = [];

  // Real-time last messages from Firebase RTDB
  channelLastMessages = new Map<number, { body: string; timestamp: number; mediaId?: string; mediaType?: string }>();
  private channelLastMsgUnsubs = new Map<number, () => void>();

  // Channel unread counts (real-time from Firebase RTDB channel_unreadCount/{userId}/{channelId})
  // Plain object instead of Map — new reference on each update triggers OnPush re-render reliably.
  channelUnreadCounts: { [channelId: number]: number } = {};
  private channelUnreadCountUnsubs = new Map<number, () => void>();

  private viewerSwipeStartX = 0;
  private viewerSwipeStartY = 0;
  private readonly viewerHorizontalSwipeThreshold = 48;
  private readonly viewerVerticalOpenThreshold = 90;
  private readonly viewerVerticalCloseThreshold = 120;

  private statusSubscriptions = new Subscription();
  private hasShownDraftReconnectHint = false;
  private hasShownPrivacyOfflineHint = false;
  private lastStatusContactSyncAt = 0;
  private readonly statusContactSyncCooldownMs = 2 * 60 * 1000;
  private readonly statusPollIntervalMs = 12_000;
  private readonly statusRefreshCooldownMs = 5_000;
  private statusContactsByUid = new Map<string, StatusContactOption>();
  private statusRefreshInFlight = false;
  private statusRefreshQueued = false;
  private lastStatusRefreshAt = 0;
  private pendingPrivacySync: { privacyMode: StatusPrivacyMode; privacyUsers: Record<string, true> } | null = null;
  private isSyncingPrivacy = false;
  private unsubscribeStatusNew?: () => void;

  // 🚀 Batch update mechanism
  private updateScheduled = false;
  private pendingUpdates: (() => void)[] = [];

  // Polling subscription for real-time-ish updates
  private pollSubscription?: Subscription;

  constructor(
    private popoverCtrl: PopoverController,
    private router: Router,
    private actionSheetCtrl: ActionSheetController,
    private channelService: ChannelService,
    private statusApi: StatusApiService,
    private statusCache: StatusCacheService,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private modalCtrl: ModalController,
    private contactSyncService: ContactSyncService,
    private sqliteService: SqliteService,
    private networkService: NetworkService,
    private pouchDb: ChannelPouchDbService,
    private channelUiState: ChannelUiStateService,
    private chatBackendSocket: ChatBackendSocketService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) { }

  ngOnInit() {
    this.userUid = String(this.authService.authData?.userId || '');
    this.defaultPrivacy = this.statusCache.getFallbackPrivacy(this.userUid);

    this.channelUiState.isLoading$.subscribe(v => {
      this.isLoadingChannels = v;
      this.cdr.markForCheck();
    });

    this.statusSubscriptions.add(
      this.networkService.isOnline$.subscribe(async isOnline => {
        if (isOnline) {
          await this.flushPendingSeenQueue();

          if (this.pendingPrivacySync) {
            await this.queuePrivacyDefaultSync(this.pendingPrivacySync);
          }

          if (this.statusDrafts.length > 0 && !this.hasShownDraftReconnectHint) {
            this.hasShownDraftReconnectHint = true;
            this.presentToast('You have status drafts saved while offline. Add media and post them now.');
          }

          this.refreshStatusDataFromBackend();
        }
      })
    );
  }

  /* =========================
     BATCH UPDATE MECHANISM
     ========================= */

  private scheduleUpdate(updateFn: () => void) {
    this.pendingUpdates.push(updateFn);

    if (!this.updateScheduled) {
      this.updateScheduled = true;

      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          this.ngZone.run(() => {
            this.pendingUpdates.forEach(fn => fn());
            this.pendingUpdates = [];
            this.updateScheduled = false;
            this.cdr.detectChanges();
          });
        });
      });
    }
  }

  /* =========================
     LIFECYCLE - SIMPLIFIED OFFLINE-FIRST
     ========================= */

  async ionViewWillEnter() {
    // Reattach first so any async callbacks during load can call detectChanges() safely.   
    this.cdr.reattach();
    this.userUid = String(this.authService.authData?.userId || '');

    if (!this.channelUiState.hasLoadedOnce()) {
      this.channelUiState.startInitialLoad();
    }

    // Load from cache immediately
    await this.loadFromCache();

    this.channelUiState.finishInitialLoad();

    // Start background sync
    this.syncFromBackend();

    await this.loadStatusDataFromCache();
    await this.loadStatusContacts(this.networkService.isOnline.value);
    await this.loadStatusPrivacyDefault();
    await this.loadStatusDrafts();
    this.refreshStatusDataFromBackend();
    this.flushPendingSeenQueue();

    // Start polling for updates (every 30 seconds when online)
    this.startPolling();

    try {
      await this.chatBackendSocket.connect();
      this.unsubscribeStatusNew = this.chatBackendSocket.onStatusNew(() => {
        this.refreshStatusDataFromBackend();
      });
    } catch (error) {
      console.warn('Status socket connect failed', error);
    }

    this.cdr.reattach();
  }

  ionViewWillLeave() {
    this.stopPolling();
    this.stopViewerProgress();
    this.unsubscribeChannelLastMessages();
    this.unsubscribeStatusNew?.();
    this.unsubscribeStatusNew = undefined;
    this.cdr.detach();
  }

  ngOnDestroy() {
    this.stopPolling();
    this.stopViewerProgress();
    this.unsubscribeChannelLastMessages();
    this.statusSubscriptions.unsubscribe();
    this.unsubscribeStatusNew?.();
    this.unsubscribeStatusNew = undefined;
    this.cdr.detach();
  }

  /* =========================
    CHANNEL LAST MESSAGE (Real-time)
    ========================= */

  private subscribeToChannelLastMessages() {
    const db = getDatabase();
    for (const ch of this.myChannels) {
      const id = ch.channel_id;

      // 1. Real-time unread count badge
      if (!this.channelUnreadCountUnsubs.has(id)) {
        const unreadUnsub = onValue(
          ref(db, `channel_unreadCount/${this.userUid}/${id}`),
          (snap) => {
            this.ngZone.run(() => {
              this.channelUnreadCounts = { ...this.channelUnreadCounts, [id]: snap.val() ?? 0 };
              this.cdr.detectChanges();
            });
          }
        );
        this.channelUnreadCountUnsubs.set(id, unreadUnsub);
      }

      // 2. Real-time last message preview
      if (!this.channelLastMsgUnsubs.has(id)) {
        const unsub = onValue(
          ref(db, `channels/${id}/recentPost`),
          (snap) => {
            const val = snap.val();
            if (val) {
              this.channelLastMessages.set(id, {
                body: val.body || '',
                timestamp: val.timestamp || 0,
                mediaId: val.media_id ?? val.mediaId,
                mediaType: val.media_type ?? val.mediaType,
              });
            } else {
              this.channelLastMessages.delete(id);
            }
            this.ngZone.run(() => this.cdr.detectChanges());
          }
        );
        this.channelLastMsgUnsubs.set(id, unsub);
      }
    }
  }

  /**
   * Sync channel followers to Firebase RTDB for a given channel.
   * Uses getChannelFollowers API — only followers (not owners/admins who haven't followed).
   * Current user is excluded since they are the one reading; RTDB only needs other members.
   */
  private async syncChannelMembersForChannel(channelId: number): Promise<void> {
    try {
      const res: any = await firstValueFrom(
        this.channelService.getChannelFollowers(channelId, { limit: 500 })
      );
      if (res?.status && Array.isArray(res.followers) && res.followers.length > 0) {
        const currentUid = this.userUid; // exclude self
        const members = res.followers
          .filter((f: any) => String(f.user_id) !== String(currentUid))
          .map((f: any) => ({ user_id: f.user_id, role_id: f.role_id || 3 }));
        if (members.length > 0) {
          await this.chatBackendSocket.syncChannelMembers({ channelId, members });
        }
      }
    } catch {
      // Non-critical: silently ignore (offline or permission error)
    }
  }

  /** Sync members for all followed channels (called once after channels load) */
  private syncAllChannelMembers() {
    for (const ch of this.myChannels) {
      this.syncChannelMembersForChannel(ch.channel_id);
    }
  }

  private unsubscribeChannelLastMessages() {
    for (const unsub of this.channelLastMsgUnsubs.values()) {
      unsub();
    }
    this.channelLastMsgUnsubs.clear();

    for (const unsub of this.channelUnreadCountUnsubs.values()) {
      unsub();
    }
    this.channelUnreadCountUnsubs.clear();
  }

  getChannelLastMsgText(ch: Channel): string {
    const lm = this.channelLastMessages.get(ch.channel_id);
    if (!lm) return '';
    if (lm.mediaId) {
      return lm.mediaType === 'video' ? '🎥 Video' : '📷 Photo';
    }
    if (!lm.body) {
      return '📎 Media';
    }
    return lm.body;
  }

  getChannelLastMsgTime(ch: Channel): string {
    const lm = this.channelLastMessages.get(ch.channel_id);
    if (!lm?.timestamp) return '';
    const date = new Date(lm.timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } else if (isYesterday) {
      return 'Yesterday';
    } else if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    } else {
      return date.toLocaleDateString();
    }
  }

  get sortedMyChannels(): Channel[] {
    return [...this.myChannels].sort((a, b) => {
      const ta = this.channelLastMessages.get(a.channel_id)?.timestamp ?? 0;
      const tb = this.channelLastMessages.get(b.channel_id)?.timestamp ?? 0;
      return tb - ta;
    });
  }


  /* =========================
     POLLING FOR UPDATES
     ========================= */

  private startPolling() {
    // Poll frequently, but keep refresh silent and non-blocking.
    this.pollSubscription = interval(this.statusPollIntervalMs).subscribe(() => {
      if (this.networkService.isOnline.value && document.visibilityState === 'visible') {
        console.log('🔄 Polling for updates...');
        this.syncFromBackend();
        this.refreshStatusDataFromBackend();
        this.flushPendingSeenQueue();
      }
    });
  }

  private stopPolling() {
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
      this.pollSubscription = undefined;
    }
  }

  /* =========================
     OFFLINE-FIRST DATA LOADING
     ========================= */

  private firstLoadDone = false;

  private async loadFromCache() {
    // Load data outside Angular zone for better performance
    const [cachedMyChannels, cachedDiscoverChannels] = await this.ngZone.runOutsideAngular(async () => {
      return await Promise.all([
        this.pouchDb.getMyChannels(this.userId),
        this.pouchDb.getDiscoverChannels(this.userId)
      ]);
    });

    // Update UI in batches
    this.scheduleUpdate(() => {
      if (this.myChannels.length === 0 && cachedMyChannels.length > 0) {
        this.myChannels = cachedMyChannels;
        this.followedChannelIds = new Set(cachedMyChannels.map(c => c.channel_id));
        this.subscribeToChannelLastMessages();
        this.syncAllChannelMembers();
      }

      if (this.publicChannels.length === 0 && cachedDiscoverChannels.length > 0) {
        this.publicChannels = cachedDiscoverChannels;
      }
    });

    this.updateFilteredChannelsInPlace();
    this.firstLoadDone = true;
  }

  trackByChannelId(index: number, channel: Channel) {
    return channel.channel_id;
  }

  /* =========================
     IN-PLACE ARRAY PATCHING
     ========================= */

  private patchChannelsInPlace(target: Channel[], incoming: Channel[]) {
    this.scheduleUpdate(() => {
      const incomingMap = new Map(incoming.map(c => [c.channel_id, c]));
      const incomingIds = new Set(incoming.map(c => c.channel_id));

      // Update existing items in-place
      for (let i = 0; i < target.length; i++) {
        const existingChannel = target[i];
        const incomingChannel = incomingMap.get(existingChannel.channel_id);

        if (incomingChannel) {
          Object.assign(existingChannel, incomingChannel);
        }
      }

      // Remove items not in incoming
      for (let i = target.length - 1; i >= 0; i--) {
        if (!incomingIds.has(target[i].channel_id)) {
          target.splice(i, 1);
        }
      }

      // Add new items
      const existingIds = new Set(target.map(c => c.channel_id));
      for (const channel of incoming) {
        if (!existingIds.has(channel.channel_id)) {
          target.push(channel);
        }
      }
    });
  }

  /* =========================
     BACKEND SYNC (Direct)
     ========================= */

  private syncFromBackend() {
    if (!navigator.onLine) {
      console.log('📴 Offline: Skipping backend sync');
      return;
    }

    console.log('🌐 Syncing from backend...');
    this.syncMyChannelsFromBackend();
    this.syncDiscoverChannelsFromBackend();
  }

  private syncMyChannelsFromBackend() {
    this.channelService
      .getUserChannels(this.userId, { role: 'all' })
      .subscribe({
        next: async (res: any) => {
          if (res?.status && Array.isArray(res.channels)) {
            console.log(`✅ Backend sync: ${res.channels.length} my channels`);

            // Update UI immediately
            this.patchChannelsInPlace(this.myChannels, res.channels);

            // Update followed IDs
            this.scheduleUpdate(() => {
              this.followedChannelIds = new Set(res.channels.map((c: Channel) => c.channel_id));
            });

            // Subscribe to Firebase listeners now that myChannels is populated
            this.scheduleUpdate(() => {
              this.subscribeToChannelLastMessages();
              this.syncAllChannelMembers();
            });

            this.updateFilteredChannelsInPlace();

            // Save to PouchDB for offline access
            await this.pouchDb.saveMyChannels(this.userId, res.channels);
          }
        },
        error: (err) => {
          console.log('📴 Backend sync failed (offline or error):', err.message);
        }
      });
  }

  private syncDiscoverChannelsFromBackend() {
    this.channelService
      .listChannels({ limit: 50 })
      .subscribe({
        next: async (res: any) => {
          if (res?.status && Array.isArray(res.channels)) {
            console.log(`✅ Backend sync: ${res.channels.length} discover channels`);

            // Update UI immediately
            this.patchChannelsInPlace(this.publicChannels, res.channels);
            this.updateFilteredChannelsInPlace();

            // Save to PouchDB for offline access
            await this.pouchDb.saveDiscoverChannels(this.userId, res.channels);
          }
        },
        error: (err) => {
          console.log('📴 Backend sync failed (offline or error):', err.message);
        }
      });
  }

  /* =========================
     STATUS: CACHE + FEED LOADING
     ========================= */

  private isStatusExpired(status: StatusDoc): boolean {
    return Number(status.expiresAt || 0) <= Date.now() || !!status.isDeleted;
  }

  private resolveStatusOwnerMeta(ownerUid: string, ownerName: string, ownerAvatar: string): {
    ownerName: string;
    ownerAvatar: string;
  } {
    const uid = String(ownerUid || '').trim();
    const contact = this.statusContactsByUid.get(uid);

    const contactName = String(contact?.name || '').trim();
    const fallbackName = String(ownerName || '').trim();

    const resolvedName = contactName && contactName.toLowerCase() !== 'unknown'
      ? contactName
      : (fallbackName || 'Unknown');

    const resolvedAvatar = String(contact?.avatar || ownerAvatar || '');

    return {
      ownerName: resolvedName,
      ownerAvatar: resolvedAvatar,
    };
  }

  private cleanupStatusGroups(groups: StatusOwnerGroup[]): StatusOwnerGroup[] {
    return groups
      .map(group => {
        const ownerMeta = this.resolveStatusOwnerMeta(
          group.ownerUid,
          group.ownerName,
          group.ownerAvatar
        );

        const statuses = (group.statuses || [])
          .filter(status => !this.isStatusExpired(status))
          .map(status => ({
            ...status,
            ownerName: ownerMeta.ownerName,
            ownerAvatar: ownerMeta.ownerAvatar,
          }));

        return {
          ...group,
          ownerName: ownerMeta.ownerName,
          ownerAvatar: ownerMeta.ownerAvatar,
          statuses,
          unseenCount: statuses.filter(status => !status.seen).length,
          latestCreatedAt: statuses.reduce(
            (latest, status) => Math.max(latest, Number(status.createdAt || 0)),
            Number(group.latestCreatedAt || 0)
          )
        };
      })
      .filter(group => group.statuses.length > 0)
      .sort((a, b) => {
        const aUnseen = a.unseenCount > 0 ? 1 : 0;
        const bUnseen = b.unseenCount > 0 ? 1 : 0;
        if (aUnseen !== bUnseen) {
          return bUnseen - aUnseen;
        }
        return Number(b.latestCreatedAt || 0) - Number(a.latestCreatedAt || 0);
      });
  }

  private applyStatusFeedToUi(recent: StatusOwnerGroup[], muted: StatusOwnerGroup[], hidden: StatusOwnerGroup[]) {
    this.recentStatusGroups = this.cleanupStatusGroups(recent || []);
    this.mutedStatusGroups = this.cleanupStatusGroups(muted || []);
    this.hiddenStatusGroups = this.cleanupStatusGroups(hidden || []);
    this.cdr.markForCheck();
  }

  private async loadStatusDataFromCache() {
    if (!this.userUid) {
      this.statusFeedReady = true;
      return;
    }

    try {
      const [cachedFeed, cachedMine] = await Promise.all([
        this.statusCache.getFeed(this.userUid),
        this.statusCache.getMyStatuses(this.userUid)
      ]);

      if (cachedFeed) {
        this.applyStatusFeedToUi(
          cachedFeed.recentUpdates,
          cachedFeed.mutedUpdates,
          cachedFeed.hiddenUpdates || []
        );
      }

      this.myStatusList = (cachedMine || []).filter(status => !this.isStatusExpired(status));
    } finally {
      this.statusFeedReady = true;
      this.cdr.markForCheck();
    }
  }

  private async refreshStatusDataFromBackend() {
    if (!this.userUid || !this.networkService.isOnline.value) {
      return;
    }

    const now = Date.now();

    if (this.statusRefreshInFlight) {
      this.statusRefreshQueued = true;
      return;
    }

    if (now - this.lastStatusRefreshAt < this.statusRefreshCooldownMs) {
      return;
    }

    this.statusRefreshInFlight = true;

    this.statusError = '';
    this.cdr.markForCheck();

    try {
      const [feedRes, mineRes] = await Promise.all([
        firstValueFrom(this.statusApi.getFeed(300)),
        firstValueFrom(this.statusApi.getMyStatuses(false))
      ]);

      const recent = feedRes?.recentUpdates || feedRes?.data?.recentUpdates || [];
      const muted = feedRes?.mutedUpdates || feedRes?.data?.mutedUpdates || [];
      const hidden = feedRes?.hiddenUpdates || feedRes?.data?.hiddenUpdates || [];
      const mine = mineRes?.statuses || mineRes?.data?.statuses || [];

      this.applyStatusFeedToUi(recent, muted, hidden);
      this.myStatusList = (mine || []).filter((status: StatusDoc) => !this.isStatusExpired(status));

      await Promise.all([
        this.statusCache.saveFeed(this.userUid, {
          generatedAt: Date.now(),
          recentUpdates: this.recentStatusGroups,
          mutedUpdates: this.mutedStatusGroups,
          hiddenUpdates: this.hiddenStatusGroups,
        }),
        this.statusCache.saveMyStatuses(this.userUid, this.myStatusList),
      ]);

      this.lastStatusRefreshAt = Date.now();
    } catch (error) {
      console.error('Failed to load status feed:', error);
      if (!this.hasAnyStatusUpdates) {
        this.statusError = 'Unable to load updates right now.';
      }
    } finally {
      this.statusFeedReady = true;
      this.statusRefreshInFlight = false;
      this.cdr.markForCheck();

      if (this.statusRefreshQueued) {
        this.statusRefreshQueued = false;
        this.refreshStatusDataFromBackend();
      }
    }
  }

  private async loadStatusContacts(forceSync = false) {
    if (!this.userUid) {
      return;
    }

    try {
      // Local cache: only platform users.
      const sqliteContacts = (await this.sqliteService.getContacts(true)) || [];

      // Network source: matched users from contact sync (Telldemm users only).
      let matchedContacts: any[] = [];
      const shouldSyncMatchedContacts =
        this.networkService.isOnline.value &&
        (
          forceSync ||
          sqliteContacts.length === 0 ||
          Date.now() - this.lastStatusContactSyncAt > this.statusContactSyncCooldownMs
        );

      if (shouldSyncMatchedContacts) {
        try {
          matchedContacts = await this.contactSyncService.getMatchedUsers();
          this.lastStatusContactSyncAt = Date.now();
        } catch (syncError) {
          console.warn('Contact sync fallback failed for status privacy contacts', syncError);
        }
      }

      const merged = [...sqliteContacts, ...matchedContacts];
      const byUid = new Map<string, StatusContactOption>();

      for (const contact of merged) {
        // Strictly keep only Telldemm users.
        if ((contact as any)?.isOnPlatform === false) {
          continue;
        }

        const uid = String(contact?.userId || contact?.user_id || '').trim();
        if (!uid || uid === this.userUid) {
          continue;
        }

        if (!byUid.has(uid)) {
          byUid.set(uid, {
            uid,
            name: String(
              contact?.device_contact_name ||
              contact?.username ||
              contact?.name ||
              contact?.phoneNumber ||
              'Unknown'
            ),
            avatar: String(contact?.avatar || contact?.profile_picture_url || ''),
          });
        }
      }

      this.contactsForPrivacy = Array.from(byUid.values())
        .sort((a, b) => a.name.localeCompare(b.name));

      this.statusContactsByUid = new Map(
        this.contactsForPrivacy.map((contact) => [String(contact.uid), contact])
      );

      // Re-apply names on already rendered groups so existing Unknown labels
      // immediately switch to saved contact names.
      this.applyStatusFeedToUi(
        this.recentStatusGroups,
        this.mutedStatusGroups,
        this.hiddenStatusGroups
      );

      if (this.userUid && this.hasAnyStatusUpdates) {
        await this.statusCache.saveFeed(this.userUid, {
          generatedAt: Date.now(),
          recentUpdates: this.recentStatusGroups,
          mutedUpdates: this.mutedStatusGroups,
          hiddenUpdates: this.hiddenStatusGroups,
        });
      }

      if (this.contactsForPrivacy.length === 0) {
        console.warn('No contacts available for status privacy selection');
      }

      this.cdr.markForCheck();
    } catch (error) {
      console.warn('Failed to load contacts for privacy picker', error);
      this.contactsForPrivacy = [];
      this.cdr.markForCheck();
    }
  }

  private async loadStatusPrivacyDefault() {
    if (!this.userUid) {
      return;
    }

    try {
      if (this.networkService.isOnline.value) {
        const res = await firstValueFrom(this.statusApi.getPrivacyDefault());
        if (!res?.status) {
          throw new Error(res?.message || 'Could not fetch privacy default');
        }
        const fromApi = res?.privacy || res?.data?.privacy;

        if (fromApi?.privacyMode) {
          const privacyUsers = this.normalizePrivacyUsersFromApi(fromApi);
          this.defaultPrivacy = {
            uid: this.userUid,
            privacyMode: fromApi.privacyMode,
            privacyUsers,
          };
          await this.statusCache.savePrivacyDefault(this.userUid, this.defaultPrivacy);
          this.cdr.markForCheck();
          return;
        }
      }

      const cached = await this.statusCache.getPrivacyDefault(this.userUid);
      this.defaultPrivacy = cached || this.statusCache.getFallbackPrivacy(this.userUid);
      this.cdr.markForCheck();
    } catch (error) {
      console.warn('Failed to load default status privacy', error);
      const cached = await this.statusCache.getPrivacyDefault(this.userUid);
      this.defaultPrivacy = cached || this.statusCache.getFallbackPrivacy(this.userUid);
      this.cdr.markForCheck();
    }
  }

  private async loadStatusDrafts() {
    if (!this.userUid) return;
    this.statusDrafts = await this.statusCache.getDrafts(this.userUid);
    this.cdr.markForCheck();
  }

  private async flushPendingSeenQueue() {
    if (!this.userUid || !this.networkService.isOnline.value) {
      return;
    }

    const queue = await this.statusCache.getSeenQueue(this.userUid);
    for (const statusId of queue) {
      try {
        await firstValueFrom(this.statusApi.markViewed(statusId));
        await this.statusCache.dequeueSeen(this.userUid, statusId);
      } catch (error) {
        console.warn('Failed to flush seen status queue:', statusId, error);
      }
    }
  }

  /* =========================
     STATUS: UI ACTIONS
     ========================= */

  trackByStatusOwner(index: number, group: StatusOwnerGroup): string {
    return group.ownerUid;
  }

  trackByStatusId(index: number, status: StatusDoc): string {
    return status.statusId;
  }

  trackByDraftId(index: number, draft: StatusDraft): string {
    return draft.draftId;
  }

  get statusPrivacyLabel(): string {
    if (this.defaultPrivacy.privacyMode === 'my_contacts_except') return 'My Contacts Except...';
    if (this.defaultPrivacy.privacyMode === 'only_share_with') return 'Only Share With...';
    return 'My Contacts';
  }

  get hasAnyStatusUpdates(): boolean {
    return (
      this.recentStatusGroups.length > 0 ||
      this.mutedStatusGroups.length > 0 ||
      this.hiddenStatusGroups.length > 0
    );
  }

  get hasMyStatus(): boolean {
    return this.myStatusList.length > 0;
  }

  get myStatusTimestamp(): number {
    if (!this.myStatusList.length) return 0;
    return this.myStatusList.reduce(
      (latest, status) => Math.max(latest, Number(status.createdAt || 0)),
      0
    );
  }

  formatRelativeTime(ts: number): string {
    if (!ts) return '';

    const diffMs = Date.now() - ts;
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;

    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;

    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  openMyStatus() {
    if (this.myStatusList.length === 0) {
      this.triggerStatusFilePicker();
      return;
    }

    const ownerName = this.authService.authData?.name || 'My Status';
    const ownerAvatar = '';

    this.openStatusViewer(
      {
        ownerUid: this.userUid,
        ownerName,
        ownerAvatar,
        latestCreatedAt: this.myStatusTimestamp,
        unseenCount: 0,
        statuses: [...this.myStatusList],
      },
      true
    );
  }

  triggerStatusFilePicker() {
    if (!this.statusFileInput?.nativeElement) return;
    this.statusFileInput.nativeElement.value = '';
    this.statusFileInput.nativeElement.click();
  }

  onStatusFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target?.files?.[0];

    if (!file) {
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
    if (!allowed.includes(file.type)) {
      this.presentToast('Only JPG, PNG, WEBP, and MP4 are allowed.');
      return;
    }

    this.composerFile = file;
    this.composerCaption = '';
    this.composerPreviewUrl = URL.createObjectURL(file);
    this.composerOpen = true;
    this.cdr.markForCheck();
  }

  closeComposer() {
    if (this.composerPreviewUrl) {
      URL.revokeObjectURL(this.composerPreviewUrl);
    }

    this.composerOpen = false;
    this.composerFile = null;
    this.composerCaption = '';
    this.composerPreviewUrl = '';
    this.composerPosting = false;
    this.cdr.markForCheck();
  }

  async openDefaultPrivacySettings() {
    await this.loadStatusContacts(true);

    const modal = await this.modalCtrl.create({
      component: StatusPrivacyModalComponent,
      componentProps: {
        title: 'Default Status Privacy',
        mode: this.defaultPrivacy.privacyMode,
        users: this.defaultPrivacy.privacyUsers,
        contacts: this.contactsForPrivacy,
        onSelectionChange: async (selection: { privacyMode: StatusPrivacyMode; privacyUsers: Record<string, true> }) => {
          await this.applyDefaultPrivacySelection(selection);
        },
      },
      breakpoints: [0, 0.9],
      initialBreakpoint: 0.9,
    });

    await modal.present();
    const { data } = await modal.onDidDismiss();

    if (data?.privacyMode) {
      await this.applyDefaultPrivacySelection({
        privacyMode: data.privacyMode,
        privacyUsers: data.privacyUsers || {},
      });
    }

    this.cdr.markForCheck();
  }

  private isSamePrivacySelection(
    a: { privacyMode: StatusPrivacyMode; privacyUsers: Record<string, true> },
    b: { privacyMode: StatusPrivacyMode; privacyUsers: Record<string, true> }
  ): boolean {
    if (a.privacyMode !== b.privacyMode) {
      return false;
    }

    const aUsers = Object.keys(a.privacyUsers || {}).filter((uid) => a.privacyUsers[uid]);
    const bUsers = Object.keys(b.privacyUsers || {}).filter((uid) => b.privacyUsers[uid]);

    if (aUsers.length !== bUsers.length) {
      return false;
    }

    const bSet = new Set(bUsers);
    return aUsers.every((uid) => bSet.has(uid));
  }

  private async applyDefaultPrivacySelection(selection: {
    privacyMode: StatusPrivacyMode;
    privacyUsers: Record<string, true>;
  }) {
    if (!this.userUid) {
      return;
    }

    const nextSelection = {
      privacyMode: selection.privacyMode,
      privacyUsers: { ...(selection.privacyUsers || {}) },
    };

    const currentSelection = {
      privacyMode: this.defaultPrivacy.privacyMode,
      privacyUsers: { ...(this.defaultPrivacy.privacyUsers || {}) },
    };

    if (this.isSamePrivacySelection(currentSelection, nextSelection)) {
      return;
    }

    this.defaultPrivacy = {
      uid: this.userUid,
      privacyMode: nextSelection.privacyMode,
      privacyUsers: nextSelection.privacyUsers,
    };

    await this.statusCache.savePrivacyDefault(this.userUid, this.defaultPrivacy);
    this.cdr.markForCheck();

    await this.queuePrivacyDefaultSync(nextSelection);
  }

  private async queuePrivacyDefaultSync(selection: {
    privacyMode: StatusPrivacyMode;
    privacyUsers: Record<string, true>;
  }) {
    this.pendingPrivacySync = {
      privacyMode: selection.privacyMode,
      privacyUsers: { ...(selection.privacyUsers || {}) },
    };

    if (this.isSyncingPrivacy) {
      return;
    }

    this.isSyncingPrivacy = true;

    while (this.pendingPrivacySync) {
      const next = this.pendingPrivacySync;
      this.pendingPrivacySync = null;

      if (!this.networkService.isOnline.value) {
        if (!this.hasShownPrivacyOfflineHint) {
          this.hasShownPrivacyOfflineHint = true;
          this.presentToast('Privacy setting saved locally. It will sync when internet is back.');
        }
        this.pendingPrivacySync = next;
        break;
      }

      this.hasShownPrivacyOfflineHint = false;

      try {
        const res = await firstValueFrom(
          this.statusApi.savePrivacyDefault({
            privacyMode: next.privacyMode,
            privacyUsers: next.privacyUsers,
          })
        );

        if (!res?.status) {
          throw new Error(res?.message || 'Could not save privacy default');
        }

        const fromApi = res?.privacy || res?.data?.privacy;
        if (fromApi?.privacyMode) {
          const privacyUsers = this.normalizePrivacyUsersFromApi(fromApi);
          this.defaultPrivacy = {
            uid: this.userUid,
            privacyMode: fromApi.privacyMode,
            privacyUsers,
          };
          await this.statusCache.savePrivacyDefault(this.userUid, this.defaultPrivacy);
          this.cdr.markForCheck();
        }
      } catch (error) {
        const errorMessage = this.extractHttpErrorMessage(error);
        console.error('Failed to save status privacy default', errorMessage, error);
        this.presentToast(errorMessage || 'Could not sync privacy default right now.');
      }
    }

    this.isSyncingPrivacy = false;
  }

  private normalizePrivacyUsersFromApi(fromApi: any): Record<string, true> {
    const mapSource = fromApi?.privacyUsersMap || fromApi?.privacyUsers;
    if (mapSource && typeof mapSource === 'object' && !Array.isArray(mapSource)) {
      const normalized: Record<string, true> = {};
      Object.entries(mapSource).forEach(([uid, allowed]) => {
        if (allowed) {
          normalized[String(uid)] = true;
        }
      });
      return normalized;
    }

    const arraySource =
      fromApi?.privacyUsersArray ||
      (Array.isArray(fromApi?.privacyUsers) ? fromApi.privacyUsers : []);

    const normalized: Record<string, true> = {};
    (arraySource || []).forEach((uid: any) => {
      const key = String(uid || '').trim();
      if (key) {
        normalized[key] = true;
      }
    });
    return normalized;
  }

  private extractHttpErrorMessage(error: any): string {
    return (
      error?.error?.message ||
      error?.error?.error ||
      error?.message ||
      ''
    );
  }

  async postComposerStatus() {
    if (!this.composerFile || !this.userUid || this.composerPosting) {
      return;
    }

    if (!this.networkService.isOnline.value) {
      await this.statusCache.saveDraft(this.userUid, {
        caption: this.composerCaption || '',
        fileName: this.composerFile.name,
        fileType: this.composerFile.type,
        fileSize: this.composerFile.size,
        privacyMode: this.defaultPrivacy.privacyMode,
        privacyUsers: this.defaultPrivacy.privacyUsers,
      });

      this.presentToast('You are offline. Status saved as draft.');
      await this.loadStatusDrafts();
      this.closeComposer();
      return;
    }

    this.composerPosting = true;
    this.cdr.markForCheck();

    try {
      // Keep contact graph fresh so newly posted status respects latest add/remove contact changes.
      await this.contactSyncService.getMatchedUsers();
      this.lastStatusContactSyncAt = Date.now();

      const presignRes = await firstValueFrom(this.statusApi.presignUpload(this.composerFile));
      const uploadUrl = presignRes?.uploadUrl || presignRes?.upload_url || '';
      const fileKey = presignRes?.fileKey || presignRes?.file_key || '';

      if (!presignRes?.status || !uploadUrl || !fileKey) {
        throw new Error(presignRes?.message || 'Could not generate upload URL');
      }

      const uploadResult = await this.statusApi.putFileToPresignedUrl(
        uploadUrl,
        this.composerFile
      );

      if (!uploadResult.ok) {
        throw new Error('Upload failed');
      }

      const ownerName = this.authService.authData?.name || '';

      await firstValueFrom(
        this.statusApi.createStatus({
          ownerName,
          mediaType: presignRes.mediaType === 'video' ? 'video' : 'image',
          caption: this.composerCaption,
          fileKey,
          allowReplies: true,
          privacyMode: this.defaultPrivacy.privacyMode,
          privacyUsers: this.defaultPrivacy.privacyUsers,
        })
      );

      this.presentToast('Status posted successfully.');
      this.closeComposer();
      await Promise.all([
        this.refreshStatusDataFromBackend(),
        this.loadStatusDrafts(),
      ]);
    } catch (error) {
      console.error('Failed to post status', error);
      this.presentToast('Failed to post status. Please try again.');
      this.composerPosting = false;
      this.cdr.markForCheck();
    }
  }

  async deleteDraft(draft: StatusDraft) {
    if (!this.userUid) return;
    await this.statusCache.deleteDraft(this.userUid, draft.draftId);
    await this.loadStatusDrafts();
  }

  async openStatusOwnerMenu(group: StatusOwnerGroup, fromMutedSection: boolean, fromHiddenSection = false) {
    const isMuted = fromMutedSection || this.mutedStatusGroups.some(g => g.ownerUid === group.ownerUid);
    const isHidden = fromHiddenSection || this.hiddenStatusGroups.some(g => g.ownerUid === group.ownerUid);

    const buttons: any[] = [];

    buttons.push({
      text: isMuted ? 'Unmute' : 'Mute',
      handler: async () => {
        await this.toggleMutedOwner(group.ownerUid, !isMuted);
      }
    });

    buttons.push(
      isHidden
        ? {
          text: 'Unhide this contact\'s status',
          handler: async () => {
            await this.toggleHiddenOwner(group.ownerUid, false);
          }
        }
        : {
          text: 'Hide this contact\'s status',
          role: 'destructive',
          handler: async () => {
            await this.toggleHiddenOwner(group.ownerUid, true);
          }
        }
    );

    buttons.push({
      text: 'Cancel',
      role: 'cancel'
    });

    const actionSheet = await this.actionSheetCtrl.create({
      header: group.ownerName || 'Status',
      buttons
    });

    await actionSheet.present();
  }
  private async toggleMutedOwner(ownerUid: string, muted: boolean) {
    if (!ownerUid) return;

    if (!this.networkService.isOnline.value) {
      this.presentToast('Connect to internet to update mute settings.');
      return;
    }

    try {
      if (muted) {
        await firstValueFrom(this.statusApi.muteOwner(ownerUid));
      } else {
        await firstValueFrom(this.statusApi.unmuteOwner(ownerUid));
      }

      const fromRecent = this.recentStatusGroups.find(group => group.ownerUid === ownerUid);
      const fromMuted = this.mutedStatusGroups.find(group => group.ownerUid === ownerUid);

      if (muted && fromRecent) {
        this.recentStatusGroups = this.recentStatusGroups.filter(group => group.ownerUid !== ownerUid);
        this.mutedStatusGroups = this.cleanupStatusGroups([...this.mutedStatusGroups, fromRecent]);
      }

      if (!muted && fromMuted) {
        this.mutedStatusGroups = this.mutedStatusGroups.filter(group => group.ownerUid !== ownerUid);
        this.recentStatusGroups = this.cleanupStatusGroups([...this.recentStatusGroups, fromMuted]);
      }

      await this.statusCache.saveFeed(this.userUid, {
        generatedAt: Date.now(),
        recentUpdates: this.recentStatusGroups,
        mutedUpdates: this.mutedStatusGroups,
        hiddenUpdates: this.hiddenStatusGroups,
      });

      this.presentToast(muted ? 'Status muted.' : 'Status unmuted.');
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Failed to toggle mute status owner', error);
      this.presentToast('Could not update mute status.');
    }
  }

  private async toggleHiddenOwner(ownerUid: string, hidden: boolean) {
    if (!ownerUid) return;

    if (!this.networkService.isOnline.value) {
      this.presentToast('Connect to internet to update hidden statuses.');
      return;
    }

    try {
      if (hidden) {
        await firstValueFrom(this.statusApi.hideOwner(ownerUid));
      } else {
        await firstValueFrom(this.statusApi.unhideOwner(ownerUid));
      }

      const fromRecent = this.recentStatusGroups.find(group => group.ownerUid === ownerUid);
      const fromMuted = this.mutedStatusGroups.find(group => group.ownerUid === ownerUid);
      const fromHidden = this.hiddenStatusGroups.find(group => group.ownerUid === ownerUid);

      if (hidden) {
        const source = fromRecent || fromMuted;
        this.recentStatusGroups = this.recentStatusGroups.filter(group => group.ownerUid !== ownerUid);
        this.mutedStatusGroups = this.mutedStatusGroups.filter(group => group.ownerUid !== ownerUid);
        this.hiddenStatusGroups = this.hiddenStatusGroups.filter(group => group.ownerUid !== ownerUid);

        if (source) {
          this.hiddenStatusGroups = this.cleanupStatusGroups([...this.hiddenStatusGroups, source]);
        }
      } else if (fromHidden) {
        this.hiddenStatusGroups = this.hiddenStatusGroups.filter(group => group.ownerUid !== ownerUid);
        this.recentStatusGroups = this.cleanupStatusGroups([...this.recentStatusGroups, fromHidden]);
      }

      await this.statusCache.saveFeed(this.userUid, {
        generatedAt: Date.now(),
        recentUpdates: this.recentStatusGroups,
        mutedUpdates: this.mutedStatusGroups,
        hiddenUpdates: this.hiddenStatusGroups,
      });

      this.presentToast(hidden ? 'Contact status hidden.' : 'Contact status unhidden.');
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Failed to update hidden owner statuses', error);
      this.presentToast('Could not update hidden statuses right now.');
    }
  }

  /* =========================
     STATUS: FULLSCREEN VIEWER
     ========================= */

  private getActiveViewerStatuses(group: StatusOwnerGroup): StatusDoc[] {
    return (group.statuses || [])
      .filter((status) => !this.isStatusExpired(status))
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }

  private buildViewerOwnerQueue(group: StatusOwnerGroup, isOwner: boolean): StatusOwnerGroup[] {
    if (isOwner) {
      const statuses = this.getActiveViewerStatuses(group);
      if (statuses.length === 0) {
        return [];
      }

      return [
        {
          ...group,
          statuses,
          unseenCount: 0,
          latestCreatedAt: statuses.reduce(
            (latest, status) => Math.max(latest, Number(status.createdAt || 0)),
            Number(group.latestCreatedAt || 0)
          ),
        },
      ];
    }

    const source = [...this.recentStatusGroups, ...this.mutedStatusGroups, ...this.hiddenStatusGroups];
    const queue: StatusOwnerGroup[] = [];
    const seenOwners = new Set<string>();

    for (const item of source) {
      const ownerUid = String(item.ownerUid || '').trim();
      if (!ownerUid || seenOwners.has(ownerUid)) {
        continue;
      }

      const statuses = this.getActiveViewerStatuses(item);
      if (statuses.length === 0) {
        continue;
      }

      seenOwners.add(ownerUid);
      queue.push({
        ...item,
        statuses,
        unseenCount: statuses.filter((status) => !status.seen).length,
        latestCreatedAt: statuses.reduce(
          (latest, status) => Math.max(latest, Number(status.createdAt || 0)),
          Number(item.latestCreatedAt || 0)
        ),
      });
    }

    const selectedOwnerUid = String(group.ownerUid || '').trim();
    if (selectedOwnerUid && !seenOwners.has(selectedOwnerUid)) {
      const selectedStatuses = this.getActiveViewerStatuses(group);
      if (selectedStatuses.length > 0) {
        queue.push({
          ...group,
          statuses: selectedStatuses,
          unseenCount: selectedStatuses.filter((status) => !status.seen).length,
          latestCreatedAt: selectedStatuses.reduce(
            (latest, status) => Math.max(latest, Number(status.createdAt || 0)),
            Number(group.latestCreatedAt || 0)
          ),
        });
      }
    }

    return queue;
  }

  private async loadViewerOwnerGroup(
    queueIndex: number,
    startMode: 'first-unseen' | 'first' | 'last' = 'first-unseen'
  ): Promise<boolean> {
    if (queueIndex < 0 || queueIndex >= this.viewerOwnerQueue.length) {
      return false;
    }

    const target = this.viewerOwnerQueue[queueIndex];
    const statuses = this.getActiveViewerStatuses(target);
    if (statuses.length === 0) {
      return false;
    }

    this.stopViewerTimer();

    this.viewerOwnerQueueIndex = queueIndex;
    this.viewerStatusGroup = target;
    this.viewerOwnerName = target.ownerName || (this.viewerOpenedAsOwner ? 'My Status' : 'Status');
    this.viewerOwnerAvatar = target.ownerAvatar || '';
    this.viewerStatuses = statuses;
    this.viewerProgressBars = new Array(statuses.length).fill(0);
    this.viewerReplyText = '';
    this.viewerPaused = false;
    this.viewerMediaReady = false;
    this.viewerMediaLoading = true;
    this.viewerMediaSrc = '';

    let startIndex = 0;
    if (startMode === 'last') {
      startIndex = statuses.length - 1;
    } else if (startMode === 'first-unseen') {
      const firstUnseen = statuses.findIndex((status) => !status.seen);
      startIndex = firstUnseen >= 0 ? firstUnseen : 0;
    }

    await this.loadViewerStatus(startIndex);
    return true;
  }

  async openStatusViewer(group: StatusOwnerGroup, isOwner = false) {
    const queue = this.buildViewerOwnerQueue(group, isOwner);
    if (queue.length === 0) {
      return;
    }

    const ownerUid = String(group.ownerUid || (group as any).ownerId || '').trim();
    const viewerUserUid = String(this.userUid || this.userId || '').trim();

    this.viewerOpenedAsOwner = isOwner;
    this.viewerIsOwner = isOwner || (!!ownerUid && ownerUid === viewerUserUid);
    this.viewerOwnerQueue = queue;

    const selectedOwnerUid = String(group.ownerUid || '').trim();
    const queueIndex = queue.findIndex((item) => String(item.ownerUid || '').trim() === selectedOwnerUid);
    const startQueueIndex = queueIndex >= 0 ? queueIndex : 0;
    const startMode = 'first-unseen';

    this.isViewerOpen = true;
    this.cdr.markForCheck();
    await this.loadViewerOwnerGroup(startQueueIndex, startMode);
  }

  private get myUserId(): string {
    return String(this.userUid || this.userId || '');
  }

  async loadViewerStatus(index: number) {
    await this.setViewerIndex(index);
  }

  async setViewerIndex(index: number) {
    if (index < 0 || index >= this.viewerStatuses.length) {
      return;
    }

    this.viewerStatusIndex = index;
    this.viewerCurrentIndex = index;
    this.currentViewerStatus = this.viewerStatuses[index] || null;
    this.viewerElapsed = 0;
    this.viewerPaused = false;
    this.viewerMediaReady = !!this.currentViewerStatus?.mediaUrl;
    this.viewerMediaLoading = !!this.currentViewerStatus;

    for (let i = 0; i < this.viewerProgressBars.length; i++) {
      if (i < index) {
        this.viewerProgressBars[i] = 100;
      } else if (i === index) {
        this.viewerProgressBars[i] = 0;
      } else if (i > index) {
        this.viewerProgressBars[i] = 0;
      }
    }

    this.closeOwnerViewsSheet();

    await this.ensureViewerMediaAvailability();
    await this.markCurrentStatusAsSeen();

    if (!this.viewerMediaReady) {
      this.stopViewerTimer();
    }

    this.cdr.markForCheck();
  }

  startViewerTimer() {
    this.stopViewerTimer();

    const current = this.currentViewerStatus;
    if (!current) {
      return;
    }

    this.viewerPaused = false;
    this.viewerTimer = setInterval(() => {
      if (!this.isViewerOpen || this.viewerPaused || !this.viewerMediaReady || this.viewerMediaLoading) {
        return;
      }

      this.viewerElapsed += this.viewerStepMs;
      const pct = Math.min((this.viewerElapsed / this.viewerDurationMs) * 100, 100);
      this.viewerProgressBars[this.viewerCurrentIndex] = pct;

      if (pct >= 100) {
        this.stopViewerTimer();
        this.goToNextStatus();
      }

      this.cdr.markForCheck();
    }, this.viewerStepMs);
  }

  stopViewerTimer() {
    if (this.viewerTimer) {
      clearInterval(this.viewerTimer);
      this.viewerTimer = null;
    }
  }

  private startViewerProgress() {
    this.startViewerTimer();
  }

  private stopViewerProgress() {
    this.stopViewerTimer();
  }

  pauseViewerTimer() {
    this.viewerPaused = true;
    this.viewerVideoRef?.nativeElement?.pause();
  }

  resumeViewerTimer() {
    this.viewerPaused = false;
    this.viewerVideoRef?.nativeElement?.play().catch(() => { });
  }

  async goToPreviousStatus(event?: Event) {
    event?.stopPropagation();

    if (this.viewerStatusIndex > 0) {
      await this.setViewerIndex(this.viewerStatusIndex - 1);
      return;
    }

    if (this.viewerOpenedAsOwner) {
      return;
    }

    if (this.viewerOwnerQueueIndex <= 0) {
      return;
    }

    await this.loadViewerOwnerGroup(this.viewerOwnerQueueIndex - 1, 'last');
  }

  async goToNextStatus(event?: Event) {
    event?.stopPropagation();

    if (this.viewerStatusIndex < this.viewerStatuses.length - 1) {
      await this.setViewerIndex(this.viewerStatusIndex + 1);
      return;
    }

    if (this.viewerOpenedAsOwner) {
      this.closeStatusViewer();
      return;
    }

    if (this.viewerOwnerQueueIndex >= this.viewerOwnerQueue.length - 1) {
      this.closeStatusViewer();
      return;
    }

    await this.loadViewerOwnerGroup(this.viewerOwnerQueueIndex + 1, 'first-unseen');
  }

  closeStatusViewer() {
    this.stopViewerTimer();

    this.isViewerOpen = false;
    this.isViewsSheetOpen = false;
    this.isLoadingOwnerViews = false;
    this.ownerStatusViews = [];
    this.viewerStatuses = [];
    this.viewerProgressBars = [];
    this.viewerStatusIndex = 0;
    this.viewerCurrentIndex = 0;
    this.viewerReplyText = '';
    this.viewerPaused = false;
    this.viewerMediaReady = false;
    this.viewerMediaLoading = true;
    this.viewerMediaSrc = '';
    this.currentViewerStatus = null;
    this.viewerStatusGroup = null;
    this.viewerIsOwner = false;
    this.viewerOwnerQueue = [];
    this.viewerOwnerQueueIndex = 0;
    this.viewerOpenedAsOwner = false;
    this.viewerElapsed = 0;
    this.viewerDurationMs = 5000;
    this.isHolding = false;
    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
      this.holdTimeout = null;
    }
    this.cdr.markForCheck();
  }

  onViewerHoldStart() {
    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
      this.holdTimeout = null;
    }

    this.holdTimeout = setTimeout(() => {
      this.isHolding = true;
      this.pauseViewerTimer();
      this.cdr.markForCheck();
    }, 150);
  }

  onViewerHoldEnd() {
    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
      this.holdTimeout = null;
    }

    if (this.isHolding) {
      this.isHolding = false;
      this.resumeViewerTimer();
    }

    this.cdr.markForCheck();
  }

  onViewerTouchStart(event: TouchEvent) {
    this.viewerSwipeStartX = event.changedTouches?.[0]?.clientX || 0;
    this.viewerSwipeStartY = event.changedTouches?.[0]?.clientY || 0;
  }

  onViewerPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    this.viewerSwipeStartX = event.clientX || 0;
    this.viewerSwipeStartY = event.clientY || 0;
  }

  onViewerTouchEnd(event: TouchEvent) {
    const endX = event.changedTouches?.[0]?.clientX || 0;
    const endY = event.changedTouches?.[0]?.clientY || 0;
    const deltaX = endX - this.viewerSwipeStartX;
    const deltaY = endY - this.viewerSwipeStartY;

    this.handleViewerGesture(deltaX, deltaY);
  }

  onViewerPointerUp(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    const endX = event.clientX || 0;
    const endY = event.clientY || 0;
    const deltaX = endX - this.viewerSwipeStartX;
    const deltaY = endY - this.viewerSwipeStartY;

    this.handleViewerGesture(deltaX, deltaY);
  }

  private handleViewerGesture(deltaX: number, deltaY: number) {
    if (!this.isViewerOpen) {
      return;
    }

    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (absDeltaX >= this.viewerHorizontalSwipeThreshold && absDeltaX > absDeltaY) {
      if (deltaX < 0) {
        this.goToNextStatus();
      } else {
        this.goToPreviousStatus();
      }
      return;
    }

    if (
      this.viewerIsOwner &&
      deltaY < -this.viewerVerticalOpenThreshold &&
      absDeltaY > absDeltaX
    ) {
      this.openOwnerViewsSheet();
      return;
    }

    if (deltaY > this.viewerVerticalCloseThreshold && absDeltaY > absDeltaX) {
      this.closeStatusViewer();
    }
  }

  trackByStatusView(index: number, view: StatusViewDoc): string {
    return `${view.viewerUid}-${view.viewedAt}`;
  }

  async openOwnerViewsSheet() {
    if (!this.viewerIsOwner) {
      return;
    }

    const current = this.currentViewerStatus;
    if (!current?.statusId) {
      return;
    }

    this.isViewsSheetOpen = true;
    this.isLoadingOwnerViews = true;
    this.ownerStatusViews = [];
    this.cdr.markForCheck();

    if (!this.networkService.isOnline.value) {
      this.isLoadingOwnerViews = false;
      this.presentToast('Connect to internet to load views.');
      this.cdr.markForCheck();
      return;
    }

    try {
      if (this.contactsForPrivacy.length === 0) {
        await this.loadStatusContacts(true);
      }

      const res = await firstValueFrom(this.statusApi.getStatusViews(current.statusId));
      const views = res?.views || res?.data?.views || [];

      const contactsByUid = new Map(
        (this.contactsForPrivacy || []).map((contact) => [String(contact.uid), contact])
      );

      this.ownerStatusViews = (views || []).map((view: StatusViewDoc) => {
        const uid = String(view.viewerUid || '').trim();
        const contact = contactsByUid.get(uid);

        return {
          ...view,
          viewerUid: uid,
          viewerName: contact?.name || uid || 'Unknown',
          viewerAvatar: contact?.avatar || '',
        };
      });
    } catch (error) {
      console.error('Failed to load status views', error);
      this.presentToast('Could not load views right now.');
    } finally {
      this.isLoadingOwnerViews = false;
      this.cdr.markForCheck();
    }
  }

  closeOwnerViewsSheet() {
    this.isViewsSheetOpen = false;
    this.isLoadingOwnerViews = false;
    this.ownerStatusViews = [];
    this.cdr.markForCheck();
  }

  async openViewerStatusMenu() {
    if (!this.viewerIsOwner || !this.currentViewerStatus) {
      return;
    }

    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Status options',
      buttons: [
        {
          text: 'Delete status',
          role: 'destructive',
          icon: 'trash-outline',
          handler: async () => {
            await this.deleteCurrentViewerStatus();
          },
        },
        {
          text: 'Cancel',
          role: 'cancel',
        },
      ],
    });

    await actionSheet.present();
  }

  private async deleteCurrentViewerStatus() {
    const status = this.currentViewerStatus;
    if (!this.viewerIsOwner || !status?.statusId) {
      return;
    }

    if (!this.networkService.isOnline.value) {
      this.presentToast('Connect to internet to delete status.');
      return;
    }

    try {
      const response = await firstValueFrom(this.statusApi.deleteStatus(status.statusId));
      if (response?.status === false) {
        throw new Error(response?.message || 'Could not delete status');
      }

      const deletedStatusId = status.statusId;
      const deletedIndex = this.viewerStatusIndex;

      this.closeOwnerViewsSheet();

      this.myStatusList = this.myStatusList.filter((item) => item.statusId !== deletedStatusId);
      this.viewerStatuses = this.viewerStatuses.filter((item) => item.statusId !== deletedStatusId);
      this.viewerProgressBars = new Array(this.viewerStatuses.length).fill(0);

      if (this.userUid) {
        await this.statusCache.saveMyStatuses(this.userUid, this.myStatusList);
      }

      if (this.viewerStatuses.length === 0) {
        this.closeStatusViewer();
      } else {
        const nextIndex = Math.min(deletedIndex, this.viewerStatuses.length - 1);
        await this.setViewerIndex(nextIndex);
      }

      this.presentToast('Status deleted.');
      this.refreshStatusDataFromBackend();
    } catch (error) {
      console.error('Failed to delete status', error);
      this.presentToast('Could not delete status right now.');
    }
  }

  private async ensureViewerMediaAvailability() {
    const status = this.currentViewerStatus;
    if (!status) {
      this.viewerMediaReady = true;
      this.viewerMediaLoading = false;
      this.viewerMediaSrc = '';
      return;
    }

    if (!status.mediaUrl) {
      this.viewerMediaReady = false;
      this.viewerMediaLoading = false;
      this.viewerMediaSrc = '';
      return;
    }

    if (this.isStatusExpired(status)) {
      this.viewerMediaReady = false;
      this.viewerMediaLoading = false;
      this.viewerMediaSrc = '';
      return;
    }

    const cachedMediaUri = await this.statusCache.getCachedMediaUri(this.userUid, status.mediaUrl);
    if (cachedMediaUri) {
      this.viewerMediaReady = true;
      this.viewerMediaLoading = true;
      this.viewerMediaSrc = Capacitor.convertFileSrc(cachedMediaUri);
      return;
    }

    if (this.networkService.isOnline.value) {
      this.viewerMediaReady = true;
      this.viewerMediaLoading = true;
      this.viewerMediaSrc = status.mediaUrl;
      return;
    }

    this.viewerMediaReady = false;
    this.viewerMediaLoading = false;
    this.viewerMediaSrc = '';
  }

  async onViewerMediaLoaded() {
    const status = this.currentViewerStatus;
    if (!status) return;

    this.viewerMediaLoading = false;
    this.viewerMediaReady = true;

    if (status.mediaType === 'video' && this.viewerVideoRef?.nativeElement) {
      const vid = this.viewerVideoRef.nativeElement;
      const durationSec = Number(vid.duration || 0);
      this.viewerDurationMs = durationSec > 0 ? durationSec * 1000 : 10_000;
    } else {
      this.viewerDurationMs = 5_000;
    }

    this.startViewerTimer();

    const usingRemoteSource = this.viewerMediaSrc === status.mediaUrl;
    if (usingRemoteSource && this.networkService.isOnline.value) {
      void this.statusCache
        .cacheMediaFromUrl(this.userUid, status.mediaUrl, status.mediaType)
        .catch((error) => {
          console.warn('Failed to cache status media locally', error);
        });
    }

    this.cdr.markForCheck();
  }

  onViewerMediaError() {
    const status = this.currentViewerStatus;
    if (!status) {
      return;
    }

    const usingRemoteSource = this.viewerMediaSrc === status.mediaUrl;

    if (!usingRemoteSource && this.networkService.isOnline.value) {
      this.viewerMediaSrc = status.mediaUrl;
      this.viewerMediaReady = true;
      this.viewerMediaLoading = true;
      this.cdr.markForCheck();
      return;
    }

    this.stopViewerTimer();
    this.viewerMediaLoading = false;
    this.viewerMediaReady = false;
    this.cdr.markForCheck();
  }

  private async markCurrentStatusAsSeen() {
    const status = this.currentViewerStatus;
    if (!status || this.viewerIsOwner || status.seen) {
      return;
    }

    status.seen = true;
    this.recentStatusGroups = this.recentStatusGroups.map(group => ({
      ...group,
      unseenCount: group.statuses.filter(s => !s.seen).length,
    }));
    this.mutedStatusGroups = this.mutedStatusGroups.map(group => ({
      ...group,
      unseenCount: group.statuses.filter(s => !s.seen).length,
    }));
    this.cdr.markForCheck();

    if (!this.networkService.isOnline.value) {
      await this.statusCache.enqueueSeen(this.userUid, status.statusId);
      return;
    }

    try {
      await firstValueFrom(this.statusApi.markViewed(status.statusId));
    } catch (error) {
      console.warn('Failed to mark status seen, queued for retry', error);
      await this.statusCache.enqueueSeen(this.userUid, status.statusId);
    }
  }

  async sendViewerReply() {
    const status = this.currentViewerStatus;
    const replyText = this.viewerReplyText.trim();

    if (!status || !replyText) {
      return;
    }

    if (!status.allowReplies) {
      this.presentToast('Replies are disabled for this status.');
      return;
    }

    if (!this.networkService.isOnline.value) {
      this.presentToast('Connect to internet to send a reply.');
      return;
    }

    try {
      await firstValueFrom(
        this.statusApi.replyToStatus(status.statusId, {
          replyText,
        })
      );
      this.viewerReplyText = '';
      status.replyCount = Number(status.replyCount || 0) + 1;
      this.presentToast('Reply sent.');
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Failed to send status reply', error);
      this.presentToast('Could not send reply right now.');
    }
  }

  async sendViewerReaction(reaction: string) {
    const status = this.currentViewerStatus;
    if (!status) return;

    if (!status.allowReplies) {
      this.presentToast('Replies are disabled for this status.');
      return;
    }

    if (!this.networkService.isOnline.value) {
      this.presentToast('Connect to internet to react to this status.');
      return;
    }

    try {
      await firstValueFrom(
        this.statusApi.replyToStatus(status.statusId, {
          reaction,
        })
      );
      status.replyCount = Number(status.replyCount || 0) + 1;
      this.presentToast('Reaction sent.');
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Failed to send status reaction', error);
      this.presentToast('Could not send reaction right now.');
    }
  }

  /* =========================
     MANUAL REFRESH
     ========================= */

  async reload() {
    await this.loadFromCache();
    this.syncFromBackend();
    await this.refreshStatusDataFromBackend();
  }

  /* =========================
     FILTERED CHANNELS UPDATE
     ========================= */

  private updateFilteredChannelsInPlace() {
    this.scheduleUpdate(() => {
      const shouldBeFiltered = this.publicChannels.filter(
        ch => !this.followedChannelIds.has(ch.channel_id)
      );

      const shouldBeFilteredIds = new Set(shouldBeFiltered.map(c => c.channel_id));

      // Remove channels that shouldn't be there
      for (let i = this.filteredChannels.length - 1; i >= 0; i--) {
        if (!shouldBeFilteredIds.has(this.filteredChannels[i].channel_id)) {
          this.filteredChannels.splice(i, 1);
        }
      }

      // Add new channels
      const existingIds = new Set(this.filteredChannels.map(c => c.channel_id));
      for (const channel of shouldBeFiltered) {
        if (!existingIds.has(channel.channel_id)) {
          this.filteredChannels.push(channel);
        }
      }

      // Update existing channels
      const channelMap = new Map(shouldBeFiltered.map(c => [c.channel_id, c]));
      for (const filtered of this.filteredChannels) {
        const updated = channelMap.get(filtered.channel_id);
        if (updated) {
          Object.assign(filtered, updated);
        }
      }
    });
  }

  /* =========================
     FOLLOW / UNFOLLOW (Optimistic)
     ========================= */

  isFollowing(channel: Channel): boolean {
    return this.followedChannelIds.has(channel.channel_id);
  }

  getDisplayFollowersCount(ch: Channel): number {
    const base = Number(ch.followers_count ?? 0);
    // Check if user is owner either by created_by field OR by checking if channel is in myChannels
    const isOwnerByCreatedBy = String(ch.created_by) === String(this.userId);
    const isOwnerByMyChannels = this.myChannels.some(c => c.channel_id === ch.channel_id);
    const isOwner = isOwnerByCreatedBy || isOwnerByMyChannels;
    if (isOwner) {
      const adjusted = base - 1;
      return adjusted > 0 ? adjusted : 0;
    }
    return base;
  }

  onFollowClick(ev: Event, channel: Channel) {
    ev.stopPropagation();
    this.toggleFollow(channel);
  }

  async toggleFollow(channel: Channel) {
    const wasFollowing = this.isFollowing(channel);

    // 1️⃣ Optimistic UI update
    if (wasFollowing) {
      const idx = this.myChannels.findIndex(ch => ch.channel_id === channel.channel_id);
      if (idx !== -1) {
        this.myChannels.splice(idx, 1);
      }
      this.followedChannelIds.delete(channel.channel_id);

      if (!this.publicChannels.find(ch => ch.channel_id === channel.channel_id)) {
        this.publicChannels.push(channel);
      }
    } else {
      this.myChannels.push(channel);
      this.followedChannelIds.add(channel.channel_id);

      const idx = this.publicChannels.findIndex(ch => ch.channel_id === channel.channel_id);
      if (idx !== -1) {
        this.publicChannels.splice(idx, 1);
      }
    }

    this.updateFilteredChannelsInPlace();

    // 2️⃣ Update PouchDB immediately
    if (wasFollowing) {
      await this.pouchDb.saveMyChannels(
        this.userId,
        this.myChannels
      );
      await this.pouchDb.saveDiscoverChannels(
        this.userId,
        this.publicChannels
      );
    } else {
      await this.pouchDb.saveMyChannels(
        this.userId,
        this.myChannels
      );
      await this.pouchDb.saveDiscoverChannels(
        this.userId,
        this.publicChannels
      );
    }

    // 3️⃣ Queue action if offline
    if (!navigator.onLine) {
      await this.pouchDb.enqueueAction({
        type: wasFollowing ? 'channel_unfollow' : 'channel_follow',
        channelId: String(channel.channel_id),
        data: {
          userId: this.userId,
          channel: wasFollowing ? undefined : channel,
          channelId: wasFollowing ? channel.channel_id : undefined
        },
        timestamp: Date.now()
      });

      this.presentToast(
        `${wasFollowing ? 'Unfollowed' : 'Following'} ${channel.channel_name} (will sync when online)`
      );
      return;
    }

    // 4️⃣ Backend confirmation
    const req$ = wasFollowing
      ? this.channelService.unfollowChannel(channel.channel_id, this.userId)
      : this.channelService.followChannel(channel.channel_id, this.userId);

    req$.subscribe({
      next: () => {
        console.log(`✅ Backend confirmed ${wasFollowing ? 'unfollow' : 'follow'}`);
        this.presentToast(
          wasFollowing
            ? `Unfollowed ${channel.channel_name}`
            : `Following ${channel.channel_name}`
        );
      },
      error: async (err) => {
        console.error('❌ Backend operation failed, reverting:', err);

        // 5️⃣ Revert optimistic update
        this.revertOptimisticUpdate(channel, wasFollowing);

        // Queue for retry
        await this.pouchDb.enqueueAction({
          type: wasFollowing ? 'channel_unfollow' : 'channel_follow',
          channelId: String(channel.channel_id),
          data: {
            userId: this.userId,
            channel: wasFollowing ? undefined : channel,
            channelId: wasFollowing ? channel.channel_id : undefined
          },
          timestamp: Date.now()
        });

        this.presentToast(
          `Failed to ${wasFollowing ? 'unfollow' : 'follow'} channel. Will retry.`
        );
      }
    });
  }

  private revertOptimisticUpdate(channel: Channel, wasFollowing: boolean) {
    if (wasFollowing) {
      this.myChannels.push(channel);
      this.followedChannelIds.add(channel.channel_id);

      const idx = this.publicChannels.findIndex(ch => ch.channel_id === channel.channel_id);
      if (idx !== -1) {
        this.publicChannels.splice(idx, 1);
      }
    } else {
      const idx = this.myChannels.findIndex(ch => ch.channel_id === channel.channel_id);
      if (idx !== -1) {
        this.myChannels.splice(idx, 1);
      }
      this.followedChannelIds.delete(channel.channel_id);

      if (!this.publicChannels.find(ch => ch.channel_id === channel.channel_id)) {
        this.publicChannels.push(channel);
      }
    }

    this.updateFilteredChannelsInPlace();
  }


  /* =========================
     NAVIGATION & UI
     ========================= */

  openChat(channel: Channel) {
    this.router.navigate(['/channel-feed'], {
      queryParams: { channelId: channel.channel_id }
    });
  }

  goToChannels() {
    this.router.navigate(['/channels']);
  }

  opendummy() {
    this.router.navigate(['/channel-feed'], {
      queryParams: { channelId: 33 }
    });
  }

  async presentPopover(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();
  }

  async presentToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }

  get totalUnreadUpdates(): number {
    return this.recentStatusGroups.reduce((sum, group) => {
      return sum + Number(group.unseenCount || 0);
    }, 0);
  }

  async openAddChannelModal() {
    const modal = await this.modalCtrl.create({
      component: AddChannelModalComponent
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      this.syncFromBackend();
    }
  }
}