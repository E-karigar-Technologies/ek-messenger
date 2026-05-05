import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  NavController,
  PopoverController,
  ModalController,
  ToastController,
  LoadingController,
} from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseChatService } from '../../../services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import {
  SqliteService,
  IConversation,
  IGroup,
} from '../../../services/sqlite.service';

// Popover component
import { CommunityMenuPopoverComponent } from '../../components/community-menu-popover/community-menu-popover.component';

// Group preview modal component
import { GroupPreviewModalComponent } from '../../components/group-preview-modal/group-preview-modal.component';
import { AlertController } from '@ionic/angular';
import { Database, get, ref, onValue, off } from 'firebase/database';
import { get as rtdbGet, getDatabase, ref as rtdbRef } from 'firebase/database';
import { ApiService } from 'src/app/services/api/api.service';
import { firstValueFrom } from 'rxjs';
import { ChatPouchDb } from '../../../services/chat-pouch-db';
import { NetworkService } from '../../../services/network-connection/network.service';

interface CommunityGroup extends IConversation {
  membersCount?: number;
  isMember?: boolean;
  name?: string;
  description?: string;
  id?: string;
}

@Component({
  selector: 'app-community-detail',
  templateUrl: './community-detail.page.html',
  styleUrls: ['./community-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class CommunityDetailPage implements OnInit, OnDestroy {
  communityId: string | null = null;
  community: any = null;
  announcementGroup: CommunityGroup | null = null;
  generalGroup: CommunityGroup | null = null;
  groupsIn: CommunityGroup[] = [];
  groupsAvailable: CommunityGroup[] = [];
  loading = false;

  memberCount = 0;
  groupCount = 0;

  currentUserId: string = '';
  currentUserName: string = '';
  currentUserPhone: string = '';
  isCreator: boolean = false;
  allCommunityGroups: IGroup[] = [];

  // ✅ Real-time listener cleanup functions
  private communityListener: (() => void) | null = null;
  private groupListeners: Map<string, () => void> = new Map();

  pendingSuggestions: any[] = [];
  pendingCount = 0;

  constructor(
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private router: Router,
    private firebaseService: FirebaseChatService,
    private popoverCtrl: PopoverController,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private sqliteService: SqliteService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private api: ApiService,
    private chatPouchDb: ChatPouchDb,
    private networkService: NetworkService
  ) {}

  ngOnInit() {
    this.currentUserId = this.authService?.authData?.userId
      ? String(this.authService.authData.userId)
      : localStorage.getItem('userId') || '';
    this.currentUserName = this.authService?.authData?.name
      ? String(this.authService.authData.name)
      : localStorage.getItem('name') || '';
    this.currentUserPhone = this.authService?.authData?.phone_number || '';
  }

  async ionViewWillEnter() {
    this.route.queryParams.subscribe(async (params) => {
      const cid = params['receiverId'] || params['communityId'] || params['id'];
      if (!cid) return;

      // ✅ If community changed, cleanup old listeners
      if (this.communityId && this.communityId !== cid) {
        this.cleanupListeners();
      }

      this.communityId = cid;

      // 🔥 Set loading true immediately to prevent flicker
      this.loading = true;

      // 🔥 NEW: Always try to load from cache first for instant display
      await this.loadGroupsFromCache();

      // 🔥 Then setup real-time listeners if online
      if (this.networkService.isOnline.value) {
        console.log('🌐 Online mode - setting up real-time listeners');
        this.setupRealtimeListeners();
        // 🔥 NEW: Preload all groups data in background
        this.preloadAllGroupsDataInBackground();
      } else {
        console.log('📴 Offline mode - using cached data only');
      }
    });
  }

  ionViewWillLeave() {
    // ✅ Cleanup when leaving page
    this.cleanupListeners();
  }

  ngOnDestroy() {
    // ✅ Cleanup when component destroyed
    this.cleanupListeners();
  }

  /**
   * ✅ NEW: Setup real-time listeners for community and its groups
   */
  private async setupRealtimeListeners() {
    if (!this.communityId) return;

    this.loading = true;

    try {
      const db = getDatabase();
      const communityRef = ref(db, `communities/${this.communityId}`);

      // ✅ Listen to community changes
      this.communityListener = onValue(communityRef, async (snapshot) => {
        if (!snapshot.exists()) {
          console.warn('Community not found');
          this.loading = false;
          return;
        }

        this.community = snapshot.val();
        if (
          this.community.createdBy === this.currentUserId ||
          this.community.ownerId === this.currentUserId ||
          this.isCurrentUserCommunityAdminOrOwner()
        ) {
          this.loadPendingCount();
        }

        this.isCreator = this.community.createdBy === this.currentUserId;
        this.memberCount = Object.keys(this.community.members || {}).length;

        // ✅ Get group IDs from community
        const groupIds = Object.keys(this.community.groups || {});

        let visibleCount = 0;
        for (const groupId of groupIds) {
          const db = getDatabase();
          const groupSnap = await rtdbGet(rtdbRef(db, `groups/${groupId}`));
          if (!groupSnap.exists()) continue;

          const groupData = groupSnap.val();
          const visibility = groupData.visibility || 'Visible';

          const isMember =
            groupData.members &&
            Object.keys(groupData.members).includes(this.currentUserId);

          // const isAdmin =
          //   this.community?.adminIds?.includes(this.currentUserId) ||
          //   this.community?.createdBy === this.currentUserId ||
          //   (groupData.adminIds &&
          //     groupData.adminIds.includes(this.currentUserId));

          const isAdmin =
            this.isCurrentUserCommunityAdminOrOwner() ||
            (groupData.adminIds &&
              (Array.isArray(groupData.adminIds)
                ? groupData.adminIds
                    .map(String)
                    .includes(String(this.currentUserId))
                : Object.values(groupData.adminIds)
                    .map(String)
                    .includes(String(this.currentUserId))));

          if (visibility === 'Visible' || isMember || isAdmin) {
            visibleCount++;
          }
        }

        this.groupCount = visibleCount;

        // ✅ Remove listeners for groups that no longer exist
        for (const [gid, cleanup] of this.groupListeners.entries()) {
          if (!groupIds.includes(gid)) {
            cleanup();
            this.groupListeners.delete(gid);
            this.removeGroupFromUI(gid);
          }
        }

        // ✅ Setup listeners for each group
        for (const groupId of groupIds) {
          if (!this.groupListeners.has(groupId)) {
            this.listenToGroup(groupId);
          }
        }

        this.loading = false;
      });
    } catch (err) {
      console.error('setupRealtimeListeners error', err);
      this.loading = false;

      const toast = await this.toastCtrl.create({
        message: 'Failed to load community details',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async loadPendingCount() {
    if (!this.communityId) return;
    try {
      this.pendingCount = await this.firebaseService.getPendingGroupsCount(
        this.communityId
      );
    } catch (e) {
      console.warn('loadPendingCount failed:', e);
    }
  }

  openPendingGroups() {
    this.router.navigate(['/pending-groups'], {
      queryParams: { communityId: this.communityId },
    });
  }

  isCurrentUserCommunityAdminOrOwner(): boolean {
    if (!this.community) return false;

    if (this.community.createdBy === this.currentUserId) return true;
    if (this.community.ownerId === this.currentUserId) return true;

    const adminIds = this.community.adminIds;
    if (!adminIds) return false;

    if (Array.isArray(adminIds)) {
      return adminIds.map(String).includes(String(this.currentUserId));
    }

    return Object.values(adminIds)
      .map(String)
      .includes(String(this.currentUserId));
  }

  /**
   * ✅ NEW: Listen to individual group changes
   */
  private listenToGroup(groupId: string) {
    const db = getDatabase();
    const groupRef = ref(db, `groups/${groupId}`);

    const unsubscribe = onValue(groupRef, async (snapshot) => {
      if (!snapshot.exists()) {
        this.removeGroupFromUI(groupId);
        return;
      }

      const groupData = snapshot.val();

      const isMember =
        groupData.members &&
        Object.keys(groupData.members).includes(this.currentUserId);

      // const isAdmin =
      //   this.community?.adminIds?.includes(this.currentUserId) ||
      //   this.community?.createdBy === this.currentUserId ||
      //   (groupData.adminIds && groupData.adminIds.includes(this.currentUserId));

      const isAdmin =
        this.isCurrentUserCommunityAdminOrOwner() ||
        (groupData.adminIds &&
          (Array.isArray(groupData.adminIds)
            ? groupData.adminIds
                .map(String)
                .includes(String(this.currentUserId))
            : Object.values(groupData.adminIds)
                .map(String)
                .includes(String(this.currentUserId))));

      const visibility = groupData.visibility || 'Visible';

      // Hidden group: sirf members aur admins ko dikhe
      if (visibility === 'Hidden' && !isMember && !isAdmin) {
        this.removeGroupFromUI(groupId);
        return;
      }

      const group = this.convertToConversation(
        { ...groupData, id: groupId, roomId: groupId },
        isMember
      );

      this.updateGroupInUI(group);
    });

    this.groupListeners.set(groupId, unsubscribe);
  }

  /**
   * ✅ NEW: Update group in UI
   */
  private updateGroupInUI(group: CommunityGroup) {
    const groupName = group.name || group.title || '';

    // ✅ Update Announcement Group
    if (groupName === 'Announcements') {
      this.announcementGroup = group;
      return;
    }

    // ✅ Update General Group
    if (groupName === 'General') {
      this.generalGroup = group;
      return;
    }

    // ✅ Update other groups
    if (group.isMember) {
      // Remove from available if exists
      this.groupsAvailable = this.groupsAvailable.filter(
        (g) => g.roomId !== group.roomId
      );

      // Update or add to groupsIn
      const existingIndex = this.groupsIn.findIndex(
        (g) => g.roomId === group.roomId
      );

      if (existingIndex >= 0) {
        this.groupsIn[existingIndex] = group;
      } else {
        this.groupsIn.push(group);
      }

      // Sort by creation date
      this.groupsIn.sort(
        (a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0)
      );
    } else {
      // Remove from groupsIn if exists
      this.groupsIn = this.groupsIn.filter((g) => g.roomId !== group.roomId);

      // Update or add to groupsAvailable
      const existingIndex = this.groupsAvailable.findIndex(
        (g) => g.roomId === group.roomId
      );

      if (existingIndex >= 0) {
        this.groupsAvailable[existingIndex] = group;
      } else {
        this.groupsAvailable.push(group);
      }

      // Sort alphabetically
      this.groupsAvailable.sort((a, b) =>
        (a.title || '').localeCompare(b.title || '')
      );
    }

    console.log('UI updated for group:', group.roomId);
  }

  /**
   * ✅ NEW: Remove group from UI
   */
  private removeGroupFromUI(groupId: string) {
    // Remove from announcement
    if (this.announcementGroup?.roomId === groupId) {
      this.announcementGroup = null;
    }

    // Remove from general
    if (this.generalGroup?.roomId === groupId) {
      this.generalGroup = null;
    }

    // Remove from groupsIn
    this.groupsIn = this.groupsIn.filter((g) => g.roomId !== groupId);

    // Remove from groupsAvailable
    this.groupsAvailable = this.groupsAvailable.filter(
      (g) => g.roomId !== groupId
    );

    console.log('Group removed from UI:', groupId);
  }

  /**
   * ✅ NEW: Cleanup all listeners
   */
  private cleanupListeners() {
    // Cleanup community listener
    if (this.communityListener) {
      try {
        this.communityListener();
      } catch (e) {
        console.warn('Error cleaning up community listener:', e);
      }
      this.communityListener = null;
    }

    // Cleanup group listeners
    for (const [gid, cleanup] of this.groupListeners.entries()) {
      try {
        cleanup();
      } catch (e) {
        console.warn(`Error cleaning up listener for group ${gid}:`, e);
      }
    }
    this.groupListeners.clear();

    console.log('All listeners cleaned up');
  }

  /**
   * ✅ LEGACY: Keep for manual refresh (if needed)
   */
  async loadCommunityDetail() {
    if (!this.communityId) return;
    this.loading = true;

    try {
      this.community = await this.firebaseService.getCommunityDetails(
        this.communityId
      );
      console.log('Community details:', this.community);

      if (!this.community) {
        this.memberCount = 0;
        this.groupCount = 0;
        this.loading = false;
        return;
      }

      this.isCreator = this.community.createdBy === this.currentUserId;
      this.memberCount = Object.keys(this.community.members || {}).length;

      await this.syncGroupsWithFirebase();
      await this.getAllGroups();
    } catch (err) {
      console.error('loadCommunityDetail error', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to load community details',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.loading = false;
    }
  }

  async getAllGroups() {
    try {
      const groupIds = Object.keys(this.community.groups);
      const db = getDatabase();

      this.allCommunityGroups = [];

      for (const groupId of groupIds) {
        const groupRef = ref(db, `groups/${groupId}`);
        const groupSnapshot = await rtdbGet(groupRef);
        const group = groupSnapshot.val();

        if (group) {
          this.allCommunityGroups.push(group);
        }
      }

      console.log('all groups', this.allCommunityGroups);
    } catch (error) {
      console.error('something went wrong', error);
    }
  }

  /**
   * 🔹 Sync groups with Firebase (background)
   */
  private async syncGroupsWithFirebase() {
    try {
      const announcementGroup = this.firebaseService.currentConversations.find(
        (c) => c.title === 'Announcements' && c.communityId === this.communityId
      );

      if (announcementGroup) {
        this.announcementGroup = this.convertToConversation(
          announcementGroup,
          true
        );
      }

      const generalGroup = this.firebaseService.currentConversations.find(
        (c) => c.title === 'General' && c.communityId === this.communityId
      );

      if (generalGroup) {
        this.generalGroup = this.convertToConversation(generalGroup, true);
      }

      const allGroups = this.firebaseService.currentConversations.filter(
        (c) => c.type === 'group' && c.communityId === this.communityId
      );

      this.groupsIn = allGroups
        .filter(
          (c) =>
            c.members?.includes(this.currentUserId) &&
            c.title != 'Announcements' &&
            c.title != 'General'
        )
        .map((g) => this.convertToConversation(g, true));

      this.groupsAvailable = allGroups
        .filter(
          (c) =>
            !c.members?.includes(this.currentUserId) &&
            c.title != 'Announcements' &&
            c.title != 'General'
        )
        .map((g) => this.convertToConversation(g, false));

      this.groupCount = allGroups.length;
    } catch (error) {
      console.error('Error syncing with Firebase:', error);
    }
  }

  /**
   * 🔹 Convert Firebase group to IConversation format
   */
  private convertToConversation(group: any, isMember: boolean): CommunityGroup {
    const title = group.name || group.title || 'Unnamed Group';
    const roomId = group.id || group.roomId;
    const members = group.members ? Object.keys(group.members) : [];

    // 🔥 Use provided membersCount if available, otherwise calculate from members
    const membersCount =
      group.membersCount !== undefined
        ? group.membersCount
        : members.length || 0;

    return {
      roomId: roomId,
      id: roomId,
      title: title,
      name: title,
      description: group.description || '',
      type: 'group',
      avatar: group.avatar || '',
      members: members,
      adminIds: group.adminIds || [],
      createdAt: group.createdAt ? new Date(group.createdAt) : new Date(),
      updatedAt: new Date(),
      lastMessage: '',
      lastMessageType: 'text',
      unreadCount: 0,
      isArchived: false,
      isPinned: false,
      isLocked: false,
      membersCount: membersCount,
      isMember: isMember,
    } as CommunityGroup;
  }

  goToaddgroupcommunity() {
    this.router.navigate(['/add-group-community'], {
      queryParams: { communityId: this.communityId },
    });
  }

  async openGroupPreview(group: any) {
    if (!group) return;

    const groupId = group.roomId || group.id;

    // Fetch group avatar from API
    let groupAvatar = 'assets/images/user.jfif';
    try {
      const res: any = await firstValueFrom(this.api.getGroupDp(groupId));
      groupAvatar = res?.group_dp_url || 'assets/images/user.jfif';
      console.log('✅ Group avatar fetched:', groupAvatar);
    } catch (err) {
      console.error('❌ Error loading group avatar:', err);
      groupAvatar = 'assets/images/user.jfif';
    }
    // console.log("group avatar",groupAvatar)

    const groupData = {
      roomId: groupId,
      id: groupId,
      name: group.name || group.title,
      title: group.name || group.title,
      description: group.description || '',
      membersCount: group.membersCount || 0,
      members: group.members || [],
      createdBy: group.createdBy || '',
      createdByName: group.createdByName || '',
      createdAt: group.createdAt,
      avatar: groupAvatar,
      communityId: this.communityId,
    };

    console.log('Opening group preview with data:', groupData);

    const modal = await this.modalCtrl.create({
      component: GroupPreviewModalComponent,
      componentProps: {
        group: groupData,
        communityName: this.community?.title || this.community?.name || '',
        currentUserId: this.currentUserId,
        currentUserName: this.currentUserName,
        currentUserPhone: this.currentUserPhone,
      },
      cssClass: 'group-preview-modal-wrapper',
      breakpoints: [0, 0.45, 0.9],
      initialBreakpoint: 0.45,
      backdropDismiss: true,
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data && data.action === 'join' && data.groupId) {
      await this.joinGroup(data.groupId);
    }
  }

  async joinGroup(groupId: string) {
    if (!this.currentUserId) {
      const t = await this.toastCtrl.create({
        message: 'Please login to join group',
        duration: 1800,
        color: 'danger',
      });
      await t.present();
      return;
    }

    try {
      const result = await this.firebaseService.joinCommunityGroup(
        groupId,
        this.currentUserId,
        {
          username: this.currentUserName,
          phoneNumber: this.currentUserPhone,
        }
      );

      if (result.success) {
        // ✅ Real-time listener will automatically update UI
        const toast = await this.toastCtrl.create({
          message: result.message,
          duration: 1600,
          color: 'success',
        });
        await toast.present();
      } else {
        const toast = await this.toastCtrl.create({
          message: result.message,
          duration: 1800,
          color: result.message.includes('already') ? 'medium' : 'danger',
        });
        await toast.present();
      }
    } catch (err) {
      console.error('joinGroup error', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to join group',
        duration: 1800,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async leaveGroup(groupId: string) {
    if (!this.currentUserId) {
      const toast = await this.toastCtrl.create({
        message: 'User not found',
        duration: 1800,
        color: 'danger',
      });
      await toast.present();
      return;
    }

    try {
      const result = await this.firebaseService.leaveCommunityGroup(
        groupId,
        this.currentUserId
      );

      if (result.success) {
        // ✅ Real-time listener will automatically update UI
        const toast = await this.toastCtrl.create({
          message: result.message,
          duration: 1600,
          color: 'success',
        });
        await toast.present();
      } else {
        const toast = await this.toastCtrl.create({
          message: result.message,
          duration: 1800,
          color: 'danger',
        });
        await toast.present();
      }
    } catch (err) {
      console.error('leaveGroup error', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to leave group',
        duration: 1800,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async openGroupChat(groupId: string | undefined, groupName?: string) {
    if (!groupId) {
      console.error('Invalid group ID');
      return;
    }

    const isMember =
      this.groupsIn.some((g) => g.roomId === groupId) ||
      (this.announcementGroup && this.announcementGroup.roomId === groupId) ||
      (this.generalGroup && this.generalGroup.roomId === groupId);

    if (!isMember) {
      const grp = this.groupsAvailable.find((g) => g.roomId === groupId) || {
        roomId: groupId,
        title: groupName,
      };
      this.openGroupPreview(grp);
      return;
    }

    const chatObject = {
      roomId: groupId,
      type: 'group',
      title: groupName || 'Group Chat',
      communityId: this.communityId,
    };

    await this.firebaseService.openChat(chatObject);

    this.router.navigate(['/community-chat'], {
      queryParams: {
        receiverId: groupId,
      },
    });
  }

  async openAnnouncementChat() {
    if (!this.announcementGroup) return;
    await this.openGroupChat(
      this.announcementGroup.roomId,
      this.announcementGroup.title
    );
  }

  async openGeneralChat() {
    if (!this.generalGroup) return;
    await this.openGroupChat(this.generalGroup.roomId, this.generalGroup.title);
  }

  back() {
    this.navCtrl.back();
  }

  async presentPopover(ev: any) {
    const pop = await this.popoverCtrl.create({
      component: CommunityMenuPopoverComponent,
      componentProps: {
        isCreator: this.isCreator,
      },
      event: ev,
      translucent: true,
    });

    await pop.present();

    const { data } = await pop.onDidDismiss();
    if (!data || !data.action) return;

    const action: string = data.action;
    switch (action) {
      case 'info':
        this.router.navigate(['/community-info'], {
          queryParams: { communityId: this.communityId },
        });
        break;
      case 'invite':
        this.router.navigate(['/add-members-community'], {
          queryParams: {
            communityId: this.communityId,
            mode: 'invite',
          },
        });
        break;
      case 'settings':
        this.router.navigate(['/community-settings'], {
          queryParams: { communityId: this.communityId },
        });
        break;
      case 'members':
        this.router.navigate(['/community-members'], {
          queryParams: { communityId: this.communityId },
        });
        break;
      case 'exit':
        this.exitCommunity();
        break;
      default:
        break;
    }
  }

  async exitCommunity() {
    if (!this.communityId || !this.currentUserId) {
      const toast = await this.toastCtrl.create({
        message: 'Unable to exit community',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
      return;
    }

    if (this.isCreator) {
      const toast = await this.toastCtrl.create({
        message:
          'Creator cannot exit the community. Please assign a new owner first.',
        duration: 3000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Exit Community',
      message: `Are you sure you want to exit "${
        this.community.name || 'this community'
      }"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Exit',
          role: 'destructive',
          handler: async () => {
            await this.performExitCommunity();
          },
        },
      ],
    });

    await alert.present();
  }

  private async performExitCommunity() {
    console.log('this exit community function called');
    const loading = await this.loadingCtrl.create({
      message: 'Exiting community...',
    });
    await loading.present();

    try {
      const result = await this.firebaseService.exitCommunity(
        this.communityId!,
        this.currentUserId
      );

      await loading.dismiss();

      if (result.success) {
        const toast = await this.toastCtrl.create({
          message: 'Successfully exited the community',
          duration: 2000,
          color: 'success',
        });
        await toast.present();

        this.router.navigate(['/home-screen'], { replaceUrl: true });
      } else {
        const toast = await this.toastCtrl.create({
          message: result.message,
          duration: 2000,
          color: 'danger',
        });
        await toast.present();
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Exit community error:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to exit community. Please try again.',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  /**
   * 🔥 NEW: Load groups from cache (offline mode)
   */
  private async loadGroupsFromCache(): Promise<void> {
    if (!this.communityId) return;

    try {
      console.log('📦 Loading community data from cache...');

      // Load cached community info
      const cachedData = await this.chatPouchDb.getCachedCommunityInfo(
        this.communityId
      );

      if (!cachedData || !cachedData.community) {
        console.warn('❌ No cached community data found');

        // Only show error if offline (if online, real-time listeners will load data)
        if (!this.networkService.isOnline.value) {
          this.loading = false;
          const toast = await this.toastCtrl.create({
            message: 'No offline data available. Please connect to internet.',
            duration: 3000,
            color: 'warning',
          });
          await toast.present();
        }
        // If online, keep loading true until real-time listeners load data
        return;
      }

      // Set community data
      this.community = cachedData.community;
      this.memberCount = cachedData.memberCount || 0;
      this.groupCount = cachedData.groupCount || 0;
      this.isCreator = this.community.createdBy === this.currentUserId;

      console.log(
        `✅ Loaded community from cache: ${this.groupCount} groups, ${this.memberCount} members`
      );

      // Load all groups from cache
      const groupIds = Object.keys(this.community.groups || {});

      // Reset group arrays
      this.announcementGroup = null;
      this.generalGroup = null;
      this.groupsIn = [];
      this.groupsAvailable = [];

      for (const groupId of groupIds) {
        await this.loadSingleGroupFromCache(groupId);
      }

      console.log(`✅ Loaded ${groupIds.length} groups from cache`);

      // 🔥 Set loading false only after cache data is displayed
      this.loading = false;
    } catch (error) {
      console.error('❌ Error loading from cache:', error);
      // If error and offline, show loading false
      if (!this.networkService.isOnline.value) {
        this.loading = false;
      }
    }
  }

  /**
   * 🔥 NEW: Load single group from cache
   */

  private async loadSingleGroupFromCache(groupId: string): Promise<void> {
    try {
      const cachedGroup = await this.chatPouchDb.getCachedGroupDetails(groupId);

      if (!cachedGroup || !cachedGroup.meta) {
        console.warn(`No cached data for group ${groupId}`);
        return;
      }

      const groupData = cachedGroup.meta;

      const isMember =
        cachedGroup.members &&
        cachedGroup.members.some(
          (m: any) => String(m.user_id) === String(this.currentUserId)
        );

      // const isAdmin =
      //   this.community?.adminIds?.includes(this.currentUserId) ||
      //   this.community?.createdBy === this.currentUserId;

      const isAdmin = this.isCurrentUserCommunityAdminOrOwner();

      const visibility = groupData.visibility || 'Visible';

      // Hidden group: sirf members aur admins ko dikhe
      if (visibility === 'Hidden' && !isMember && !isAdmin) {
        return;
      }

      const group = this.convertToConversation(
        {
          ...groupData,
          id: groupId,
          roomId: groupId,
          membersCount: cachedGroup.members?.length || 0,
        },
        isMember
      );

      this.updateGroupInUI(group);

      console.log(
        `✅ Loaded cached group: ${group.title} (isMember: ${isMember})`
      );
    } catch (error) {
      console.error(`❌ Error loading cached group ${groupId}:`, error);
    }
  }

  /**
   * 🔥 NEW: Preload all groups data in background (non-blocking)
   */
  private async preloadAllGroupsDataInBackground(): Promise<void> {
    // Run in background without blocking UI
    setTimeout(async () => {
      try {
        await this.preloadAllGroupsData();
      } catch (error) {
        console.warn('Background preload failed:', error);
      }
    }, 1000);
  }

  /**
   * 🔥 NEW: Preload all groups data (details + chats) into PouchDB
   */
  private async preloadAllGroupsData(): Promise<void> {
    if (!this.communityId) {
      console.warn('No communityId for preloading');
      return;
    }

    try {
      console.log(
        '🔄 Starting background preload of all groups in community:',
        this.communityId
      );

      // Get all groups in this community
      const db = getDatabase();
      const communityRef = rtdbRef(db, `communities/${this.communityId}`);
      const communitySnap = await get(communityRef);

      if (!communitySnap.exists()) {
        console.warn('Community not found');
        return;
      }

      const communityData = communitySnap.val();
      const groupIds = Object.keys(communityData.groups || {});

      console.log(`📦 Found ${groupIds.length} groups to preload`);

      if (groupIds.length === 0) {
        return;
      }

      // 🔥 PARALLEL PRELOAD: Process all groups simultaneously
      const preloadPromises = groupIds.map((groupId) =>
        this.preloadSingleGroupData(groupId)
      );

      const results = await Promise.allSettled(preloadPromises);

      // Count successful preloads
      const successCount = results.filter(
        (r) => r.status === 'fulfilled'
      ).length;

      console.log(
        `✅ Background preload complete: ${successCount}/${groupIds.length} groups`
      );
    } catch (error) {
      console.error('❌ Error in background preload:', error);
    }
  }

  /**
   * 🔥 Preload single group data (details, members, messages)
   */
  private async preloadSingleGroupData(groupId: string): Promise<void> {
    try {
      console.log(`📥 Preloading group: ${groupId}`);

      const db = getDatabase();

      // 1️⃣ Fetch group metadata
      const groupRef = rtdbRef(db, `groups/${groupId}`);
      const groupSnap = await get(groupRef);

      if (!groupSnap.exists()) {
        console.warn(`Group ${groupId} not found`);
        return;
      }

      // 🔒 Skip preload for groups user is NOT a member of — Firebase rules deny reads
      const groupDataCheck = groupSnap.val();
      const isMemberCheck =
        groupDataCheck?.members &&
        Object.prototype.hasOwnProperty.call(groupDataCheck.members, this.currentUserId);
      if (!isMemberCheck) {
        console.log(`⏭️ Skipping preload for non-member group: ${groupId}`);
        return;
      }

      const groupData = groupSnap.val();

      // 2️⃣ Fetch group members with profiles
      const members = groupData.members || {};
      const memberIds = Object.keys(members);
      const adminIds = groupData.adminIds || [];

      const memberProfiles = await Promise.all(
        memberIds.map(async (userId) => {
          try {
            const profileRes: any = await firstValueFrom(
              this.api.getUserProfilebyId(userId)
            );
            return {
              user_id: userId,
              username: profileRes?.name || 'Unknown',
              phoneNumber: profileRes?.phone_number || '',
              avatar: profileRes?.profile || 'assets/images/user.jfif',
              isAdmin: adminIds.includes(userId),
            };
          } catch {
            return {
              user_id: userId,
              username: members[userId]?.username || 'Unknown',
              phoneNumber: members[userId]?.phoneNumber || '',
              avatar: 'assets/images/user.jfif',
              isAdmin: adminIds.includes(userId),
            };
          }
        })
      );

      // 3️⃣ Cache group details in PouchDB
      await this.chatPouchDb.cacheGroupDetails(groupId, {
        meta: {
          id: groupId,
          title: groupData.title || groupData.name,
          name: groupData.name || groupData.title,
          icon: groupData.icon || '',
          description: groupData.description || '',
          createdAt: groupData.createdAt || Date.now(),
          createdBy: groupData.createdBy || '',
          type: groupData.type || 'group',
          communityId: this.communityId,
        },
        members: memberProfiles,
        adminIds,
      });

      // 4️⃣ Fetch and cache messages (last 50 messages)
      const messagesRef = rtdbRef(db, `chats/${groupId}`);
      const messagesSnap = await get(messagesRef);

      if (messagesSnap.exists()) {
        const allMessages = messagesSnap.val();
        const messageArray = Object.keys(allMessages)
          .map((msgId) => {
            const msg = allMessages[msgId];
            return {
              msgId,
              sender: msg.sender || msg.senderId,
              senderName: msg.senderName || msg.sender_name || '',
              message: msg.message || msg.text || '',
              timestamp: msg.timestamp || Date.now(),
              type: msg.type || 'text',
              isMe:
                msg.sender === this.currentUserId ||
                msg.senderId === this.currentUserId,
              reactions: msg.reactions || {},
              repliedTo: msg.repliedTo || null,
              deletedForMe: msg.deletedForMe || false,
              isDeleted: msg.isDeleted || false,
              receipts: msg.receipts || {},
              status: msg.status || 'sent',
              ...msg, // Keep other fields
            };
          })
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
          .slice(0, 50); // Cache last 50 messages

        console.log(
          `📥 Fetched ${messageArray.length} messages for group ${groupId}`
        );
        await this.chatPouchDb.saveMessages(groupId, messageArray, true);
        console.log(
          `✅ Cached ${messageArray.length} messages for group ${groupId}`
        );
      } else {
        console.log(`📭 No messages found for group ${groupId}`);
      }

      // 5️⃣ Update conversation in PouchDB
      const lastMessage = groupData.lastMessage || '';
      const lastMessageAt = groupData.lastMessageAt || new Date();

      await this.chatPouchDb.updateConversationField(
        this.currentUserId,
        groupId,
        {
          roomId: groupId,
          title: groupData.title || groupData.name,
          type: 'group',
          lastMessage: lastMessage,
          lastMessageAt:
            lastMessageAt instanceof Date
              ? lastMessageAt
              : new Date(lastMessageAt),
          unreadCount: 0,
          communityId: this.communityId || undefined,
        }
      );

      console.log(`✅ Successfully preloaded group ${groupId}`);
    } catch (error) {
      console.error(`❌ Failed to preload group ${groupId}:`, error);
      throw error;
    }
  }
}
