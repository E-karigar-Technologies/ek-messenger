// src/app/pages/channels/channel-feed/channel-feed.page.ts
import { IonicModule, ModalController, ActionSheetController, ToastController, LoadingController, PopoverController } from '@ionic/angular';
import { Component, OnInit, ChangeDetectorRef, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { ChannelService, Channel } from '../services/channel';
import { forkJoin, firstValueFrom, Subscription } from 'rxjs';
import { PostService } from '../services/post';
import { EmojiPickerModalComponent } from 'src/app/components/emoji-picker-modal/emoji-picker-modal.component';
import { AuthService } from 'src/app/auth/auth.service';
import { ChannelPouchDbService } from '../services/pouch-db';
import { FileStorageService } from '../services/file-storage';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { ImageCropperModalComponent } from 'src/app/components/image-cropper-modal/image-cropper-modal.component';
import { ChannelFeedMenuComponent } from '../components/channel-feed-menu/channel-feed-menu.component';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { InviteAdminModalComponent } from '../modals/invite-admin-modal/invite-admin-modal.component';
import { InviteAdminContactsModalComponent } from '../modals/invite-admin-contacts-modal/invite-admin-contacts-modal.component';
import { ChannelSettingsModalComponent } from '../modals/channel-settings-modal/channel-settings-modal.component';
import { ChatBackendSocketService } from 'src/app/services/chat-backend-socket.service';


interface ReactionMap {
  [emoji: string]: number;
}

interface UserReaction {
  emoji: string;
  timestamp: number;
}

export interface Post {
  id: string;
  body: string;
  image?: string;
  media_id?: string;
  created_by: number;
  user_reactions?: { [userId: string]: UserReaction };
  timestamp?: number;
  pendingImageId?: string;
  isPending?: boolean;
}

@Component({
  selector: 'app-channel-feed',
  templateUrl: './channel-feed.page.html',
  styleUrls: ['./channel-feed.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ChannelFeedPage implements OnInit, OnDestroy {
  @ViewChild('messageInput') messageInput!: ElementRef;
  @ViewChild('contentArea') contentArea!: any;

  channelId!: string | null;
  channel: Channel | null = null;
  posts: Post[] = [];
  newMessage: string = '';
  uploadProgress: number = 0;
  isUploading: boolean = false;
  isMuted: boolean = false;
  isOnline: boolean = true;
  isTyping: boolean = false; // ✨ NEW: Typing indicator

  // Track Blob URLs for cleanup
  private blobURLs: Set<string> = new Set();
  
  // Reaction popup
  showReactionPopup: boolean = false;
  popupX = 0;
  popupY = 0;
  activePost!: Post;

  // Double tap
  lastTapTime: number = 0;

  // Multi-select
  selectionMode: boolean = false;
  selectedPosts: Set<string> = new Set();
  
  // Attachment
  selectedAttachment: {
    type: 'image' | 'file';
    blob: Blob;
    fileName: string;
    mimeType: string;
    fileSize: number;
    previewUrl: string;
  } | null = null;

  // Preview modal
  showPreviewModal = false;
  messageText = '';

  // Long press detection
  private longPressTimer: any;
  private isLongPress: boolean = false;
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private postsSub?: Subscription;
  private connectionSub?: Subscription;

  // Cache for media URLs
  private mediaCache: Map<string, string> = new Map();

  currentUserId!: any;
  canCreatePost: boolean = false;

  // ✨ NEW: Loading states
  isLoadingPosts: boolean = true;
  isLoadingChannel: boolean = true;
  hasError: boolean = false;
  errorMessage: string = '';

  // Follow state (for non-members visiting via deep link)
  isFollowing: boolean = true; // default true to avoid flicker for existing members
  isFollowLoading: boolean = false;

  // ✨ NEW: Pull to refresh
  isRefreshing: boolean = false;

  // ✨ NEW: Scroll to bottom helper
  public shouldScrollToBottom: boolean = true;

  // ── Search ──────────────────────────────────────────────────────────────
  showSearchBar = false;
  searchText = '';
  matchedMessages: HTMLElement[] = [];
  currentSearchIndex = -1;
  showDateModal = false;
  selectedDate = '';
  maxDate: string = new Date().toISOString();

  constructor(
    private route: ActivatedRoute,
    private postService: PostService,
    private channelService: ChannelService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private modalController: ModalController,
    private toastController: ToastController,
    private actionSheetController: ActionSheetController,
    private authService: AuthService,
    private postPouchDb: ChannelPouchDbService,
    private fileStorage: FileStorageService,
    private loadingController: LoadingController, // ✨ NEW
    private popoverCtrl: PopoverController,
    private firebaseChatService: FirebaseChatService,
    private chatSocket: ChatBackendSocketService
  ) {
    this.currentUserId = this.authService.authData?.userId || 0;
  }

  /* =========================
     LIFECYCLE - OFFLINE-FIRST
     ========================= */

  ngOnInit() {
    // Setup will happen in ionViewWillEnter
  }

async ionViewWillEnter() {
  this.channelId = this.route.snapshot.queryParamMap.get('channelId') || '0';

console.log('Value:', this.channelId);
console.log('Type:', typeof this.channelId);

  // ✅ NEW: detect if coming from invite accept
  const forceRefresh =
    this.route.snapshot.queryParamMap.get('forceRefresh') === '1';

  if (!this.channelId || this.channelId === '0') {
    this.hasError = true;
    this.errorMessage = 'Invalid channel ID';
    return;
  }

  // ✨ IMPROVED: Show loading state
  this.isLoadingChannel = true;
  this.isLoadingPosts = true;

  // Mark channel as active so unread count stops incrementing while open.
  // Reset channel unread count to 0.
  this.chatSocket.setActiveChat(`channel_${this.channelId}`).catch(() => {});
  this.chatSocket.applySecuredBatchUpdates({
    updates: { [`channel_unreadCount/${this.currentUserId}/${this.channelId}`]: 0 }
  }).catch(() => {});

  try {
    // ✅ NEW: remove cached channel data so role_id updates immediately
    if (forceRefresh) {
      try {
        await this.postPouchDb.deleteChannel(Number(this.channelId));
      } catch (e) {
        // console.warn('Cache delete failed (safe to ignore):', e);
      }
    }

    // 1️⃣ Fetch channel details
    await this.fetchChannelDetails();

    // 2️⃣ Load cached media URLs first
    await this.loadCachedMediaUrls();

    // 3️⃣ Subscribe to posts (loads from cache immediately)
    this.subscribeToPosts();

    // 4️⃣ Monitor connection status
    this.subscribeToConnection();

    // ✨ NEW: Auto-scroll to bottom on first load
    setTimeout(() => this.scrollToBottom(false), 300);

  } catch (error) {
    // console.error('❌ Failed to initialize channel feed:', error);
    this.hasError = true;
    this.errorMessage = 'Failed to load channel';

  } finally {
    this.isLoadingChannel = false;
    this.isLoadingPosts = false;
  }
}


  ionViewWillLeave() {
    // Clear active chat so unread count resumes for future posts
    this.chatSocket.setActiveChat(null).catch(() => {});
    this.cleanup();
  }

  ngOnDestroy() {
    this.revokeBlobURLs();
    this.cleanup();
  }

  /**
   * ✨ NEW: Revoke all Blob URLs to prevent memory leaks
   */
  private revokeBlobURLs() {
    this.blobURLs.forEach(url => {
      URL.revokeObjectURL(url);
    });
    this.blobURLs.clear();
  }

  private cleanup() {
    if (this.postsSub) {
      this.postsSub.unsubscribe();
      this.postsSub = undefined;
    }

    if (this.connectionSub) {
      this.connectionSub.unsubscribe();
      this.connectionSub = undefined;
    }

    if (this.channelId) {
      this.postService.cleanupPostsListener(this.channelId);
    }
  }

  /* =========================
     ✨ NEW: PULL TO REFRESH
     ========================= */

  async handleRefresh(event: any) {
    this.isRefreshing = true;

    try {
      if (!this.isOnline) {
        this.showToast('Offline - Cannot refresh', 'warning', 'cloud-offline-outline');
        event.target.complete();
        return;
      }

      // Fetch fresh channel details
      await this.fetchChannelDetails();

      // Trigger posts refresh (PostService should handle this)
      if (this.channelId) {
        await this.postService.refreshPosts(this.channelId);
      }

      this.showToast('Feed refreshed', 'success', 'checkmark-circle-outline');
    } catch (error) {
      // console.error('❌ Refresh failed:', error);
      this.showToast('Refresh failed', 'danger', 'alert-circle-outline');
    } finally {
      this.isRefreshing = false;
      event.target.complete();
    }
  }

  /* =========================
     DATA LOADING - IMPROVED
     ========================= */

  private subscribeToPosts() {
    if (!this.channelId) return;

    this.postsSub = this.postService
      .getPosts(this.channelId)
      .subscribe(async (rawPosts) => {
        const previousLength = this.posts.length;

        if (rawPosts.length === 0 && !this.isOnline) {
          this.isLoadingPosts = false;
          this.cdr.detectChanges();
          return;
        }

        // Resolve media URLs
        const resolvedPosts = await this.resolveMediaUrls(rawPosts);

        this.posts = resolvedPosts;
        this.isLoadingPosts = false;

        // ✨ NEW: Auto-scroll only if new posts arrived
        if (resolvedPosts.length > previousLength && this.shouldScrollToBottom) {
          setTimeout(() => this.scrollToBottom(true), 100);
        }

        this.cdr.detectChanges();
      });
  }

  private subscribeToConnection() {
    this.connectionSub = this.postService
      .getConnectionStatus()
      .subscribe(isConnected => {
        const wasOffline = !this.isOnline;
        this.isOnline = isConnected;

        // ✨ NEW: Show toast when connection changes
        if (wasOffline && isConnected) {
          this.showToast('Back online', 'success', 'cloud-done-outline');
        } else if (!isConnected && !wasOffline) {
          this.showToast('You are offline', 'warning', 'cloud-offline-outline');
        }

        this.cdr.detectChanges();
      });
  }

private async fetchChannelDetails() {
  if (!this.channelId) return;

  // 1️⃣ Try cache first
  const cachedChannel = await this.postPouchDb.getChannel(Number(this.channelId));
  if (cachedChannel) {
    this.channel = cachedChannel;

    const cachedRole = (cachedChannel as any).role_id;
    // console.log("CACHED ROLE:", cachedRole);

    this.canCreatePost =
      cachedChannel.created_by == this.currentUserId ||
      cachedRole === 2;

    this.isMuted = false;
    this.cdr.detectChanges();
  }

  // 2️⃣ Fetch from backend
  try {
    const response = await firstValueFrom(
      this.channelService.getChannel(Number(this.channelId))
    );

    if (response.status && response.channel) {
      this.channel = response.channel;

      let userRole = (response.channel as any).role_id;

      // console.log("ROLE FROM getChannel API:", userRole);

      // 🔥 If role is missing or wrong, fallback to followers API
      if (userRole === undefined || userRole === null) {
        // console.log("Role missing from getChannel, fetching from followers API...");

        const followersRes = await firstValueFrom(
          this.channelService.getChannelFollowers(Number(this.channelId), {
            page: 1,
            limit: 100
          })
        );

        if (followersRes?.followers?.length) {
          const myMembership = followersRes.followers.find(
            (f: any) => f.user_id == this.currentUserId
          );

          userRole = myMembership?.role_id;
          // console.log("ROLE FROM followers API:", userRole);
        }
      }

      // ✅ Final permission check
      this.canCreatePost =
        this.channel.created_by == this.currentUserId ||
        userRole === 2;

      // ✅ Determine if user is following (creator or any role assigned)
      this.isFollowing =
        this.channel.created_by == this.currentUserId ||
        (userRole !== null && userRole !== undefined);

      // console.log("CAN CREATE POST:", this.canCreatePost);

      this.isMuted = false;

      // Save updated channel with role
      (this.channel as any).role_id = userRole;
      await this.postPouchDb.saveChannel(this.channel);

      // console.log('[ChannelFeed] Channel data:', this.channel);
      // console.log('[ChannelFeed] Current User ID:', this.currentUserId);
      this.cdr.detectChanges();
    }
  } catch (error) {
    // console.error('❌ Failed to fetch channel details:', error);

    if (!cachedChannel) {
      this.hasError = true;
      this.errorMessage = 'Failed to load channel details';
    }
  }
}

  /* =========================
     MEDIA URL RESOLUTION
     ========================= */

  private async loadCachedMediaUrls() {
    if (!this.channelId) return;

    try {
      const cachedPosts = await this.postPouchDb.getPosts(this.channelId);

      const mediaIds = cachedPosts
        .filter(p => p.media_id && p.media_id !== 'pending_upload')
        .map(p => p.media_id!);

      const uniqueMediaIds = [...new Set(mediaIds)];

      if (uniqueMediaIds.length === 0) return;

      const urlPromises = uniqueMediaIds.map(id =>
        this.postPouchDb.getMediaUrl(id)
      );
      const urls = await Promise.all(urlPromises);

      urls.forEach((url, index) => {
        if (url) {
          this.mediaCache.set(uniqueMediaIds[index], url);
        }
      });
    } catch (error) {
        // console.error('❌ Failed to load cached media URLs:', error);
    }
  }

  private async resolveMediaUrls(rawPosts: Post[]): Promise<Post[]> {
    const resolvedPosts: Post[] = [];

    for (const post of rawPosts) {
      let resolvedPost = { ...post };

      // Pending post
      if (post.isPending && post.pendingImageId) {
        try {
          const blobUrl = await this.fileStorage.getFileURL(post.pendingImageId);

          if (blobUrl) {
            resolvedPost.image = blobUrl;
            this.blobURLs.add(blobUrl);
          }
        } catch (error) {
          // console.error('❌ Failed to get pending file:', error);
        }
      }
      // Server post
      else if (post.media_id && !post.isPending) {
        let imageResolved = false;

        // Check local server image
        const serverFileId = `server_${post.media_id}`;
        try {
          const exists = await this.fileStorage.fileExists(serverFileId);

          if (exists) {
            const blobUrl = await this.fileStorage.getFileURL(serverFileId);
            if (blobUrl) {
              resolvedPost.image = blobUrl;
              this.blobURLs.add(blobUrl);
              imageResolved = true;
            }
          }
        } catch (error) {
          // console.error('⚠️ Failed to check local server image:', error);
        }

        // Memory cache
        if (!imageResolved && this.mediaCache.has(post.media_id)) {
          resolvedPost.image = this.mediaCache.get(post.media_id);
          imageResolved = true;
        }

        // PouchDB cache
        if (!imageResolved) {
          try {
            const cachedUrl = await this.postPouchDb.getMediaUrl(post.media_id);

            if (cachedUrl) {
              this.mediaCache.set(post.media_id, cachedUrl);
              resolvedPost.image = cachedUrl;
              imageResolved = true;
            }
          } catch (error) {
            // console.error('⚠️ Failed to get cached URL:', error);
          }
        }

        // Fetch from API if online
        if (!imageResolved && this.isOnline) {
          try {
            const response = await this.postService.getFreshMediaUrl(post.media_id);

            if (response?.downloadUrl) {
              this.mediaCache.set(post.media_id, response.downloadUrl);
              await this.postPouchDb.cacheMediaUrl(post.media_id, response.downloadUrl);
              resolvedPost.image = response.downloadUrl;
              imageResolved = true;
            }
          } catch (err) {
            // console.error('❌ Failed to fetch media URL:', err);
          }
        }
      }

      resolvedPosts.push(resolvedPost);
    }

    return resolvedPosts;
  }

  /* =========================
     ✨ IMPROVED: SEND POST
     ========================= */

  async sendPost() {
    if (!this.channelId) return;
    if (!this.newMessage.trim() && !this.selectedAttachment) return;

    // ✨ NEW: Haptic feedback
    await Haptics.impact({ style: ImpactStyle.Light });

    this.isUploading = true;
    this.uploadProgress = 0;

    // ✨ NEW: Disable scroll to bottom for user-sent messages
    this.shouldScrollToBottom = true;

console.log('Value:', this.channelId);
console.log('Type:', typeof this.channelId);
console.log('Value:', this.currentUserId);
console.log('Type:', typeof this.currentUserId);

    try {
      let fileToSend: File | undefined;

      if (this.selectedAttachment) {
        fileToSend = new File(
          [this.selectedAttachment.blob],
          this.selectedAttachment.fileName,
          { type: this.selectedAttachment.mimeType }
        );
      }

      await this.postService.createPost(
        this.channelId,
        this.newMessage.trim(),
        fileToSend,
        this.currentUserId,
        (progress: number) => {
          this.uploadProgress = progress;
          this.cdr.detectChanges();
        }
      );

      // ✨ NEW: Success feedback
      await Haptics.impact({ style: ImpactStyle.Medium });

      // ✨ NEW: Scroll to bottom after sending
      setTimeout(() => this.scrollToBottom(true), 100);

    } catch (error) {
      // console.error('❌ Post creation failed:', error);

      if (!this.isOnline) {
        this.showToast('Offline - Post will be sent when online', 'warning', 'cloud-offline-outline');
      } else {
        this.showToast('Failed to send post', 'danger', 'alert-circle-outline');
      }

      // ✨ NEW: Error haptic
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } finally {
      this.isUploading = false;
      this.uploadProgress = 0;
      this.newMessage = '';
      this.clearAttachment();
      this.cdr.detectChanges();

      // ✨ NEW: Focus input after sending
      setTimeout(() => {
        if (this.messageInput?.nativeElement) {
          this.messageInput.nativeElement.focus();
        }
      }, 100);
    }
  }

  /**
   * Forward a post to private chat
   */
  async forwardPost(post: Post) {
    if (!post) return;

    // ✨ NEW: Haptic feedback
    await Haptics.impact({ style: ImpactStyle.Light });

    // Create a message object compatible with FirebaseChatService.sendForwardMessage
    const forwardMsg: any = {
      text: post.body || '',
      type: post.image ? 'image' : 'text',
      timestamp: Date.now(),
      sender_name: this.authService.authData?.name || '',
      sender_phone: this.authService.authData?.phone_number || '',
    };

    if (post.image) {
      forwardMsg.attachment = {
        type: 'image',
        cdnUrl: post.image,
        previewUrl: post.image,
        mediaId: post.media_id || ''
      };
    }

    // Set the forward message in the service
    this.firebaseChatService.setForwardMessage([forwardMsg]);
    
    // Navigate to forward message selection screen (contacts list)
    this.router.navigate(['/forwardmessage']);
    
    this.showToast('Select a contact to forward this post', 'success', 'arrow-redo-outline');
  }

  /* =========================
     ✨ NEW: SCROLL HELPERS
     ========================= */

  async scrollToBottom(animated: boolean = true) {
    if (this.contentArea) {
      await this.contentArea.scrollToBottom(animated ? 300 : 0);
    }
  }

  onScroll(event: any) {
    // ✨ NEW: Disable auto-scroll if user scrolls up
    const scrollElement = event.detail;
    const scrollTop = scrollElement.scrollTop;
    const scrollHeight = scrollElement.scrollHeight;
    const clientHeight = scrollElement.clientHeight;

    // If user is near bottom (within 100px), enable auto-scroll
    this.shouldScrollToBottom = (scrollHeight - scrollTop - clientHeight) < 100;

    // ✨ NEW: Close reaction popup on scroll
    if (this.showReactionPopup) {
      this.showReactionPopup = false;
      this.cdr.detectChanges();
    }
  }

  /* =========================
     REACTIONS - IMPROVED
     ========================= */

  async react(post: Post, emoji: string) {
    if (!this.isOnline) {
      this.showToast('Cannot react while offline', 'warning', 'cloud-offline-outline');
      return;
    }

    // ✨ NEW: Haptic feedback
    await Haptics.impact({ style: ImpactStyle.Light });

    await this.addOrUpdateReaction(post, emoji);
  }

  async addOrUpdateReaction(post: Post, emoji: string) {
    if (!this.channelId) return;

    if (!this.isOnline) {
      this.showToast('Cannot react while offline', 'warning', 'cloud-offline-outline');
      this.showReactionPopup = false;
      return;
    }

    try {
      await this.postService.addOrUpdateReaction(
        this.channelId,
        post.id,
        emoji,
        this.currentUserId
      );

      this.showReactionPopup = false;

      // ✨ NEW: Success haptic
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (error) {
      // console.error('❌ Failed to add reaction:', error);
      this.showToast('Failed to add reaction', 'danger', 'alert-circle-outline');
    }
  }

  async removeReaction(post: Post) {
    if (!this.channelId) return;

    if (!this.isOnline) {
      this.showToast('Cannot remove reaction while offline', 'warning', 'cloud-offline-outline');
      return;
    }

    try {
      await this.postService.removeReaction(
        this.channelId,
        post.id,
        this.currentUserId
      );

      // ✨ NEW: Haptic feedback
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (error) {
      // console.error('❌ Failed to remove reaction:', error);
      this.showToast('Failed to remove reaction', 'danger', 'alert-circle-outline');
    }
  }

  async openReactionPopup(ev: TouchEvent, post: Post) {
    if (!this.isOnline) {
      this.showToast('Reactions unavailable offline', 'warning', 'cloud-offline-outline');
      return;
    }

    ev.preventDefault();
    this.activePost = post;
    const target = ev.target as HTMLElement;
    const postBubble = target.closest('.post-bubble') as HTMLElement;

    if (postBubble) {
      const rect = postBubble.getBoundingClientRect();
      // ✨ IMPROVED: Better centering logic
      this.popupX = rect.left + (rect.width / 2) - 150;
      this.popupY = rect.top - 80;

      // Keep within screen bounds
      const screenPadding = 16;
      if (this.popupX < screenPadding) this.popupX = screenPadding;
      if (this.popupX + 300 > window.innerWidth) {
        this.popupX = window.innerWidth - 300 - screenPadding;
      }
      
      // If too close to top, show below the bubble
      if (this.popupY < 60) {
        this.popupY = rect.bottom + 10;
      }
    }
    
    this.showReactionPopup = true;
    await Haptics.impact({ style: ImpactStyle.Medium });
    this.cdr.detectChanges();
  }

  async onDoubleTap(post: Post) {
    if (!this.isOnline) {
      this.showToast('Reactions unavailable offline', 'warning', 'cloud-offline-outline');
      return;
    }

    const now = Date.now();
    if (now - this.lastTapTime < 300) {
      await Haptics.impact({ style: ImpactStyle.Light });
      await this.addOrUpdateReaction(post, '❤️');
    }
    this.lastTapTime = now;
  }

  /* =========================
     ✨ IMPROVED: TOAST HELPER
     ========================= */

  async showToast(message: string, color: 'success' | 'warning' | 'danger' = 'warning', icon?: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color,
      position: 'top',
      icon: icon || (color === 'success' ? 'checkmark-circle-outline' : 
                     color === 'danger' ? 'alert-circle-outline' : 
                     'information-circle-outline'),
      cssClass: 'custom-toast',
      buttons: [
        {
          icon: 'close',
          role: 'cancel'
        }
      ]
    });

    await toast.present();
  }

  async showReactionActionSheet(post: Post, emoji: string) {
    const currentUserReaction = await this.postService.getUserReaction(
      this.channelId!,
      post.id,
      this.currentUserId
    );

    const isMyReaction = currentUserReaction === emoji;

    const actionSheet = await this.actionSheetController.create({
      header: 'Manage Reaction',
      cssClass: 'reaction-action-sheet',
      buttons: [
        {
          text: isMyReaction ? 'Remove Reaction' : 'React with ' + emoji,
          icon: isMyReaction ? 'trash-outline' : 'add-circle-outline',
          role: 'destructive',
          handler: async () => {
            if (isMyReaction) {
              await this.removeReaction(post);
            } else {
              await this.addOrUpdateReaction(post, emoji);
            }
          }
        },
        {
          text: 'See all reactions',
          icon: 'people-outline',
          handler: () => {
            this.showAllReactions(post);
          }
        },
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
  }

  async showAllReactions(post: Post) {
    const reactions = this.getAggregatedReactions(post);
    const totalReactions = Object.values(reactions).reduce((sum, count) => sum + count, 0);

    const actionSheet = await this.actionSheetController.create({
      header: `${totalReactions} Reaction${totalReactions !== 1 ? 's' : ''}`,
      cssClass: 'reaction-action-sheet',
      buttons: [
        ...Object.entries(reactions).map(([emoji, count]) => ({
          text: `${emoji} ${count} ${count === 1 ? 'person' : 'people'}`,
          icon: 'people-outline',
          handler: () => {
            // Could show user list modal here
          }
        })),
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
  }

  getAggregatedReactions(post: Post): ReactionMap {
    return this.postService.aggregateReactions(post.user_reactions || null);
  }

  async hasUserReacted(post: Post): Promise<boolean> {
    if (!this.channelId) return false;
    const reaction = await this.postService.getUserReaction(
      this.channelId,
      post.id,
      this.currentUserId
    );
    return reaction !== null;
  }

  async openReactionPicker(post: Post | null) {
    const modal = await this.modalController.create({
      component: EmojiPickerModalComponent,
      cssClass: 'emoji-picker-modal'
    });

    await modal.present();
    const result = await modal.onWillDismiss();

    if (result?.data?.emoji) {
      if (post) {
        await this.addOrUpdateReaction(post, result.data.emoji);
      } else {
        // Aligned with the design: Append emoji to message input if no post is specified
        this.newMessage = (this.newMessage || '') + result.data.emoji;
      }
    }
  }

  /* =========================
     TOUCH INTERACTIONS
     ========================= */

  onTouchStart(ev: TouchEvent, post: Post) {
    this.isLongPress = false;
    
    // ✨ NEW: Initial interaction feedback
    Haptics.impact({ style: ImpactStyle.Light });

    const touch = ev.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;

    // ✨ IMPROVED: Snappier timing (350ms)
    this.longPressTimer = setTimeout(() => {
      this.isLongPress = true;
      this.openReactionPopup(ev, post);
    }, 350);
  }

  onTouchMove(ev: TouchEvent) {
    const touch = ev.touches[0];
    const deltaX = Math.abs(touch.clientX - this.touchStartX);
    const deltaY = Math.abs(touch.clientY - this.touchStartY);
    if (deltaX > 10 || deltaY > 10) {
      clearTimeout(this.longPressTimer);
      this.isLongPress = false;
    }
  }

  onTouchEnd(post: Post) {
    clearTimeout(this.longPressTimer);
    if (!this.isLongPress) {
      this.onDoubleTap(post);
    }
    this.isLongPress = false;
  }

  closePopup() {
    this.showReactionPopup = false;
  }

  /* =========================
     ✨ IMPROVED: MEDIA SELECTION
     ========================= */

  async selectMedia() {
    try {
      const result = await FilePicker.pickFiles({
        readData: true,
      });

      if (!result?.files?.length) return;

      const file = result.files[0];
      const mimeType = file.mimeType || '';
      const fileName = file.name?.toLowerCase() || '';

      // Block video
      if (
        mimeType.startsWith('video/') ||
        fileName.endsWith('.mp4') ||
        fileName.endsWith('.mov') ||
        fileName.endsWith('.mkv') ||
        fileName.endsWith('.avi') ||
        fileName.endsWith('.webm')
      ) {
        this.showToast('Video sharing is not allowed', 'danger', 'videocam-off-outline');
        return;
      }

      // ✨ NEW: Check file size (10MB limit)
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (file.size && file.size > MAX_FILE_SIZE) {
        this.showToast('File too large. Maximum size is 10MB', 'danger', 'alert-circle-outline');
        return;
      }

      const type: 'image' | 'file' = mimeType.startsWith('image/')
        ? 'image'
        : 'file';

      let blob = file.blob as Blob;

      // Fallback for base64
      if (!blob && file.data) {
        const byteCharacters = atob(file.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
      }

      const previewUrl = URL.createObjectURL(blob);
      this.blobURLs.add(previewUrl);

      this.selectedAttachment = {
        type,
        blob,
        fileName: `${Date.now()}_${file.name}`,
        mimeType,
        fileSize: blob.size,
        previewUrl,
      };

      // ✨ NEW: Haptic feedback
      await Haptics.impact({ style: ImpactStyle.Light });

      this.messageText = '';
      this.showPreviewModal = true;
      this.cdr.detectChanges();

    } catch (err) {
      // console.error('Attachment pick failed', err);
      this.showToast('Failed to select file', 'danger', 'alert-circle-outline');
    }
  }

  cancelPreview() {
    this.showPreviewModal = false;
    this.clearAttachment();
  }

  async sendFromPreview() {
    this.newMessage = this.messageText;
    this.showPreviewModal = false;
    await this.sendPost();
  }

  async openCropperModal() {
    if (!this.selectedAttachment || this.selectedAttachment.type !== 'image') {
      return;
    }

    try {
      const base64Image = await this.blobToBase64(this.selectedAttachment.blob);

      const modal = await this.modalController.create({
        component: ImageCropperModalComponent,
        componentProps: {
          imageUrl: base64Image,
          aspectRatio: 0,
          cropQuality: 0.9,
        },
        cssClass: 'image-cropper-modal',
      });

      await modal.present();
      const { data } = await modal.onDidDismiss();

      if (data?.success && data.originalBlob) {
        URL.revokeObjectURL(this.selectedAttachment.previewUrl);

        const newPreviewUrl = URL.createObjectURL(data.originalBlob);

        this.selectedAttachment = {
          ...this.selectedAttachment,
          blob: data.originalBlob,
          previewUrl: newPreviewUrl,
          fileName: `cropped_${Date.now()}.jpg`,
          fileSize: data.originalBlob.size,
          mimeType: data.originalBlob.type,
        };

        this.showToast('Image cropped successfully', 'success', 'crop-outline');
      }
    } catch (err) {
      // console.error('Cropper error:', err);
      this.showToast('Failed to crop image', 'danger', 'alert-circle-outline');
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  clearAttachment() {
    if (this.selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(this.selectedAttachment.previewUrl);
      this.blobURLs.delete(this.selectedAttachment.previewUrl);
    }

    this.selectedAttachment = null;
    this.cdr.detectChanges();
  }

  /* =========================
     FORWARD & OTHER ACTIONS
     ========================= */

  async sharePost(post: Post) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: this.channel?.channel_name || 'Channel Post',
          text: post.body,
          url: post.image || ''
        });
      } catch (err) {
        // User cancelled
      }
    } else {
      this.showToast('Sharing not supported on this device', 'warning', 'alert-circle-outline');
    }
  }

  /* =========================
     MULTI-SELECT
     ========================= */

  enableSelectMode(post: Post) {
    this.selectionMode = true;
    this.selectedPosts.add(post.id);
  }

  toggleSelect(post: Post) {
    if (this.selectedPosts.has(post.id)) {
      this.selectedPosts.delete(post.id);
      if (this.selectedPosts.size === 0) this.selectionMode = false;
    } else {
      this.selectedPosts.add(post.id);
    }
  }

  /* =========================
     UI HELPERS
     ========================= */

  async toggleMute() {
    this.isMuted = !this.isMuted;
    
    const message = this.isMuted ? 'Notifications muted' : 'Notifications enabled';
    const icon = this.isMuted ? 'notifications-off-outline' : 'notifications-outline';
    
    this.showToast(message, 'success', icon);
    this.cdr.detectChanges();
  }

  async followThisChannel() {
    if (!this.channelId || !this.currentUserId) return;
    this.isFollowLoading = true;
    this.cdr.detectChanges();
    try {
      await firstValueFrom(
        this.channelService.followChannel(Number(this.channelId), this.currentUserId)
      );
      // Reload channel details to get updated role
      await this.fetchChannelDetails();
      this.showToast('You are now following this channel', 'success', 'checkmark-circle-outline');
    } catch (error) {
      this.showToast('Failed to follow channel', 'danger', 'alert-circle-outline');
    } finally {
      this.isFollowLoading = false;
      this.cdr.detectChanges();
    }
  }

  async onHeaderClick() {
    if (this.channel && this.channel.channel_id) {
      this.router.navigate(['/channel-detail'], {
        queryParams: { channelId: this.channel.channel_id }
      });
    }
  }

  getUserInitial(userId: number): string {
    return this.channel?.channel_name?.[0] || 'U';
  }

  getUserName(userId: number): string {
    return this.channel?.channel_name || 'Channel Admin';
  }

  
  getDisplayFollowersCount(): number {
    const base = Number(
      (this.channel as any)?.followers_count ??
      (this.channel as any)?.follower_count ??
      0
    );
    const adjusted = base - 1;
    return adjusted > 0 ? adjusted : 0;
  }

  // ✨ NEW: Format file size helper
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // ✨ NEW: Check if post is recent (for highlighting)
  isRecentPost(post: Post): boolean {
    if (!post.timestamp) return false;
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return post.timestamp > fiveMinutesAgo;
  }

  isMyPost(post: Post): boolean {
    return post.created_by == this.currentUserId;
  }

  // ✨ NEW: TrackBy function for better performance
  trackByPostId(index: number, post: Post): string {
    return post.id;
  }

  // ✨ NEW: Handle image loading errors
  onImageError(event: any) {
    // console.error('Failed to load image:', event);
    // Optional: Set a placeholder or hide the image
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      imgElement.style.display = 'none';
    }
  }

  /* =========================
     THREE-DOT MENU
     ========================= */

  async openOptions(ev: any) {
    const isCreator = this.canCreatePost;
    const isFollowing = this.isFollowing;

    const popover = await this.popoverCtrl.create({
      component: ChannelFeedMenuComponent,
      componentProps: { isCreator, isFollowing },
      event: ev,
      translucent: true,
    });

    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data?.selected) {
      this.handleMenuOption(data.selected);
    }
  }

  async handleMenuOption(option: string) {
    switch (option) {
      case 'Channel Info':
        if (this.channel?.channel_id) {
          this.router.navigate(['/channel-detail'], {
            queryParams: { channelId: this.channel.channel_id }
          });
        }
        break;

      case 'Search':
        this.showSearchBar = true;
        setTimeout(() => {
          const input = document.querySelector('ion-input');
          (input as HTMLIonInputElement)?.setFocus();
        }, 100);
        break;

      case 'Share':
        if (this.channel?.channel_id) {
          const channelLink = `https://telldemm.app/channel/${this.channel.channel_id}`;
          try {
            await Share.share({
              title: this.channel.channel_name,
              text: `Check out this channel on Telldemm: ${this.channel.channel_name}`,
              url: channelLink,
              dialogTitle: 'Share Channel',
            });
          } catch (error) {
            // user cancelled or share not available
          }
        }
        break;

      case 'Invite Admins':
        await this.openInviteAdminsModal();
        break;

      case 'Channel Settings':
        await this.openChannelSettingsModal();
        break;

      case 'Report':
        await this.showToast('Report submitted (coming soon)', 'warning', 'flag-outline');
        break;

      case 'Unfollow':
        await this.confirmUnfollow();
        break;
    }
  }

  private async openChannelSettingsModal() {
    if (!this.channel) return;
    const modal = await this.modalController.create({
      component: ChannelSettingsModalComponent,
      componentProps: { channel: this.channel },
      cssClass: 'channel-settings-modal',
    });
    await modal.present();
  }

  private async openInviteAdminsModal() {
    if (!this.channel) return;
    const modal = await this.modalController.create({
      component: InviteAdminContactsModalComponent,
      componentProps: { channel: this.channel },
      cssClass: 'invite-admin-contacts-modal',
    });
    await modal.present();
  }

  private async confirmUnfollow() {
    if (!this.channelId || !this.currentUserId) return;
    const actionSheet = await this.actionSheetController.create({
      header: `Unfollow ${this.channel?.channel_name || 'channel'}?`,
      buttons: [
        {
          text: 'Unfollow',
          role: 'destructive',
          icon: 'person-remove-outline',
          handler: async () => {
            try {
              await firstValueFrom(
                this.channelService.unfollowChannel(
                  Number(this.channelId),
                  this.currentUserId
                )
              );
              this.isFollowing = false;
              await this.showToast('You unfollowed this channel', 'success', 'checkmark-circle-outline');
            } catch {
              await this.showToast('Failed to unfollow', 'danger', 'alert-circle-outline');
            }
          },
        },
        { text: 'Cancel', role: 'cancel', icon: 'close' },
      ],
    });
    await actionSheet.present();
  }

  /* =========================
     SEARCH
     ========================= */

  onSearchInput() {
    const elements = Array.from(
      document.querySelectorAll('.post-text')
    ) as HTMLElement[];

    elements.forEach((el) => {
      el.innerHTML = el.textContent || '';
      el.style.backgroundColor = 'transparent';
    });

    if (!this.searchText.trim()) {
      this.matchedMessages = [];
      this.currentSearchIndex = -1;
      return;
    }

    const regex = new RegExp(`(${this.escapeRegExp(this.searchText)})`, 'gi');

    this.matchedMessages = [];

    elements.forEach((el) => {
      const originalText = el.textContent || '';
      if (regex.test(originalText)) {
        const highlightedText = originalText.replace(
          regex,
          `<mark style="background: yellow;">$1</mark>`
        );
        el.innerHTML = highlightedText;
        this.matchedMessages.push(el);
      }
    });

    this.currentSearchIndex = this.matchedMessages.length ? 0 : -1;

    if (this.currentSearchIndex >= 0) {
      this.matchedMessages[this.currentSearchIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }

  navigateSearch(direction: 'up' | 'down') {
    if (!this.matchedMessages.length) return;
    if (direction === 'up') {
      this.currentSearchIndex =
        (this.currentSearchIndex - 1 + this.matchedMessages.length) %
        this.matchedMessages.length;
    } else {
      this.currentSearchIndex =
        (this.currentSearchIndex + 1) % this.matchedMessages.length;
    }
    this.highlightPost(this.currentSearchIndex);
  }

  highlightPost(index: number) {
    this.matchedMessages.forEach((el) => {
      const originalText = el.textContent || '';
      el.innerHTML = originalText;
      el.style.backgroundColor = 'transparent';
    });

    if (!this.searchText.trim()) return;

    const regex = new RegExp(`(${this.escapeRegExp(this.searchText)})`, 'gi');

    this.matchedMessages.forEach((el) => {
      const originalText = el.textContent || '';
      el.innerHTML = originalText.replace(
        regex,
        `<mark style="background: yellow;">$1</mark>`
      );
    });

    const target = this.matchedMessages[index];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  cancelSearch() {
    this.searchText = '';
    this.showSearchBar = false;
    this.matchedMessages.forEach((el) => {
      el.innerHTML = el.textContent || '';
      el.style.backgroundColor = 'transparent';
    });
    this.matchedMessages = [];
    this.currentSearchIndex = -1;
  }

  openPopoverCalendar(ev: any) {
    this.showDateModal = true;
  }

  onDateSelected(event: any) {
    const selectedDateObj = new Date(event.detail.value);
    const today = new Date();

    if (selectedDateObj > today) {
      this.showToast('Cannot select future dates', 'warning');
      return;
    }

    const day = String(selectedDateObj.getDate()).padStart(2, '0');
    const month = String(selectedDateObj.getMonth() + 1).padStart(2, '0');
    const year = selectedDateObj.getFullYear();

    const formattedDate = `${day}/${month}/${year}`;

    this.selectedDate = event.detail.value;
    this.showDateModal = false;

    setTimeout(() => {
      const el = document.getElementById('date-group-' + formattedDate);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        this.showToast('No posts found for this date', 'warning');
      }
    }, 300);
  }

  private escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}