import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { IonicModule, ToastController, ActionSheetController, AlertController, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ChannelService, Channel, ChannelDetails } from 'src/app/pages/channels/services/channel';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { ChannelPouchDbService } from 'src/app/pages/channels/services/pouch-db';
import { ContactSyncService } from 'src/app/services/contact-sync.service';
import { getDatabase, ref, onValue, get } from 'firebase/database';
import { EditChannelModalComponent } from '../modals/edit-channel-modal/edit-channel-modal.component';
import { InviteAdminModalComponent } from '../modals/invite-admin-modal/invite-admin-modal.component';
import { InviteFollowerModalComponent } from '../modals/invite-follower-modal/invite-follower-modal.component';
import { ChatBackendSocketService } from 'src/app/services/chat-backend-socket.service';
import { Share } from '@capacitor/share';
import { PostService } from '../services/post';

// ── Mute duration options ──────────────────────────────────────────────────
interface MuteDuration {
  label: string;
  value: '2min' | '8hours' | '1week' | 'always';
  ms: number | null; // null = always (no expiry)
}

const MUTE_DURATIONS: MuteDuration[] = [
  { label: '2 minutes', value: '2min',   ms: 2 * 60 * 1000 },
  { label: '8 hours',          value: '8hours', ms: 8 * 60 * 60 * 1000 },
  { label: '1 week',           value: '1week',  ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Always',           value: 'always', ms: null },
];

@Component({
  selector: 'app-channel-detail',
  templateUrl: './channel-detail.page.html',
  styleUrls: ['./channel-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule,],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ChannelDetailPage implements OnInit, OnDestroy {
  channelId: number | null = null;
  channel: ChannelDetails | null = null;
  channelPosts: any[] = [];
  isLoading = false;
  isLoadingChannel = true;
  errorMessage: string | null = null;
  isFollowing = false;
  isMuted = false;
  muteUntilLabel: string | null = null;
  private expiryTimer: any = null;
  isOffline = !navigator.onLine;
  isShowingCached = false;
  userId: any;
  formattedCreatedAt: string = '';
  followers: any[] = [];
  isLoadingFollowers = false;

  // View mode for followers section
  followersViewMode: 'grid' | 'list' = 'grid';

  // Whether we are showing only preview (first 6) or full list
  showAllFollowers = false;

  // Media slider
  mediaItems: any[] = [];

  // Stats
  stats = {
    posts: 0,
    followers: 0,
    engagement: 0
  };

  // Followers pagination
  followersPage = 1;
  followersLimit = 60; // page size from backend
  hasMoreFollowers = true;

  // Contact mapping: userId -> contact name from device
  private contactNameMap: Map<number, string> = new Map();
 private devicePhoneMap: Map<string, string> = new Map();
private postsCountUnsub?: () => void;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private channelService: ChannelService,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    private firebaseChatService:FirebaseChatService,
    private pouchDb: ChannelPouchDbService,
    private contactSyncService: ContactSyncService,
    private modalCtrl: ModalController,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private chatSocket: ChatBackendSocketService,
    private postService: PostService
  ) {
    this.userId = this.authService.authData?.userId || '';
  }

  ngOnInit() {
    // this.initializeApp();
  }

  ionViewDidEnter() {
    this.initializeApp();
  }

  ngOnDestroy() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
    }
  }

  initializeApp() {
    // Keep a lightweight offline flag for UI and logic
    this.isOffline = !navigator.onLine;

    this.channelId = this.route.snapshot.queryParams['channelId']
      ? Number(this.route.snapshot.queryParams['channelId'])
      : null;

    if (this.channelId) {
      this.loadChannelDetails();
      this.syncMuteState();
    } else {
      this.errorMessage = 'Invalid channel ID';
      this.isLoadingChannel = false;
    }

    // Load saved view preference
    const savedViewMode = localStorage.getItem('followers_view_mode') as 'grid' | 'list';
    if (savedViewMode) {
      this.followersViewMode = savedViewMode;
    }
  }

  // Toggle between grid and list view
  toggleFollowersView(mode: 'grid' | 'list') {
    this.followersViewMode = mode;
    localStorage.setItem('followers_view_mode', mode);
  }

  // ── Sync mute state on page enter ─────────────────────────────────────────
  private async syncMuteState(): Promise<void> {
    try {
      if (!this.userId || !this.channelId) {
        this.isMuted = false;
        this.muteUntilLabel = null;
        return;
      }

      const roomId = `channel_${this.channelId}`;
      const muteUntil = await this.getMuteUntilFromFirebase(roomId);

      if (muteUntil === null) {
        // Not muted
        this.isMuted = false;
        this.muteUntilLabel = null;
      } else if (muteUntil === 0) {
        // Always muted
        this.isMuted = true;
        this.muteUntilLabel = 'Always';
      } else if (muteUntil <= Date.now()) {
        // Expired → silent auto-unmute
        await this.performUnmute(false);
      } else {
        // Still active
        this.isMuted = true;
        this.muteUntilLabel = this.formatMuteUntil(muteUntil);
        this.scheduleExpiryTimer(muteUntil);
      }

      this.cdr.detectChanges();
    } catch (err) {
      console.error('[ChannelDetail] syncMuteState error:', err);
    }
  }

  // ── Toggle handler ─────────────────────────────────────────────────────────
  async toggleMute(): Promise<void> {
    if (this.isMuted) {
      // Toggle OFF → confirm unmute
      await this.confirmAndUnmute();
    } else {
      // Toggle ON → show duration picker
      await this.showMuteDurationAlert();
    }
  }

  // ── Duration picker alert ────────────────────────────────────────────────
  private async showMuteDurationAlert(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Mute channel notifications',
       cssClass: 'mute-alert',
      message:
        'Other members will not see that you muted this channel, and you will still be notified if you are mentioned.',
      inputs: MUTE_DURATIONS.map((d, i) => ({
        name: 'duration',
        type: 'radio' as const,
        label: d.label,
        value: d.value,
        checked: i === 0,
      })),
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'OK',
          handler: async (selectedValue: string) => {
            if (!selectedValue) return;
            await this.performMute(selectedValue as MuteDuration['value']);
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Mute this channel ─────────────────────────────────────────────────────
  private async performMute(durationValue: MuteDuration['value']): Promise<void> {
    try {
      if (!this.channelId) return;
      const roomId = `channel_${this.channelId}`;
      const duration = MUTE_DURATIONS.find((d) => d.value === durationValue)!;
      const muteUntilTs = duration.ms ? Date.now() + duration.ms : 0;

      // 1️⃣ FirebaseChatService existing muteChat use 
      await this.firebaseChatService.muteChat(roomId, String(this.userId));

      // 2️⃣ Mute via socket queue (handles mutedChatsUntil and muteEvents, resiliently offline)
      await this.chatSocket.muteChannel({
        channelId: String(this.channelId),
        action: 'muted',
        duration: durationValue
      });

      this.isMuted = true;
      this.muteUntilLabel =
        duration.ms === null ? 'Always' : this.formatMuteUntil(muteUntilTs);

      // Agar "Always" nahi toh auto-unmute timer schedule karo
      if (duration.ms !== null) {
        this.scheduleExpiryTimer(muteUntilTs);
      }

      this.cdr.detectChanges();
      this.presentToast('✅ Channel notifications muted', duration.label);
      console.log(`[ChannelDetail] Channel ${this.channelId} muted for ${duration.label}`);
    } catch (err) {
      console.error('[ChannelDetail] performMute error:', err);
      this.presentToast('❌ Failed to mute channel');
    }
  }

  // ── Confirm unmute ────────────────────────────────────────────────────────
  private async confirmAndUnmute(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Unmute channel?',
      message: 'Are you sure you want to unmute notifications for this channel?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Unmute',
          handler: () => this.performUnmute(true),
        },
      ],
    });
    await alert.present();
  }

  // ── Unmute this channel ───────────────────────────────────────────────────
  private async performUnmute(showToast: boolean): Promise<void> {
    try {
      if (!this.channelId) return;
      const roomId = `channel_${this.channelId}`;

      // 1️⃣ FirebaseChatService ka existing unmuteChat use karo
      await this.firebaseChatService.unmuteChat(roomId, String(this.userId));

      // 2️⃣ Unmute via socket queue (handles resilient offline sync)
      await this.chatSocket.muteChannel({
        channelId: String(this.channelId),
        action: 'unmuted'
      });

      this.isMuted = false;
      this.muteUntilLabel = null;

      if (this.expiryTimer) {
        clearTimeout(this.expiryTimer);
        this.expiryTimer = null;
      }

      this.cdr.detectChanges();
      if (showToast) {
        this.presentToast('✅ Channel notifications restored');
      }
      console.log(`[ChannelDetail] Channel ${this.channelId} unmuted`);
    } catch (err) {
      console.error('[ChannelDetail] performUnmute error:', err);
      if (showToast) {
        this.presentToast('❌ Failed to unmute channel');
      }
    }
  }

  // ── Auto-expiry timer ──────────────────────────────────────────────────────
  private scheduleExpiryTimer(muteUntilTs: number): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
    }

    const msRemaining = muteUntilTs - Date.now();
    if (msRemaining <= 0) return;

    this.expiryTimer = setTimeout(async () => {
      await this.performUnmute(false);
    }, msRemaining);
  }

  // ── Firebase helpers ──────────────────────────────────────────────────────
  private async saveMuteUntilToFirebase(roomId: string, muteUntilTs: number): Promise<void> {
    try {
      await this.firebaseChatService.applySecuredBatchUpdates({
        [`users/${this.userId}/mutedChatsUntil/${roomId}`]: muteUntilTs
      });
    } catch (err) {
      console.error('[ChannelDetail] saveMuteUntilToFirebase error:', err);
    }
  }

  private async getMuteUntilFromFirebase(roomId: string): Promise<number | null> {
    try {
      const db = getDatabase();
      const snap = await get(ref(db, `users/${this.userId}/mutedChatsUntil/${roomId}`));
      if (!snap.exists()) return null;
      return snap.val() as number;
    } catch (err) {
      console.error('[ChannelDetail] getMuteUntilFromFirebase error:', err);
      return null;
    }
  }

  private async clearMuteUntilFromFirebase(roomId: string): Promise<void> {
    try {
      await this.firebaseChatService.applySecuredBatchUpdates({
        [`users/${this.userId}/mutedChatsUntil/${roomId}`]: null
      });
    } catch (err) {
      console.error('[ChannelDetail] clearMuteUntilFromFirebase error:', err);
    }
  }

  // ── Log mute/unmute events ───────────────────────────────────────────────
  private async logMuteEvent(eventData: any): Promise<void> {
    try {
      const timestamp = Date.now();
      const eventId = `${this.userId}_${timestamp}`;
      
      await this.firebaseChatService.applySecuredBatchUpdates({
        [`channels/${this.channelId}/muteEvents/${eventId}`]: {
          userId: eventData.userId,
          action: eventData.action,
          duration: eventData.duration || null,
          muteUntil: eventData.muteUntil || null,
          timestamp: eventData.timestamp
        }
      });
      
      console.log(`[ChannelDetail] Mute event logged:`, eventData);
    } catch (err) {
      console.error('[ChannelDetail] logMuteEvent error:', err);
      // Don't throw - this is non-critical tracking
    }
  }

  private formatMuteUntil(ts: number): string {
    if (!ts || ts === 0) return 'Always';
    const target = new Date(ts);
    const now = new Date();
    const timeStr = target.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const isToday = target.getDate() === now.getDate() && target.getMonth() === now.getMonth() && target.getFullYear() === now.getFullYear();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = target.getDate() === tomorrow.getDate() && target.getMonth() === tomorrow.getMonth() && target.getFullYear() === tomorrow.getFullYear();
    if (isToday) return `Until today, ${timeStr}`;
    if (isTomorrow) return `Until tomorrow, ${timeStr}`;
    return `Until ${target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${timeStr}`;
  }

  private applyChannelToView(channel: ChannelDetails, source: 'cache' | 'network') {
    this.channel = channel;
    this.isShowingCached = source === 'cache';

    // Format date
    if (this.channel?.created_at) {
      const date = new Date(this.channel.created_at);
      this.formattedCreatedAt = date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    } else {
      this.formattedCreatedAt = '';
    }

    // Set stats
     this.stats.followers = this.getDisplayFollowersCount();
    this.stats.posts = this.channelPosts.length;

    // Media items
    this.generateMediaItems();
  }

  private async getCachedChannel(channelId: number): Promise<ChannelDetails | null> {
    // 1) Direct cached doc (if saved previously)
    const direct = await this.pouchDb.getChannel(channelId);
    if (direct) return direct as any;

    // 2) Fallback: channel may exist in cached lists (my/discover)
    const uid = String(this.userId || '');
    if (!uid) return null;

    const [my, discover] = await Promise.all([
      this.pouchDb.getMyChannels(uid),
      this.pouchDb.getDiscoverChannels(uid)
    ]);

    return (my.find(c => c.channel_id === channelId) || discover.find(c => c.channel_id === channelId) || null) as any;
  }

  loadChannelDetails() {
    this.isLoadingChannel = true;
    this.errorMessage = null;
    this.isOffline = !navigator.onLine;
    this.isShowingCached = false;

    // 1) Try cache first (fast, works offline)
    this.getCachedChannel(this.channelId!)
      .then(cached => {
        if (cached) {
          this.applyChannelToView(cached, 'cache');
          this.isLoadingChannel = false;
          this.errorMessage = null;

          // Load extra UI data (offline-safe)
          this.loadFollowStatus();
          this.loadChannelPosts();
          // Load cached followers when offline
          if (this.isChannelOwner() || this.isChannelAdmin()) {
            this.loadFollowers(true);
          }
        }

        // If offline, stop here
        if (!navigator.onLine) {
          this.isOffline = true;
          if (!cached) {
            this.errorMessage = 'No cached data for this channel. Please open it once while online.';
            this.isLoadingChannel = false;
          }
          return;
        }

        // 2) Online: fetch from network and refresh cache
        this.channelService.getChannelDetails(this.channelId!).subscribe({
          next: async (res) => {
            this.isLoadingChannel = false;
            if (res?.status && res.channel) {
              this.applyChannelToView(res.channel, 'network');
              this.errorMessage = null;

              // Persist for offline
              await this.pouchDb.saveChannel(res.channel as any, true);

              // Load extra UI data
              this.loadFollowStatus();
              this.loadChannelPosts();

              // Followers list is network-only; avoid spamming errors when offline
              if ((this.isChannelOwner() || this.isChannelAdmin()) && navigator.onLine) {
                this.loadFollowers(true);
              }
            } else {
              // If we already showed cache, keep it visible; otherwise error
              if (!this.channel) this.errorMessage = 'Channel not found';
            }
          },
          error: async () => {
            this.isLoadingChannel = false;

            // Network failed: if we already have cached UI, keep it and try cached followers
            if (this.channel) {
              this.isShowingCached = true;
              if (this.isChannelOwner() || this.isChannelAdmin()) {
                this.loadFollowers(true);
              }
              return;
            }

            // Try cache one more time, then show error
            const fallback = await this.getCachedChannel(this.channelId!);
            if (fallback) {
              this.applyChannelToView(fallback, 'cache');
              this.errorMessage = null;
              return;
            }

            this.errorMessage = 'Failed to load channel details';
          }
        });
      })
      .catch(() => {
        // Cache read failure shouldn't block online load; continue if online
        if (!navigator.onLine) {
          this.isLoadingChannel = false;
          this.errorMessage = 'Offline and cache unavailable for this channel.';
          return;
        }

        this.channelService.getChannelDetails(this.channelId!).subscribe({
          next: async (res) => {
            this.isLoadingChannel = false;
            if (res?.status && res.channel) {
              this.applyChannelToView(res.channel, 'network');
              this.errorMessage = null;
              await this.pouchDb.saveChannel(res.channel as any, true);
              this.loadFollowStatus();
              this.loadChannelPosts();
              if ((this.isChannelOwner() || this.isChannelAdmin()) && navigator.onLine) {
                this.loadFollowers(true);
              }
            } else {
              this.errorMessage = 'Channel not found';
            }
          },
          error: () => {
            this.isLoadingChannel = false;
            this.errorMessage = 'Failed to load channel details';
          }
        });
      });
  }

  generateMediaItems() {
    this.mediaItems = [
      { type: 'image', url: this.channel?.channel_dp || 'assets/images/user.jfif' }
    ];
  }

  loadFollowStatus() {
    if (!this.userId || !this.channelId) {
      this.isFollowing = false;
      return;
    }

    // Offline: derive following state from cached "my channels"
    if (!navigator.onLine) {
      const uid = String(this.userId || '');
      if (!uid) {
        this.isFollowing = false;
        return;
      }

      this.pouchDb.getMyChannels(uid)
        .then(channels => {
          this.isFollowing = channels.some((ch: Channel) => ch.channel_id === this.channelId);
        })
        .catch(() => {
          this.isFollowing = false;
        });
      return;
    }

    this.channelService.getUserFollowerChannels(this.userId, { limit: 100 }).subscribe({
      next: (res: any) => {
        if (res?.status && Array.isArray(res.channels)) {
          this.isFollowing = res.channels.some((ch: Channel) => ch.channel_id === this.channelId);
        }
      },
      error: () => {
        console.error('Failed to load follow status');
        this.isFollowing = false;
      }
    });
  }

  loadChannelPosts() {
    if (!this.channelId || this.postsCountUnsub) return;

    const db = getDatabase();
    const postsRef = ref(db, `channels/${this.channelId}/posts`);
    
    this.postsCountUnsub = onValue(postsRef, (snap) => {
      const count = snap.size || Object.keys(snap.val() || {}).length;  // Fallback
      this.stats.posts = count;
      this.cdr.detectChanges();
      console.log(`📊 Live posts for ${this.channelId}: ${count}`);
    });
  }

  /**
   * Check if current user is channel owner/creator
   * Uses role_id === 1 OR created_by / creator_id match
   */
  isChannelOwner(): boolean {
    if (!this.channel || !this.userId) return false;

    // If API sends role_id for current user
    if (typeof (this.channel as any).role_id === 'number') {
      if ((this.channel as any).role_id === 1) {
        return true; // 1 = Owner
      }
    }

    // Fallback: compare created_by / creator_id
    const createdBy = (this.channel as any).created_by || (this.channel as any).creator_id;
    if (createdBy != null) {
      return String(createdBy) === String(this.userId);
    }

    return false;
  }
   
  
  /**
   * Get display followers count
   * If user is the owner, subtract 1 from the actual count (exclude owner from followers)
   */
  getDisplayFollowersCount(): number {
    if (!this.channel) return 0;
    const base = Number(this.channel.followers_count ?? 0);
    if (this.isChannelOwner()) {
      const adjusted = base - 1;
      return adjusted > 0 ? adjusted : 0;
    }
    return base;
  }

  /**
   * Check if current user is channel admin (but not owner)
   * Uses role_id === 2
   */
  isChannelAdmin(): boolean {
    if (!this.channel || !this.userId) return false;

    // If API sends role_id for current user
    if (typeof (this.channel as any).role_id === 'number') {
      if ((this.channel as any).role_id === 2) {
        return true; // 2 = Admin
      }
    }

    return false;
  }

  /**
   * Toggle follow state.
   * - If not owner & not following -> follow directly
   * - If not owner & already following -> show confirm alert before unfollow
   */
  toggleFollow() {
    if (!this.channel || this.isLoading || !this.userId) return;

    // Owner should never see this, but just in case
    if (this.isChannelOwner()) {
      return;
    }

    if (this.isFollowing) {
      // Already following -> confirm unfollow
      this.confirmUnfollow();
    } else {
      // Not following -> follow
      this.updateFollowStatus(false);
    }
  }

  /**
   * Perform follow / unfollow API call
   * @param isCurrentlyFollowing true if user is currently following (do unfollow), false to follow
   */
  private updateFollowStatus(isCurrentlyFollowing: boolean) {
    if (!this.channel || !this.userId) return;

    this.isLoading = true;

    const action$ = isCurrentlyFollowing
      ? this.channelService.unfollowChannel(this.channel.channel_id, this.userId)
      : this.channelService.followChannel(this.channel.channel_id, this.userId);

    action$.subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (res?.status) {
          // Toggle local state
          this.isFollowing = !isCurrentlyFollowing;

          // Update followers count
          const diff = this.isFollowing ? 1 : -1;
          this.channel!.followers_count = (this.channel!.followers_count || 0) + diff;
           this.stats.followers = this.getDisplayFollowersCount();
          this.presentToast(this.isFollowing ? 'Following!' : 'Unfollowed');

          // Sync member to Firebase RTDB (for server-side unread count)
          if (this.isFollowing) {
            this.chatSocket.addChannelMember({
              channelId: this.channel!.channel_id,
              memberId: this.userId,
              roleId: 3, // follower
            }).catch(() => {});
          } else {
            this.chatSocket.removeChannelMember({
              channelId: this.channel!.channel_id,
              memberId: this.userId,
            }).catch(() => {});
          }
        } else {
          this.presentToast('Failed to update follow status');
        }
      },
      error: () => {
        this.isLoading = false;
        this.presentToast('Network error');
      }
    });
  }

  /**
   * Confirm before unfollowing the channel
   */
  private async confirmUnfollow() {
    const alert = await this.alertCtrl.create({
      header: 'Unfollow Channel',
      message: 'Are you sure you want to unfollow this channel?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Unfollow',
          role: 'destructive',
          handler: () => {
            this.updateFollowStatus(true);
          }
        }
      ]
    });

    await alert.present();
  }



  /**
   * Get human-readable role name from role_id
   * Role IDs: 1 = Owner, 2 = Admin, 3 = Follower
   */
  getRoleName(roleId: number): string {
    const roleMap: { [key: number]: string } = {
      1: 'Owner',
      2: 'Admin',
      3: 'Follower',
      // Add more role mappings as needed
    };
    return roleMap[roleId] || 'Member';
  }

  /**
   * Load contact mappings from device contacts.
   * This creates a map of userId -> contact name for matching followers.
   */
  private async loadContactMappings(): Promise<void> {
    try {
      const matchedUsers = await this.contactSyncService.getMatchedUsers();
      
      this.contactNameMap.clear();
      matchedUsers.forEach((user: any) => {
           if (user.userId && (user.device_contact_name || user.username)) {
          const userId = typeof user.userId === 'string' ? parseInt(user.userId, 10) : user.userId;
          if (!isNaN(userId)) {
           const name = user.device_contact_name || user.username;
            this.contactNameMap.set(userId, name);
             }
      }
      });
      
      const deviceContacts = await this.contactSyncService.getDevicePhoneNumbers();
      this.devicePhoneMap.clear();
      deviceContacts.forEach((c: any) => {
        const last10 = String(c.phoneNumber || '').replace(/\D/g, '').slice(-10);
        if (last10 && c.username) this.devicePhoneMap.set(last10, c.username);
      });
     
    } catch (error) {
      console.error('❌ Failed to load contact mappings:', error);
    }
  }

  /**
   * Get display name for a follower.
   * Priority: device contact name > API name
   */
  getFollowerDisplayName(follower: any): string {
    if (!follower) return 'Unknown';
    
    // Priority: 
    // 1) For Owner (role_id = 1): API name (allows emojis)
    // 2) For others: device contact name > API name
    
    if (Number(follower.role_id) === 1 && follower.name) {
      return follower.name;
    }

    const userId = typeof follower.user_id === 'string' 
      ? parseInt(follower.user_id, 10) 
      : follower.user_id;
    
    const contactName = this.contactNameMap.get(userId);
    if (contactName) {
      return contactName;
    }
    
   // Special handling for owner (role_id = 1) fallback
    if (Number(follower.role_id) === 1) {
      // If the owner is the current logged-in user, prefer device contact for my number
      if (String(userId) === String(this.userId)) {
        const myPhone = this.authService.authData?.phone_number || '';
        const myLast10 = String(myPhone).replace(/\D/g, '').slice(-10);
        if (myLast10) {
          const myContactName = this.devicePhoneMap.get(myLast10);
          if (myContactName) return myContactName;
        }
        // Fallback to my platform profile name
        const myProfileName = this.authService.authData?.name;
        if (myProfileName) return myProfileName;
      }
    }

    const phoneCandidate =
      follower.phone_number ||
      follower.phone ||
      follower.phoneNumber ||
      '';
    const last10 = String(phoneCandidate).replace(/\D/g, '').slice(-10);
    if (last10) {
      const name = this.devicePhoneMap.get(last10);
      if (name) return name;
    }
    return follower.name || 'Unknown';
  }

   /**
   * Get display name for the channel creator.
   * Priority: API creator_name (allows emojis/special names) > device contact name
   */
  getCreatorDisplayName(): string {
    if (!this.channel) return 'Unknown';

    // 1) Primary source: API creator_name
    // This allows creators to show their chosen display name (including emojis)
    if (this.channel.creator_name) {
      return this.channel.creator_name;
    }

    // 2) Fallback to device contact name mapping
    const creatorId = this.channel.created_by || (this.channel as any).creator_id;
    if (creatorId) {
      const contactName = this.contactNameMap.get(creatorId);
      if (contactName) {
        return contactName;
      }

      // If creator is the current logged-in user, try to get device contact name for my number
      if (String(creatorId) === String(this.userId)) {
        const myPhone = this.authService.authData?.phone_number || '';
        const myLast10 = String(myPhone).replace(/\D/g, '').slice(-10);
        if (myLast10) {
          const myContactName = this.devicePhoneMap.get(myLast10);
          if (myContactName) return myContactName;
        }
        // Fallback to my platform profile name
        const myProfileName = this.authService.authData?.name;
        if (myProfileName) return myProfileName;
      }
    }

    return 'Unknown';
  }

  /**
   * Followers API with pagination.
   * - reset = true: clear list and start from page 1 (used on first load / refresh)
   * - Uses this.followersPage & this.followersLimit
   * - When offline: loads from PouchDB cache
   * - When online: fetches from API and caches for offline
   * - Owner is added to the list with role_id = 1
   */
  loadFollowers(reset: boolean = false) {
    if (!this.channelId) return;

    if (reset) {
      this.followersPage = 1;
      this.followers = [];
      this.hasMoreFollowers = true;
      this.showAllFollowers = false; // go back to preview mode
      this.loadContactMappings();

      // Add owner to followers list if current user is owner
      if (this.isChannelOwner() && this.channel) {
        const ownerId = (this.channel as any).created_by || (this.channel as any).creator_id;
        const ownerName = (this.channel as any).creator_name || 'Channel Owner';

        // ✅ Fetch owner's actual profile picture instead of using channel DP
        this.apiService.getUserProfilebyId(String(ownerId)).subscribe({
          next: (res: any) => {
            const ownerProfile = res?.profile || null;
            // Add owner at the beginning of the list
            this.followers.unshift({
              user_id: ownerId,
              name: ownerName,
              role_id: 1, // Owner
              profile_picture_url: ownerProfile
            });
          },
          error: () => {
            // Fallback to null if API fails
            this.followers.unshift({
              user_id: ownerId,
              name: ownerName,
              role_id: 1,
              profile_picture_url: null
            });
          }
        });
      }
    }

    // Offline: load from cache
    if (!navigator.onLine) {
      this.isLoadingFollowers = true;
      this.pouchDb.getFollowers(this.channelId).then((cached) => {
        this.isLoadingFollowers = false;
        if (cached && cached.length > 0) {
          // Re-add owner after loading from cache if user is owner
          if (this.isChannelOwner() && this.channel && !this.followers.some((f: any) => f.role_id === 1)) {
            const ownerId = (this.channel as any).created_by || (this.channel as any).creator_id;
            const ownerName = (this.channel as any).creator_name || 'Channel Owner';

            this.apiService.getUserProfilebyId(String(ownerId)).subscribe({
              next: (res: any) => {
                const ownerProfile = res?.profile || null;
                cached.unshift({
                  user_id: ownerId,
                  name: ownerName,
                  role_id: 1,
                  profile_picture_url: ownerProfile
                });
                this.followers = cached;
              },
              error: () => {
                cached.unshift({
                  user_id: ownerId,
                  name: ownerName,
                  role_id: 1,
                  profile_picture_url: null
                });
                this.followers = cached;
              }
            });
          } else {
            this.followers = cached;
          }
          this.hasMoreFollowers = false; // cached = all we have
          this.presentToast('Showing cached followers');
        } else {
          this.presentToast('Offline: no cached followers. Open while online first.');
        }
      }).catch(() => {
        this.isLoadingFollowers = false;
        this.presentToast('Offline: no cached followers available');
      });
      return;
    }

    // Online: fetch from API
    if (!reset && !this.hasMoreFollowers) {
      return;
    }

    this.isLoadingFollowers = true;

    const page = this.followersPage;
    const limit = this.followersLimit;

    // ✅ FIX ISSUE #1: Use getChannelMembers instead of getChannelFollowers
    // This provides more accurate role data
    this.channelService.getChannelFollowers(this.channelId!, { page, limit })
  .subscribe({
    next: async (res: any) => {
      this.isLoadingFollowers = false;

      if (res?.status && Array.isArray(res.followers)) {

        let newFollowers = reset
          ? res.followers
          : [...this.followers, ...res.followers];

        // Always ensure owner is included
        if (reset && this.channel) {
          const ownerId = this.channel.created_by;
          const exists = newFollowers.some((f: any) => f.user_id == ownerId);

          if (!exists) {
            const ownerName = this.channel.creator_name;
            // ✅ Fetch owner's actual profile picture instead of using channel DP
            this.apiService.getUserProfilebyId(String(ownerId)).subscribe({
              next: (profileRes: any) => {
                const ownerProfile = profileRes?.profile || null;
                newFollowers.unshift({
                  user_id: ownerId,
                  name: ownerName,
                  role_id: 1,
                  profile_picture_url: ownerProfile
                });
                this.followers = newFollowers;
              },
              error: () => {
                newFollowers.unshift({
                  user_id: ownerId,
                  name: ownerName,
                  role_id: 1,
                  profile_picture_url: null
                });
                this.followers = newFollowers;
              }
            });
          } else {
            this.followers = newFollowers;
          }
        } else {
          this.followers = newFollowers;
        }

        if (res.followers.length < limit) {
          this.hasMoreFollowers = false;
        }

        if (reset && newFollowers.length > 0) {
          await this.pouchDb.saveFollowers(this.channelId!, newFollowers);
        }
      }
    },
    error: () => {
      this.isLoadingFollowers = false;
      this.presentToast('Failed to load followers');
    }
  });
  }

  /**
   * Handles "View All Followers" / "Load more" button:
   * - First click turns on full list mode (showAllFollowers = true)
   * - Subsequent clicks load next page if hasMoreFollowers is true
   */
  viewAllFollowers() {
    // First click: just toggle to "show all" mode
    if (!this.showAllFollowers) {
      this.showAllFollowers = true;
      return;
    }

    // Already in "all" mode → load next page if available
    if (this.hasMoreFollowers && !this.isLoadingFollowers) {
      this.followersPage++;
      this.loadFollowers();
    }
  }

   /**
   * View individual follower profile
   */
viewFollowerProfile(userId: string) {
   this.presentToast(`wip`);
  // this.router.navigate(['/profile-screen'], {
  //   queryParams: { receiverId: userId }
  // });
}

 async messageUser(user: any) {
 this.presentToast(`wip`);
  // const userID = user.user_id;
 
  // await this.firebaseChatService.openChat(
  //     { receiver: { userId: userID } },
  //     true
  //   );
 
  // this.router.navigate(['/chatting-screen'], {
  //   queryParams: { receiverId: user.user_id }
  // });
}


//  async messageMember(member: any) {
//     const senderId = this.authService.authData?.userId || '';
//     const receiverId = member.user_id;

//     if (!senderId || !receiverId) {
//       alert('Missing sender or receiver ID');
//       return;
//     }

//     // const roomId = senderId < receiverId ? `${senderId}_${receiverId}` : `${receiverId}_${senderId}`;
//     // const receiverPhone = member.phone_number || member.phone;

//     // await this.firebaseChatService.openChat(chat);

//     await this.firebaseChatService.openChat(
//       { receiver: { userId: receiverId } },
//       true
//     );

//     this.router.navigate(['/chatting-screen'], {
//       queryParams: {
//         receiverId: receiverId,
//       }
//     });
  // }
  async openFollowerActions(user: any) {
  const buttons: any[] = [
    // {
    //   text: 'View user',
    //   icon: 'person-circle',
    //   handler: () => {
    //     this.viewFollowerProfile(user.user_id);
    //   }
    // },
    // {
    //   text: 'Message user',
    //   icon: 'chatbubbles',
    //   handler: () => {
    //     this.messageUser(user);
    //   }
    // }
  ];

  // Add "Invite as Admin" only for channel owners
  if (this.isChannelOwner() && user?.role_id !== 1) {
    if (user?.role_id === 2) {
      buttons.push({
        text: 'Revoke Admin',
        icon: 'shield-outline',
         cssClass: 'admin-invite-button-white',
        handler: () => {
          this.revokeAdmin(user);
        }
      });
    } else {
      buttons.push({
        text: 'Invite as Admin',
        icon: 'person-add',
        cssClass: 'admin-invite-button-white',
        handler: () => {
          this.inviteAsAdmin(user);
        }
      });
    }
  }

  buttons.push({
    text: 'Cancel',
    icon: 'close',
   role: 'cancel',
    cssClass: 'cancel-button-white'
  });

  const actionSheet = await this.actionSheetCtrl.create({
    header: this.getFollowerDisplayName(user) || 'Follower',
   buttons: buttons,
    cssClass: 'follower-actions-sheet'
  });

  await actionSheet.present();
}

async inviteAsAdmin(user: any) {
  if (!this.channel) return;

  const modal = await this.modalCtrl.create({
    component: InviteAdminModalComponent,
    componentProps: {
      channel: this.channel,
      userToInvite: user
    },
    cssClass: 'invite-admin-modal'
  });

  await modal.present();
}

  revokeAdmin(user: any) {
    if (!this.channel || !user?.user_id) return;
    const requesterId = this.authService.authData?.userId || '';
    this.channelService.updateMemberRole(this.channel.channel_id, user.user_id, 3, requesterId).subscribe({
      next: (res: any) => {
        const idx = this.followers.findIndex((f: any) => String(f.user_id) === String(user.user_id));
        if (idx !== -1) {
          this.followers[idx] = { ...this.followers[idx], role_id: 3 };
        }
        this.presentToast('Promoted to follower');
      },
      error: () => {
        this.presentToast('Failed to revoke admin');
      }
    });
  }




  // Placeholder for future extra actions
  moreFollowerActions(user: any) {
    // You can open another action sheet / modal later
    this.presentToast(`More options for ${this.getFollowerDisplayName(user) || 'user'} (WIP)`);
  }


  async presentChannelOptions() {
    if (!this.isChannelOwner()) {
      return;
    }

    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Channel Options',
      buttons: [
        {
          text: 'Edit Channel',
          icon: 'create-outline',
          handler: () => this.openEditChannelModal()
        }
      ]
    });

    await actionSheet.present();
  }

  async shareChannel() {
    if (!this.channel) return;

    const channelLink = `https://ekmessenger.app/channel/${this.channel.channel_id}`;

    try {
      await Share.share({
        title: this.channel.channel_name,
        text: `Check out this channel on app: ${this.channel.channel_name}`,
        url: channelLink,
        dialogTitle: 'Share Channel',
      });
    } catch (error) {
      console.error('Error sharing channel:', error);
    }
  }

  inviteFollowers() {
    if (!this.channel) return;
    const requesterId = this.authService.authData?.userId;
    const inviteMessage: any = {
      type: 'channel_invite',
      text: `Follow my channel ${this.channel.channel_name}`,
      sender_phone: this.authService.authData?.phone_number,
      sender_name: this.authService.authData?.name,
      channel_invite: {
        channelId: this.channel.channel_id,
        channelName: this.channel.channel_name,
        channelDp: this.channel.channel_dp,
        inviteText: `I'd like to invite you to follow my channel, '${this.channel.channel_name}'`,
        isFollowerInvite: true,
        requesterId: requesterId
      }
    };

    this.firebaseChatService.setForwardMessage([inviteMessage]);
    this.router.navigate(['/forwardmessage']);
  }

  async reportChannel() {
    const alert = await this.alertCtrl.create({
      header: 'Report Channel',
      message: 'Are you sure you want to report this channel?',
      inputs: [
        {
          name: 'reason',
          type: 'textarea',
          placeholder: 'Reason for reporting...'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Report',
          role: 'destructive',
          handler: (data) => {
            if (data.reason) {
              // Send report to backend
              this.presentToast('Channel reported');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  viewAllMedia() {
    // Only channel owner can edit
    if (this.isChannelOwner()) {
      this.openEditChannelModal();
    } else {
      this.presentToast('Opening media gallery...');
    }
  }

  /**
   * Delete channel
   */
  async deleteChannel() {
    if (!this.channel || !this.channelId) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete Channel',
      message: 'Are you sure you want to delete this channel? This action cannot be undone.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.isLoading = true;
            this.channelService.deleteChannel(this.channelId!).subscribe({
              next: async (res: any) => {
                this.isLoading = false;
                if (res?.status) {
                  await this.softDeleteAllPosts();
                  this.presentToast('Channel deleted successfully');
                  this.router.navigate(['/status-screen']); // Redirect to channels list
                } else {
                  this.presentToast(res?.message || 'Failed to delete channel');
                }
              },
              error: () => {
                this.isLoading = false;
                this.presentToast('Network error while deleting channel');
              }
            });
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * Soft delete all posts associated with this channel via backend socket
   */
  async softDeleteAllPosts() {
    try {
      if (!this.channelId) return;
      await this.firebaseChatService.softDeleteChannelPosts(this.channelId);
    } catch(err) {
      console.warn('Silent failure on soft deleting posts via backend', err);
    }
  }

  /**
   * Open edit channel modal
   */
  async openEditChannelModal() {
    if (!this.channel || !this.isChannelOwner()) {
      this.presentToast('Only channel owner can edit');
      return;
    }

    const modal = await this.modalCtrl.create({
      component: EditChannelModalComponent,
      componentProps: {
        channel: this.channel
      },
      cssClass: 'edit-channel-modal'
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();

    if (data?.updated) {
      // Reload channel details to reflect changes
      this.loadChannelDetails();
      this.presentToast('Channel updated successfully');
    }
  }

  openPost(post: any) {
    // console.log('Opening post:', post);
  }

  async presentToast(msg: string, subMsg?: string) {
    const message = subMsg ? `${msg}\n${subMsg}` : msg;
    const toast = await this.toastCtrl.create({
      message: message,
      duration: 2500,
      position: 'bottom',
      cssClass: 'custom-toast'
    });
    await toast.present();
  }
}
