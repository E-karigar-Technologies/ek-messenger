import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonicModule,
  PopoverController,
  ToastController,
} from '@ionic/angular';
import { MenuPopoverComponent } from '../../components/menu-popover/menu-popover.component';
import { FooterTabsComponent } from '../../components/footer-tabs/footer-tabs.component';
import { FirebaseChatService } from '../../services/firebase-chat.service';
import { AuthService } from '../../auth/auth.service';
import { Database, get, ref } from 'firebase/database';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChatPouchDb, CachedCommunity, CommunityGroup } from '../../services/chat-pouch-db';
import { NetworkService } from '../../services/network-connection/network.service';
import { Subscription } from 'rxjs';

interface Community {
  id: string;
  name: string;
  icon: string;
  groups: CommunityGroup[];
  displayGroups: CommunityGroup[];
  totalGroups: number;
  hasMore: boolean;
}

@Component({
  selector: 'app-community',
  templateUrl: './community.page.html',
  styleUrls: ['./community.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FooterTabsComponent, TranslateModule],
})
export class CommunityPage implements OnInit, OnDestroy {
  userId = this.authService.authData?.userId as string;
  joinedCommunities: Community[] = [];
  selectedCommunity: any = null;
  communityGroups: any[] = [];
  loading = false;
  isSyncing = false;
  isOffline = false;

  skeletonCommunities = Array(3);

  private networkSub: Subscription | null = null;
  private isInitialLoadComplete = false;

  constructor(
    private router: Router,
    private popoverCtrl: PopoverController,
    private actionSheetCtrl: ActionSheetController,
    private firebaseService: FirebaseChatService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private translate: TranslateService,
    private chatPouchDb: ChatPouchDb,
    private networkService: NetworkService,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    this.setupNetworkMonitoring();
  }

  async ionViewWillEnter() {
    try {

      if (this.isInitialLoadComplete) {
        console.log('✅ Communities already loaded, using cached data...');

        // ✅ Just refresh the view (instant)
        this.cdr.detectChanges();

        // ✅ Silently sync in background (no loader, non-blocking)
        if (this.networkService.isOnline.value && !this.isSyncing) {
          this.syncInBackgroundSilently();
        }

        return;
      }

      this.loading = true;
      console.log('🚀 First time loading communities...');

      await this.loadCommunitiesFromCache();

      this.loading = false;

      this.isInitialLoadComplete = true;

      if (this.networkService.isOnline.value) {
        this.syncInBackground();
      }

    } catch (error) {
      console.error('❌ Error in ionViewWillEnter:', error);
      this.loading = false;

      if (!this.networkService.isOnline.value) {
        await this.showToast('Using cached data (offline)', 'warning');
      } else {
        await this.showToast('Failed to load communities', 'danger');
      }
    }
  }

  ngOnDestroy() {
    if (this.networkSub) {
      this.networkSub.unsubscribe();
      this.networkSub = null;
    }

    console.log('🔵 Component destroyed but data retained in memory');
  }

  // ==========================================
  // 🔥 NETWORK MONITORING
  // ==========================================

  /**
   * Setup network status monitoring
   */
  private setupNetworkMonitoring(): void {
    this.networkSub = this.networkService.isOnline$.subscribe(
      async (isOnline) => {
        const wasOffline = this.isOffline;
        this.isOffline = !isOnline;

        console.log(`🌐 Network status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

        if (isOnline && wasOffline) {
          console.log('📡 Back online - syncing communities...');
          await this.showToast('Back online - syncing...', 'success');
          this.syncInBackgroundSilently();
        } else if (!isOnline && !wasOffline) {
          console.log('📴 Went offline - using cached data');
          await this.showToast('You are offline', 'warning');
        }
      }
    );

    this.isOffline = !this.networkService.isOnline.value;
  }

  // ==========================================
  // 🔥 CACHE LOADING (INSTANT)
  // ==========================================

  /**
   * Load communities from PouchDB cache (instant - ~50ms)
   */
  private async loadCommunitiesFromCache(): Promise<void> {
    try {
      console.log('📦 Loading communities from PouchDB cache...');
      // const startTime = performance.now();

      const cachedCommunities = await this.chatPouchDb.getCommunities(this.userId);

      // const loadTime = performance.now() - startTime;
      // console.log(`⏱️ Cache load time: ${loadTime.toFixed(2)}ms`);

      if (cachedCommunities.length > 0) {
        this.joinedCommunities = cachedCommunities;
        console.log(`✅ Loaded ${cachedCommunities.length} communities from cache`);
      } else {
        console.log('📭 No cached communities found');
        this.joinedCommunities = []; // Empty array for empty state
      }

      // ✅ Trigger change detection
      this.cdr.detectChanges();

    } catch (error) {
      console.error('❌ Error loading from cache:', error);
      this.joinedCommunities = [];
    }
  }

  // ==========================================
  // 🔥 BACKGROUND SYNC
  // ==========================================

  /**
   * Initial background sync (first load)
   */
  private async syncInBackground() {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress');
      return;
    }

    this.isSyncing = true;
    console.log('🔄 Initial background sync started...');

    try {
      await this.syncCommunitiesWithServer();
      console.log('✅ Initial sync completed');
    } catch (error) {
      console.warn('⚠️ Background sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Silent background sync (subsequent visits)
   */
  private async syncInBackgroundSilently() {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress');
      return;
    }

    this.isSyncing = true;
    console.log('🔄 Silent background sync started...');

    try {
      await this.syncCommunitiesWithServer();
      console.log('✅ Silent sync completed');
    } catch (error) {
      console.warn('⚠️ Silent sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  // ==========================================
  // 🔥 SERVER SYNC (OPTIMIZED - PARALLEL)
  // ==========================================

  /**
   * Sync communities with Firebase server (OPTIMIZED)
   */
  private async syncCommunitiesWithServer(): Promise<void> {
    try {
      if (!this.networkService.isOnline.value) {
        console.log('📴 Skipping sync - offline');
        return;
      }

      console.log('🔄 Syncing communities with server...');
      const startTime = performance.now();

      const communityIds = await this.firebaseService.getUserCommunities(this.userId);

      if (communityIds.length === 0) {
        console.log('📭 No communities to sync');
        this.joinedCommunities = [];
        this.cdr.detectChanges();
        return;
      }

      // 🔥 OPTIMIZATION 1: Process ALL communities in PARALLEL
      const communityPromises = communityIds.map(cid =>
        this.fetchCommunityWithGroups(cid)
      );

      const communities = await Promise.allSettled(communityPromises);

      const validCommunities: CachedCommunity[] = communities
        .filter((result): result is PromiseFulfilledResult<CachedCommunity> =>
          result.status === 'fulfilled' && result.value !== null
        )
        .map(result => result.value);

      // ✅ Save ALL to PouchDB
      if (validCommunities.length > 0) {
        await this.chatPouchDb.saveCommunities(this.userId, validCommunities, true);
        this.joinedCommunities = validCommunities;

        const syncTime = performance.now() - startTime;
        console.log(`✅ Synced ${validCommunities.length} communities in ${syncTime.toFixed(2)}ms`);
      } else {
        this.joinedCommunities = [];
      }

      // ✅ Trigger change detection
      this.cdr.detectChanges();

    } catch (error) {
      console.error('❌ Error syncing communities:', error);
    }
  }

  /**
   * Fetch single community with groups (optimized)
   */
  private async fetchCommunityWithGroups(cid: string): Promise<CachedCommunity | null> {
    try {
      // Fetch community data
      const commSnap = await get(
        ref(this.firebaseService['db'] as Database, `communities/${cid}`)
      );

      if (!commSnap.exists()) {
        console.warn(`Community ${cid} not found`);
        return null;
      }

      const commData = commSnap.val();

      // 🔥 OPTIMIZATION 2: Load groups in parallel
      const allGroups = await this.loadGroupsForCommunityParallel(cid);

      // Sort and prepare display
      const sortedGroups = this.sortGroups(allGroups);
      const displayGroups = sortedGroups.slice(0, 3);
      const hasMore = sortedGroups.length > 3;

      const community: CachedCommunity = {
        id: cid,
        name: commData.title || commData.name || this.translate.instant('community.unnamedCommunity'),
        icon: commData.avatar || commData.icon || 'assets/images/user.jfif',
        groups: sortedGroups,
        displayGroups,
        totalGroups: sortedGroups.length,
        hasMore,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
      };

      // 🔥 Save groups to cache in background (non-blocking)
      this.chatPouchDb.saveCommunityGroups(cid, sortedGroups, false)
        .catch(err => console.warn('Group cache save failed:', err));

      return community;

    } catch (err) {
      console.error(`Error loading community ${cid}:`, err);
      return null;
    }
  }

  /**
   * Load groups for community in PARALLEL (not sequential)
   */
  private async loadGroupsForCommunityParallel(communityId: string): Promise<CommunityGroup[]> {
    try {
      // ✅ Try cache first
      const cachedGroups = await this.chatPouchDb.getCommunityGroups(communityId);

      if (cachedGroups.length > 0 && !this.networkService.isOnline.value) {
        console.log(`✅ Using cached groups for community ${communityId}`);
        return cachedGroups;
      }

      // ✅ Fetch from server if online
      if (this.networkService.isOnline.value) {
        const groupIds = await this.firebaseService.getGroupsInCommunity(communityId);

        if (groupIds.length === 0) {
          console.log(`📭 No groups found for community ${communityId}`);
          return [];
        }

        // 🔥 CRITICAL OPTIMIZATION: Fetch ALL groups in PARALLEL
        const groupPromises = groupIds.map(gid => this.fetchGroupInfo(gid));
        const groupResults = await Promise.allSettled(groupPromises);

        const allGroups: CommunityGroup[] = groupResults
          .filter((result): result is PromiseFulfilledResult<CommunityGroup> =>
            result.status === 'fulfilled' && result.value !== null
          )
          .map(result => result.value);

        console.log(`✅ Loaded ${allGroups.length} groups for community ${communityId}`);
        return allGroups;
      }

      return cachedGroups; // Fallback to cache

    } catch (error) {
      console.error(`Error loading groups for community ${communityId}:`, error);
      return [];
    }
  }

  /**
   * Fetch single group info
   */
  private async fetchGroupInfo(gid: string): Promise<CommunityGroup | null> {
    try {
      const gData = await this.firebaseService.getGroupInfo(gid);

      if (!gData) {
        console.warn(`Group ${gid} not found`);
        return null;
      }

      const groupName = gData.title || gData.name || 'Unnamed Group';
      const isSystemGroup =
        groupName === 'Announcements' ||
        groupName === 'General' ||
        gData.type === 'announcement';

      return {
        id: gid,
        name: groupName,
        type: gData.type || 'normal',
        createdAt: gData.createdAt || 0,
        isSystemGroup,
      };

    } catch (error) {
      console.warn(`Failed to fetch group ${gid}:`, error);
      return null;
    }
  }

  // ==========================================
  // 🔥 UTILITY METHODS
  // ==========================================

  /**
   * Sort groups: Announcement → General → Others (by creation date)
   */
  private sortGroups(groups: CommunityGroup[]): CommunityGroup[] {
    return groups.sort((a, b) => {
      // System groups first
      if (a.isSystemGroup && !b.isSystemGroup) return -1;
      if (!a.isSystemGroup && b.isSystemGroup) return 1;

      // Within system groups: Announcements first, then General
      if (a.isSystemGroup && b.isSystemGroup) {
        if (a.name === 'Announcements') return -1;
        if (b.name === 'Announcements') return 1;
        if (a.name === 'General') return -1;
        if (b.name === 'General') return 1;
      }

      // Other groups sorted by creation date
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  /**
   * Get icon based on group type
   */
  getGroupIcon(group: CommunityGroup): string {
    if (group.name === 'Announcements' || group.type === 'announcement') {
      return 'megaphone-outline';
    }
    if (group.name === 'General') {
      return 'people-outline';
    }
    return 'chatbox-outline';
  }

  /**
   * Get translated group type
   */
  getGroupTypeLabel(group: CommunityGroup): string {
    const typeKey = group.type || 'normal';
    return this.translate.instant(`community.groupType.${typeKey}`);
  }

  /**
   * Helper: Show toast
   */
  private async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
    });
    await toast.present();
  }

  private async checkNetworkBeforeAction(
  action:
    | 'createCommunity'
    | 'refresh'
): Promise<boolean> {
  // 🔥 Real-time network status
  const currentStatus = this.networkService.isOnline.value;

  // Update local UI state
  this.isOffline = !currentStatus;
  this.cdr.detectChanges();

  console.log(
    `🔍 Network check for "${action}": ${currentStatus ? 'ONLINE' : 'OFFLINE'}`
  );

  if (!currentStatus) {
    await this.showOfflineAlert(action);
    return false;
  }

  return true;
}


private async showOfflineAlert(
  action: 'createCommunity' | 'refresh'
) {
  const messages: Record<typeof action, string> = {
    createCommunity:
      'You are offline. Please connect to the internet to create a new community.',
    refresh:
      'You are offline. Please connect to the internet to refresh communities.',
  };

  const alert = await this.alertCtrl.create({
    header: "You're Offline",
    message:
      messages[action] ||
      'You are offline. Please connect to the internet to continue.',
    buttons: [
      {
        text: 'OK',
        role: 'cancel',
      },
    ],
  });

  await alert.present();
}


  // ==========================================
  // 🔥 USER ACTIONS
  // ==========================================

  /**
   * Create new community
   */
  async createCommunityPrompt() {
     if (!(await this.checkNetworkBeforeAction('createCommunity'))) {
    return;
  }
    this.router.navigate(['/new-community']);
  }

  /**
   * Navigate to group chat
   */
  async goToGroupChat(groupId: string) {
    if (!groupId) {
      console.error('Invalid group ID');
      return;
    }

    // Find group details from cached data
    let groupName = 'Group Chat';
    let communityId = '';

    for (const community of this.joinedCommunities) {
      const foundGroup = community.groups.find(g => g.id === groupId);
      if (foundGroup) {
        groupName = foundGroup.name;
        communityId = community.id;
        break;
      }
    }

    // ✅ CRITICAL: Open chat with Firebase service to load all data
    const chatObject = {
      roomId: groupId,
      type: 'group',
      title: groupName,
      communityId: communityId || undefined,
    };

    await this.firebaseService.openChat(chatObject);

    // Navigate to community chat (consistent with community-detail page)
    this.router.navigate(['/community-chat'], {
      queryParams: {
        receiverId: groupId,
      },
    });
  }

  /**
   * View all groups in community detail page
   */
  goToAddGroupCommunity(community: Community) {
    this.router.navigate(['/community-detail'], {
      queryParams: { communityId: community.id },
      state: {
        communityName: community.name,
        communityIcon: community.icon,
      },
    });
  }

  /**
   * Pull-to-refresh support
   */
  async refreshCommunities(event?: any) {
    try {
      if (!(await this.checkNetworkBeforeAction('refresh'))) {
      if (event) event.target.complete();
      return;
    }

      console.log('🔄 Manual refresh triggered');

      // Force sync from server
      await this.syncCommunitiesWithServer();
      await this.showToast('Communities refreshed', 'success');

    } catch (error) {
      console.error('Refresh error:', error);
      await this.showToast('Refresh failed', 'danger');
    } finally {
      if (event) {
        event.target.complete();
      }
    }
  }

  /**
   * Present menu popover
   */
  async presentPopover(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();
  }

  // ==========================================
  // 🔥 PUBLIC API (for external reset)
  // ==========================================

  /**
   * Reset page state (call ONLY on logout)
   */
  public resetPageState() {
    console.log('🔄 Resetting community page state (logout)');
    this.isInitialLoadComplete = false;
    this.joinedCommunities = [];
    this.loading = false;
    this.isSyncing = false;
  }

  // ==========================================
  // 🔥 LEGACY METHODS (keep for compatibility)
  // ==========================================

  /**
   * @deprecated Use ionViewWillEnter instead
   */
  async loadUserCommunities() {
    console.warn('loadUserCommunities is deprecated, data loads automatically');
  }

  /**
   * @deprecated Legacy method
   */
  async openCommunityGroups(community: any) {
    console.warn('openCommunityGroups is deprecated');
    this.selectedCommunity = community;
    this.communityGroups = [];

    const groupIds = await this.firebaseService.getGroupsInCommunity(community.id);
    for (const gid of groupIds) {
      const groupData = await this.firebaseService.getGroupInfo(gid);
      if (groupData) {
        this.communityGroups.push({
          id: gid,
          name: groupData.title || groupData.name,
          type: groupData.type,
        });
      }
    }
  }

  setDefaultCommunityIcon(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/community_icon.svg';
  }
}