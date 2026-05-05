import {
  ChangeDetectorRef,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  PopoverController,
  ActionSheetController,
  ToastController,
  AlertController,
  LoadingController,
} from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import {
  getDatabase,
  ref,
  get,
  remove,
  set,
  update,
  child,
  off,
} from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { UseraboutMenuComponent } from '../components/userabout-menu/userabout-menu.component';
import { ActionSheetButton } from '@ionic/angular';
import { FirebaseChatService } from '../services/firebase-chat.service';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';
import { NavController } from '@ionic/angular';
import { NgZone } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { ApiService } from '../services/api/api.service';
import { push } from 'firebase/database';
import { query, limitToLast, onValue } from 'firebase/database';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  GroupMemberDisplay,
  IGroup,
  IGroupMember,
} from '../services/sqlite.service';
import { ChatPouchDb } from '../services/chat-pouch-db';
import { NetworkService } from '../services/network-connection/network.service';
import { ModalController } from '@ionic/angular';
import { ChatListFilterService } from '../services/chat-list-filter.service';
import { ChooseListSheetComponent } from '../components/choose-list-sheet/choose-list-sheet.component';
import { ReportModalComponent } from '../components/report-modal/report-modal.component';
// removed unused firstValueFrom import
// import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-userabout',
  templateUrl: './userabout.page.html',
  styleUrls: ['./userabout.page.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [IonicModule, CommonModule, TranslateModule],
})
export class UseraboutPage implements OnInit {
  receiverId: string = '';
  receiver_phone: string = '';
  receiver_name: string = '';
  groupId: string = '';
  isGroup: boolean = false;
  chatType: 'private' | 'group' = 'private';
  groupName: string = '';
  // groupMembers: {
  //   user_id: string;
  //   name: string;
  //   phone: string;
  //   avatar?: string;
  //   role?: string;
  //   phone_number?: string;
  //   publicKeyHex?: string | null;
  // }[] = [];

  groupMeta: {
    title: string;
    description: string;
    createdBy: string;
    createdAt: string;
    avatar?: any;
  } | null = null;

  groupMembers: GroupMemberDisplay[] = [];

  groupData: IGroup | null = null;
  groupMemberssda: { userId: string; data: IGroupMember; avatar?: string }[] =
    []; //new type of groupMember
  commonGroups: any[] = [];
  receiverAbout: string = '';
  statusTime: string = '';
  receiverAboutUpdatedAt: string = '';

  adminIds: string[] = [];
  groupDescription: string = '';
  groupCreatedBy: string = '';
  groupCreatedAt: string = '';
  hasPastMembers = false;
  receiverProfile: string | null = null;
  chatTitle: string | null = null;

  isScrolled: boolean = false;
  currentUserId = '';
  showPastMembersButton: boolean = false;

  iBlocked = false; // I blocked them
  theyBlocked = false; // They blocked me

  // to keep refs so we can detach listeners later
  private iBlockedRef: any = null;
  private theyBlockedRef: any = null;
  socialMediaLinks: { platform: string; profile_url: string }[] = [];
  communityId: string = '';
  isCurrentUserMember: boolean = true;

  private _iBlockedLoaded = false;
  private _theyBlockedLoaded = false;

  private groupMembershipRef: any = null;
  private groupMembershipUnsubscribe: (() => void) | null = null;
  showAllCommonGroups: boolean = false;
  private groupMetaRef: any = null;
  private groupMetaUnsubscribe: (() => void) | null = null;
  isOffline = false;
  private pastMembersUnsubscribe: (() => void) | null = null;
  disappearingDuration: string = 'off';
  canAddMembers: boolean = true;
  canEditGroupSettings: boolean = true;
  canInviteViaLink: boolean = false;
  private _permissionsUnsubscribe: (() => void) | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private popoverCtrl: PopoverController,
    private actionSheetCtrl: ActionSheetController,
    private toastCtrl: ToastController,
    private firebaseChatService: FirebaseChatService,
    private secureStorage: SecureStorageService,
    private navCtrl: NavController,
    private zone: NgZone,
    private authService: AuthService,
    private service: ApiService,
    private alertCtrl: AlertController,
    private translate: TranslateService,
    private loadingCtrl: LoadingController,
    private chatPouchDb: ChatPouchDb,
    private networkService: NetworkService,
    private cdr: ChangeDetectorRef,
    private modalCtrl: ModalController,
    private chatListFilterService: ChatListFilterService
  ) {}

  ngOnInit() {
    // this.route.queryParams.subscribe(async params => {
    //   this.receiverId = params['receiverId'] || '';
    //   this.receiver_phone = params['receiver_phone'] || '';
    //   this.isGroup = params['isGroup'] === 'true';
    //   this.chatType = this.isGroup ? 'group' : 'private';
    //   this.receiver_name = (await this.secureStorage.getItem('receiver_name')) || '';
    //   this.currentUserId = this.authService.authData?.userId || '';
    //   this.groupId = this.route.snapshot.queryParamMap.get('receiverId') || '';
    //   //console.log("group id checking:", this.groupId);
    //   //console.log("isGroup:", this.isGroup);
    //   this.loadReceiverProfile();
    //   this.communityId = this.route.snapshot.queryParamMap.get('communityId') || '';
    //   if (this.chatType === 'group') {
    //     // use shared service to fetch group + member profiles
    //     try {
    //       const { groupName, groupMembers } = await this.firebaseChatService.fetchGroupWithProfiles(this.receiverId);
    //       this.groupName = groupName;
    //       this.groupMembers = groupMembers;
    //     } catch (err) {
    //       console.warn('Failed to fetch group with profiles', err);
    //       this.groupName = 'Group';
    //       this.groupMembers = [];
    //     }
    //     await this.fetchGroupMeta(this.receiverId);
    //   } else {
    //     // await this.fetchReceiverAbout(this.receiverId);
    //   }
    // });
    // this.checkForPastMembers();
    // this.findCommonGroups(this.currentUserId, this.receiverId);
    // this.checkIfBlocked();
  }

  /** Normalize any Firebase adminIds value (array or object) to string[] */
  private normalizeAdminIds(val: any): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'object') return Object.keys(val);
    return [];
  }

  isAdmin(userId: string): boolean {
    return this.adminIds.includes(String(userId));
  }
  
  async ionViewWillEnter() {
    console.log('📱 ionViewWillEnter - Loading user/group details...');

    this.isOffline = !this.networkService.isOnline.value;
    console.log(
      `📡 Network Status: ${this.isOffline ? 'OFFLINE 🔴' : 'ONLINE 🟢'}`
    );

    const params = this.route.snapshot.queryParams;
    const receiverIdFromParams = params['receiverId'] || '';
    const isGroupParam = params['isGroup'];
    this.chatType = isGroupParam === 'true' ? 'group' : 'private';

    const currentChat = this.firebaseChatService.currentChat;
    this.currentUserId = this.authService.authData?.userId || '';
    await this.loadAddMembersPermission();
    await this.loadEditGroupSettingsPermission();
    await this.loadInviteViaLinkPermission();

    if (this.chatType === 'group') {
      this.setupPermissionsListener();
    }
    console.log('UseraboutPage currentUserId set to:', this.currentUserId);
    if (!currentChat) {
      console.error('❌ No current chat found in service');
      this.navCtrl.back();
      return;
    }

    if (this.chatType === 'private') {
      if (currentChat) {
        const parts = currentChat.roomId.split('_');
        if (this.currentUserId) {
          this.receiverId =
            parts.find((p) => String(p) !== String(this.currentUserId)) ??
            receiverIdFromParams;
        } else {
          this.receiverId = receiverIdFromParams;
        }
        this.receiver_name = currentChat.title || '';
        this.receiver_phone =
          currentChat.phoneNumber || params['receiver_phone'] || '';
        this.receiverProfile = currentChat.avatar || null;
      } else {
        // Fallback if currentChat is missing
        this.receiverId = receiverIdFromParams;
        this.receiver_name = params['receiver_name'] || '';
        this.receiver_phone = params['receiver_phone'] || '';
      }

      // 🔥 EXPLICITLY check block status here
      if (this.receiverId) {
        await this.checkIfBlocked();
      }
    } else {
      if (currentChat) {
        this.receiverId = currentChat.roomId || receiverIdFromParams;
        this.groupName = currentChat.title || '';
        this.receiverProfile = (currentChat as any).groupAvatar || null;
      } else {
        this.receiverId = receiverIdFromParams;
        this.groupName = params['groupName'] || 'Group';
      }
    }

    console.log('📋 Extracted Details:', {
      receiverId: this.receiverId,
      receiver_phone: this.receiver_phone,
      receiver_name: this.receiver_name,
      chatType: this.chatType,
      iBlocked: this.iBlocked,
      theyBlocked: this.theyBlocked,
    });

    // this.chatTitle = currentChat?.title || null;
    this.chatTitle = this.firebaseChatService.getResolvedChatTitle(currentChat);
    this.groupId = this.receiverId || '';

    await this.loadFromCache();

    if (this.chatType === 'group') {
      await this.checkForPastMembers();
    }

    this.loadReceiverProfile();
    await this.loadDisappearingSetting();

    const isOnline = this.networkService.isOnline.value;
    console.log(`📡 Network status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

    if (isOnline) {
      this.syncDataInBackground().catch((err) =>
        console.warn('Background sync failed:', err)
      );
    } else {
      await this.showToast('Using cached data (offline)', 'warning');
    }
  }

  /**
   * 🔥 NEW: Load all data from cache
   */
  private async loadFromCache(): Promise<void> {
    try {
      console.log('📦 Loading from cache...');
      const startTime = performance.now();

      if (this.chatType === 'group') {
        await this.loadGroupDataFromCache();
      } else {
        await this.loadUserDataFromCache();
      }

      // ✅ Common groups sirf private chats ke liye load karo
      if (this.chatType === 'private') {
        const cachedCommonGroups = await this.chatPouchDb.getCachedCommonGroups(
          this.currentUserId,
          this.receiverId
        );

        if (cachedCommonGroups && cachedCommonGroups.length > 0) {
          this.commonGroups = cachedCommonGroups;
          console.log(
            `✅ Loaded ${this.commonGroups.length} common groups from cache`
          );
        }
      }

      const loadTime = performance.now() - startTime;
      console.log(`⏱️ Cache load time: ${loadTime.toFixed(2)}ms`);
    } catch (error) {
      console.error('❌ Error loading from cache:', error);
    }
  }

  /**
   * 🔥 NEW: Load user data from cache
   */
  private async loadUserDataFromCache(): Promise<void> {
    try {
      const cachedProfile = await this.chatPouchDb.getCachedUserProfile(
        this.receiverId
      );

      if (cachedProfile) {
        this.receiverProfile =
          cachedProfile.profile || 'assets/images/user.jfif';
        this.receiverAbout = cachedProfile.dp_status || '';
        this.statusTime = cachedProfile.dp_status_updated_on || '';

        console.log('✅ Loaded user profile from cache');
      }

      // Load social media from cache
      const cachedSocialMedia =
        await this.chatPouchDb.getCachedSocialMediaLinks(this.receiverId);
      if (cachedSocialMedia && cachedSocialMedia.length > 0) {
        this.socialMediaLinks = cachedSocialMedia;
        console.log('✅ Loaded social media from cache');
      }
    } catch (error) {
      console.error('❌ Error loading user data from cache:', error);
    }
  }

  /**
   * NEW: Load group data from cache
   */
  private async loadGroupDataFromCache(): Promise<void> {
    try {
      const cachedGroupDetails = await this.chatPouchDb.getCachedGroupDetails(
        this.receiverId
      );

      if (cachedGroupDetails) {
        const { meta, members, adminIds } = cachedGroupDetails;

        if (meta) {
          this.groupMeta = meta;
          this.groupName = meta.title || 'Group';
          this.groupDescription = meta.description || '';
          this.groupCreatedBy = meta.createdBy || '';
          this.groupCreatedAt = meta.createdAt || '';
          this.chatTitle = meta.title;

          // ✅ Load group avatar from cache
          if (meta.avatar) {
            this.receiverProfile = meta.avatar;
            console.log(
              '✅ Loaded group avatar from cache:',
              this.receiverProfile
            );
          }

          console.log('✅ Loaded group meta from cache');
        }

        if (members && members.length > 0) {
          this.groupMembers = await this.membersWithDeviceNames(members);

          // Check membership
          this.isCurrentUserMember = members.some(
            (member) => String(member.user_id) === String(this.currentUserId)
          );

          console.log(`✅ Loaded ${members.length} group members from cache`);
        }

        if (adminIds && (Array.isArray(adminIds) ? adminIds.length > 0 : Object.keys(adminIds).length > 0)) {
          this.adminIds = this.normalizeAdminIds(adminIds);
          console.log('✅ Loaded admin IDs from cache');
        }
      } else {
        console.warn('⚠️ No cached group details found');
      }
    } catch (error) {
      console.error('❌ Error loading group data from cache:', error);
    }
  }

  /**
   * 🔥 NEW: Sync data in background when online
   */
  private async syncDataInBackground(): Promise<void> {
    try {
      console.log('🔄 Starting background sync...');

      if (this.chatType === 'group') {
        // Sync group data — common groups group ke liye nahi hote
        await Promise.all([this.syncGroupData(), this.checkForPastMembers()]);
      } else {
        // Sync user data
        await Promise.all([
          this.syncUserProfile(),
          this.syncSocialMedia(),
          this.syncCommonGroups(),
          this.checkIfBlocked(), // ✅ Check block status for private chats
        ]);
      }

      console.log('✅ Background sync completed');
    } catch (error) {
      console.error('❌ Background sync failed:', error);
    }
  }

  /**
   * 🔥 NEW: Sync user profile
   */
  private async syncUserProfile(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.service.getUserProfilebyId(this.receiverId).subscribe({
        next: async (res: any) => {
          this.receiverProfile = res?.profile || 'assets/images/user.jfif';
          this.receiverAbout = res?.dp_status;
          this.statusTime = res?.dp_status_updated_on;

          // Cache the profile
          await this.chatPouchDb.cacheUserProfile(this.receiverId, res);

          console.log('✅ User profile synced and cached');
          resolve();
        },
        error: (err) => {
          console.error('❌ Error syncing user profile:', err);
          reject(err);
        },
      });
    });
  }

  /**
   * 🔥 NEW: Sync social media links
   */
  private async syncSocialMedia(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.service.getSocialMedia(Number(this.receiverId)).subscribe({
        next: async (res: any) => {
          if (res?.success && Array.isArray(res.data)) {
            this.socialMediaLinks = res.data;

            // Cache social media links
            await this.chatPouchDb.cacheSocialMediaLinks(
              this.receiverId,
              res.data
            );

            console.log('✅ Social media synced and cached');
          }
          resolve();
        },
        error: (err) => {
          console.error('❌ Error syncing social media:', err);
          reject(err);
        },
      });
    });
  }

  /**
   * 🔥 NEW: Sync group data
   */
  /**
   * 🔥 UPDATED: Sync group data (ensure avatar is cached)
   */
  private async syncGroupData(): Promise<void> {
    try {
      // Setup real-time listeners
      this.setupGroupMembershipListener();
      await this.setupGroupMetaListener(this.receiverId);
      this.setupPastMembersListener();

      // Fetch group data
      const { groupName, groupMembers } =
        await this.firebaseChatService.fetchGroupWithProfiles(this.receiverId);

      this.groupName = groupName;
      this.groupMembers = await this.membersWithDeviceNames(groupMembers);

      this.isCurrentUserMember = this.groupMembers.some(
        (member) => String(member.user_id) === String(this.currentUserId)
      );

      this.adminIds = await this.firebaseChatService.getGroupAdminIds(
        this.receiverId
      );

      // ✅ Fetch and cache group avatar
      try {
        const dpResponse: any = await this.service
          .getGroupDp(this.receiverId)
          .toPromise();

        if (dpResponse?.group_dp_url) {
          this.receiverProfile = dpResponse.group_dp_url;

          // ✅ Update meta with avatar
          if (this.groupMeta) {
            this.groupMeta.avatar = this.receiverProfile;
          }

          console.log('✅ Fetched group avatar:', this.receiverProfile);
        }
      } catch (err) {
        console.warn('⚠️ Failed to fetch group avatar:', err);
      }

      // ✅ Cache group details (including avatar)
      await this.chatPouchDb.cacheGroupDetails(this.receiverId, {
        meta: this.groupMeta,
        members: this.groupMembers,
        adminIds: this.adminIds,
      });

      console.log('✅ Group data synced and cached (including avatar)');
    } catch (err) {
      console.warn('Failed to sync group data:', err);
      throw err;
    }
  }

  setupPastMembersListener() {
    if (!this.receiverId) return;

    if (this.pastMembersUnsubscribe) {
      this.pastMembersUnsubscribe();
    }

    const db = getDatabase();
    const pastRef = ref(db, `groups/${this.receiverId}/pastmembers`);

    this.pastMembersUnsubscribe = onValue(pastRef, (snapshot) => {
      this.zone.run(() => {
        this.hasPastMembers = snapshot.exists();
        console.log('🔄 Real-time pastmembers update:', this.hasPastMembers);
      });
    });
  }

  /**
   * 🔥 NEW: Sync common groups
   */
  private async syncCommonGroups(): Promise<void> {
    try {
      await this.findCommonGroupsAndCache(this.currentUserId, this.receiverId);
      console.log('✅ Common groups synced and cached');
    } catch (error) {
      console.error('❌ Error syncing common groups:', error);
      throw error;
    }
  }

  /**
   * ✅ FINAL FIX: Common groups find karo bina receiver ke userchats padhe
   * Strategy:
   *  1. Apne userchats se saare roomIds lo (allowed: auth.uid === currentUserId)
   *  2. Har roomId pe groups/$roomId read karo (allowed: member check pass hoga)
   *  3. Agar groups/$roomId exist karta hai AND receiver bhi members mein hai → common group
   *  ❌ Kabhi bhi userchats/$receiverId read mat karo — rules block karta hai
   */
  async findCommonGroupsAndCache(currentUserId: string, receiverId: string) {
    if (!currentUserId || !receiverId) return;

    const db = getDatabase();

    try {
      // Step 1: Apne userchats se saare roomIds lo (ye allowed hai: auth.uid === currentUserId)
      const myChatsRef = ref(db, `userchats/${currentUserId}`);
      const myChatsSnapshot = await get(myChatsRef);

      if (!myChatsSnapshot.exists()) {
        this.commonGroups = [];
        await this.chatPouchDb.cacheCommonGroups(currentUserId, receiverId, []);
        return;
      }

      const myRoomIds = Object.keys(myChatsSnapshot.val());
      const matchedGroups: any[] = [];

      // Step 2: Har roomId ke liye groups/$roomId check karo
      // groups/$roomId read allowed hai jab hum member hain (rules: members.auth.uid exists)
      for (const roomId of myRoomIds) {
        // ✅ Private chat roomIds skip karo BEFORE Firebase call
        // Private chats ka pattern: "userId1_userId2" (e.g. "1_6", "23_45")
        // Group roomIds numbers ya timestamps hote hain (e.g. "group_17697...", "1769773815869")
        const isPrivateChatRoom = /^\d+_\d+$/.test(roomId);
        if (isPrivateChatRoom) continue;

        try {
          const groupRef = ref(db, `groups/${roomId}`);
          const groupSnapshot = await get(groupRef);

          // Exist nahi karta = group nahi hai, skip
          if (!groupSnapshot.exists()) continue;

          const groupData = groupSnapshot.val();
          const members = groupData.members || {};

          // Sirf woh groups jisme receiver bhi member hai
          if (!members[receiverId]) continue;

          // System groups (announcements/general) skip karo
          const title = (groupData.title || '').trim().toLowerCase();
          const isSystemGroup =
            (title === 'announcements' || title === 'general') &&
            (groupData.communityId ||
              roomId.toLowerCase().includes('_announcement') ||
              roomId.toLowerCase().includes('_general'));

          if (isSystemGroup) continue;

          // Avatar fetch karo
          let groupAvatar = groupData.avatar || '';
          try {
            const dpResponse: any = await this.service
              .getGroupDp(roomId)
              .toPromise();
            if (dpResponse?.group_dp_url) {
              groupAvatar = dpResponse.group_dp_url;
            }
          } catch (err) {
            console.warn(`⚠️ Failed to fetch avatar for group ${roomId}:`, err);
          }

          matchedGroups.push({
            groupId: roomId,
            name: groupData.title || 'Unnamed Group',
            avatar: groupAvatar,
            memberCount: Object.keys(members).length,
            members,
          });
        } catch (err) {
          // Group read permission nahi (not a member anymore) — silently skip
          console.warn(`⚠️ Skipping group ${roomId}:`, err);
        }
      }

      this.commonGroups = matchedGroups;

      await this.chatPouchDb.cacheCommonGroups(
        currentUserId,
        receiverId,
        matchedGroups
      );

      console.log(`✅ Found ${matchedGroups.length} common groups`);
    } catch (error) {
      console.error('Error fetching common groups:', error);
      throw error;
    }
  }

  async openCommonGroup(group: any) {
    const groupChat = {
      roomId: group.groupId,
      type: 'group',
      title: group.name,
      avatar: group.avatar,
    };

    await this.firebaseChatService.openChat(groupChat);

    this.router.navigate(['/chatting-screen'], {
      queryParams: {
        receiverId: group.groupId,
      },
    });
  }

  /**
   * 🔥 UPDATED: Load receiver profile (with offline support for groups)
   */
  loadReceiverProfile() {
    if (!this.receiverId) return;

    // ✅ Check if online
    const isOnline = this.networkService.isOnline.value;

    if (this.chatType === 'group') {
      // 🔴 OFFLINE: Try to load from cache first
      if (!isOnline) {
        console.log('🔴 OFFLINE: Loading group DP from cache...');
        this.loadGroupDpFromCache();
        return;
      }

      // 🟢 ONLINE: Fetch from API
      console.log('🟢 ONLINE: Fetching group DP from API...');
      this.service.getGroupDp(this.receiverId).subscribe({
        next: async (res: any) => {
          this.receiverProfile = res?.group_dp_url || 'assets/images/user.jfif';

          console.log('✅ Group DP loaded:', this.receiverProfile);

          // ✅ Update cache with fresh avatar
          const cachedDetails = await this.chatPouchDb.getCachedGroupDetails(
            this.receiverId
          );
          if (cachedDetails) {
            // Update meta with new avatar
            if (!cachedDetails.meta) {
              cachedDetails.meta = {
                title: '',
                description: '',
                createdBy: '',
                createdAt: '',
              };
            }

            cachedDetails.meta.avatar = this.receiverProfile;

            await this.chatPouchDb.cacheGroupDetails(
              this.receiverId,
              cachedDetails
            );
            console.log('✅ Cached group DP:', this.receiverProfile);
          }
        },
        error: (err) => {
          console.error('❌ Error loading group profile:', err);
          // 🔴 Fallback to cache on error
          this.loadGroupDpFromCache();
        },
      });
    } else {
      // 🔴 OFFLINE: Try to load from cache first
      if (!isOnline) {
        console.log('🔴 OFFLINE: Loading user DP from cache...');
        return; // Cache already loaded in loadFromCache()
      }

      // 🟢 ONLINE: Fetch from API
      this.service.getUserProfilebyId(this.receiverId).subscribe({
        next: async (res: any) => {
          this.receiverProfile = res?.profile || 'assets/images/user.jfif';
          this.receiverAbout = res?.dp_status;
          this.statusTime = res?.dp_status_updated_on;

          // ✅ Cache the updated profile
          await this.chatPouchDb.cacheUserProfile(this.receiverId, res);

          // ✅ Load social media in background
          this.loadReceiverSocialMedia(this.receiverId);
        },
        error: (err) => {
          console.error('❌ Error loading user profile:', err);
          this.receiverProfile = 'assets/images/user.jfif';
        },
      });
    }
  }

  /**
   * 🔥 NEW HELPER: Load group DP from cache
   */
  private async loadGroupDpFromCache() {
    try {
      const cachedDetails = await this.chatPouchDb.getCachedGroupDetails(
        this.receiverId
      );

      if (cachedDetails?.meta?.avatar) {
        this.receiverProfile = cachedDetails.meta.avatar;
        console.log('✅ Loaded group DP from cache:', this.receiverProfile);
      } else {
        console.warn('⚠️ No cached group DP found');
        this.receiverProfile = 'assets/images/user.jfif';
      }
    } catch (error) {
      console.error('❌ Error loading group DP from cache:', error);
      this.receiverProfile = 'assets/images/user.jfif';
    }
  }

  /**
   * 🔥 UPDATED: Load social media links (with caching)
   */
  loadReceiverSocialMedia(userId: string) {
    // ✅ Check if online
    const isOnline = this.networkService.isOnline.value;
    if (!isOnline) {
      console.log('⚠️ Skipping social media load - offline');
      return;
    }

    this.service.getSocialMedia(Number(userId)).subscribe({
      next: async (res: any) => {
        if (res?.success && Array.isArray(res.data)) {
          this.socialMediaLinks = res.data;

          // ✅ Cache social media
          await this.chatPouchDb.cacheSocialMediaLinks(userId, res.data);
        }
      },
      error: (err) => {
        console.error('❌ Error loading social media links:', err);
        this.socialMediaLinks = [];
      },
    });
  }

  /**
   * 🔥 NEW: Show toast helper
   */
  private async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  private async checkNetworkBeforeAction(
    action:
      | 'profile'
      | 'addMember'
      | 'menu'
      | 'groupDescription'
      | 'makeAdmin'
      | 'dismissAdmin'
      | 'removeMember'
      | 'exitGroup'
      | 'deleteGroup'
      | 'createGroup'
      | 'block'
      | 'unblock'
      | 'report'
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

  private async showOfflineAlert(
    action:
      | 'profile'
      | 'addMember'
      | 'menu'
      | 'groupDescription'
      | 'makeAdmin'
      | 'dismissAdmin'
      | 'removeMember'
      | 'exitGroup'
      | 'deleteGroup'
      | 'createGroup'
      | 'block'
      | 'unblock'
      | 'report'
  ) {
    let message = '';

    switch (action) {
      case 'profile':
        message =
          'You are offline. Please connect to the internet to view the profile picture.';
        break;

      case 'addMember':
        message =
          'You are offline. Please connect to the internet to add members.';
        break;

      case 'menu':
        message =
          'You are offline. Please connect to the internet to access menu options.';
        break;

      case 'groupDescription':
        message =
          'You are offline. Please connect to the internet to edit group description.';
        break;

      case 'makeAdmin':
        message =
          'You are offline. Please connect to the internet to make this user admin.';
        break;

      case 'dismissAdmin':
        message =
          'You are offline. Please connect to the internet to dismiss admin.';
        break;

      case 'removeMember':
        message =
          'You are offline. Please connect to the internet to remove this member.';
        break;

      case 'exitGroup':
        message =
          'You are offline. Please connect to the internet to exit the group.';
        break;

      case 'deleteGroup':
        message =
          'You are offline. Please connect to the internet to delete the group.';
        break;

      case 'createGroup':
        message =
          'You are offline. Please connect to the internet to create a group.';
        break;

      case 'block':
        message =
          'You are offline. Please connect to the internet to block this user.';
        break;

      case 'unblock':
        message =
          'You are offline. Please connect to the internet to unblock this user.';
        break;

      case 'report':
        message =
          'You are offline. Please connect to the internet to report this user.';
        break;
    }

    const alert = await this.alertCtrl.create({
      header: "You're Offline",
      message,
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
    });

    await alert.present();
  }

  // async membersWithDeviceNames(
  //   groupMembers: GroupMemberDisplay[]
  // ): Promise<GroupMemberDisplay[]> {
  //   try {
  //     const deviceContacts =
  //       this.firebaseChatService.currentDeviceContacts || [];
  //     const pfUsers = this.firebaseChatService.currentUsers || [];
  //     const nameByUserId = new Map<string, string>();
  //     pfUsers.forEach((u: any) => {
  //       if (u?.userId) {
  //         const preferred =
  //           u.device_contact_name || u.username || u.phoneNumber || '';
  //         if (preferred) nameByUserId.set(String(u.userId), preferred);
  //       }
  //     });
  //     const currentUserId = this.authService.authData?.userId || '';

  //     return groupMembers.map((member) => {
  //       if (String(member.user_id) === String(currentUserId)) {
  //         return {
  //           ...member,
  //           username: 'You',
  //         };
  //       }

  //       // Prefer match by user_id from platform users (device_contact_name first)
  //       const byId = nameByUserId.get(String(member.user_id));
  //       if (byId) {
  //         return {
  //           ...member,
  //           username: byId,
  //         };
  //       }

  //       // Try to find matching device contact by phone number
  //       const deviceContact = deviceContacts.find((dc) => {
  //         const memberPhone = (
  //           member.phoneNumber ||
  //           member.phone ||
  //           (member as any).phone_number ||
  //           ''
  //         ).replace(/\D/g, '');
  //         const dcPhone = (dc.phoneNumber || '').replace(/\D/g, '');

  //         // Match last 10 digits
  //         return memberPhone.slice(-10) === dcPhone.slice(-10);
  //       });

  //       // If device contact found, use its name; otherwise use phone number
  //       return {
  //         ...member,
  //         username: deviceContact
  //           ? deviceContact.username
  //           : member.phoneNumber ||
  //             member.phone ||
  //             (member as any).phone_number ||
  //             (member as any).name ||
  //             member.username,
  //       };
  //     });
  //   } catch (error) {
  //     console.error('Error mapping members with device names:', error);
  //     return groupMembers; // Return original if error
  //   }
  // }

  async membersWithDeviceNames(
  groupMembers: GroupMemberDisplay[]
): Promise<GroupMemberDisplay[]> {
  try {
    console.log('➡️ Incoming groupMembers:', groupMembers);

    const deviceContacts =
      this.firebaseChatService.currentDeviceContacts || [];
    const pfUsers = this.firebaseChatService.currentUsers || [];

    console.log('📱 Device Contacts:', deviceContacts);
    console.log('👤 Platform Users:', pfUsers);

    const nameByUserId = new Map<string, string>();
    // phoneByUserId: resolved from device contact reverse-lookup (device_contact_name → phone)
    // Used as last-resort display when there is no device name and no phone on the member record.
    const phoneByUserId = new Map<string, string>();

    pfUsers.forEach((u: any) => {
      if (!u?.userId) return;

      // Only put an entry in the name map when there is an actual device_contact_name.
      // u.username is the backend-registered name — we must never show that.
      if (u.device_contact_name) {
        nameByUserId.set(String(u.userId), u.device_contact_name);

        // Reverse-lookup: find the matching device contact to capture its phone number.
        const dcMatch = deviceContacts.find(
          (dc: any) =>
            (dc.username || '').toLowerCase() ===
            (u.device_contact_name as string).toLowerCase()
        );
        if (dcMatch?.phoneNumber) {
          phoneByUserId.set(String(u.userId), dcMatch.phoneNumber);
        }
      }
    });

    console.log('🗺️ nameByUserId Map:', nameByUserId);

    const currentUserId = this.authService.authData?.userId || '';
    console.log('🙋 Current User ID:', currentUserId);

    return groupMembers.map((member, index) => {
      console.log(`\n👥 Processing Member [${index}]:`, member);

      if (String(member.user_id) === String(currentUserId)) {
        console.log('✅ This is current user → setting as "You"');
        return {
          ...member,
          username: 'You',
        };
      }

      // Match by user_id (only device_contact_name is stored in map)
      const byId = nameByUserId.get(String(member.user_id));
      console.log('🔗 Match by user_id:', byId);

      if (byId) {
        return {
          ...member,
          username: byId,
        };
      }

      // Normalize phone from member record (may be empty for pre-fix groups)
      const memberPhone = (
        member.phoneNumber ||
        member.phone ||
        (member as any).phone_number ||
        ''
      ).replace(/\D/g, '');

      console.log('📞 Member Phone:', memberPhone);

      // Try to find matching device contact
      const deviceContact = deviceContacts.find((dc) => {
        const dcPhone = (dc.phoneNumber || '').replace(/\D/g, '');

        const isMatch =
          memberPhone.slice(-10) === dcPhone.slice(-10);

        if (isMatch) {
          console.log('📲 Matched Device Contact:', dc);
        }

        return isMatch;
      });

      console.log('📌 Final Matched Device Contact:', deviceContact);

      const finalName = deviceContact
        ? deviceContact.username
        : member.phoneNumber ||
          member.phone ||
          (member as any).phone_number ||
          // Last resort: phone resolved from device contacts via device_contact_name lookup
          phoneByUserId.get(String(member.user_id)) ||
          '';  // never fall back to member.username (backend registered name)

      console.log('🏷️ Final Username:', finalName);

      return {
        ...member,
        username: finalName,
      };
    });
  } catch (error) {
    console.error('❌ Error mapping members with device names:', error);
    return groupMembers;
  }
}

  setupGroupMembershipListener() {
    if (!this.receiverId) return;

    const db = getDatabase();

    // Clean up old listener if exists
    if (this.groupMembershipUnsubscribe) {
      this.groupMembershipUnsubscribe();
    }

    // Listen to the members node of this group
    this.groupMembershipRef = ref(db, `groups/${this.receiverId}/members`);

    this.groupMembershipUnsubscribe = onValue(
      this.groupMembershipRef,
      (snapshot) => {
        this.zone.run(async () => {
          const members = snapshot.val() || {};
          this.currentUserId = this.authService.authData?.userId || '';

          // Check if current user is still a member
          const wasCurrentUserMember = this.isCurrentUserMember;
          this.isCurrentUserMember = !!members[this.currentUserId];

          console.log('Real-time membership check:', {
            currentUserId: this.currentUserId,
            isCurrentUserMember: this.isCurrentUserMember,
            wasCurrentUserMember,
            members: Object.keys(members),
          });

          // If membership status changed, update the UI
          if (wasCurrentUserMember !== this.isCurrentUserMember) {
            // Refresh group members list
            try {
              const { groupName, groupMembers } =
                await this.firebaseChatService.fetchGroupWithProfiles(
                  this.receiverId
                );
              this.groupName = groupName;

              // ✅ Map with device names on refresh too
              this.groupMembers = await this.membersWithDeviceNames(
                groupMembers
              );
            } catch (err) {
              console.warn('Failed to refresh group members', err);
            }
          }
        });
      },
      (error) => {
        console.error('Error listening to group membership:', error);
      }
    );
  }

  private setupPermissionsListener(): void {
    if (!this.receiverId || this.chatType !== 'group') return;

    // Clean up old listener
    if (this._permissionsUnsubscribe) {
      this._permissionsUnsubscribe();
      this._permissionsUnsubscribe = null;
    }

    const db = getDatabase();
    const permRef = ref(db, `groups/${this.receiverId}/permissions`);

    const unsubscribe = onValue(permRef, (snapshot) => {
      this.zone.run(async () => {
        const data = snapshot.exists() ? snapshot.val() : null;

        const defaults = {
          editGroupSettings: true,
          addMembers: true,
        };

        const rawEdit =
          data?.editGroupSettings !== undefined
            ? data.editGroupSettings
            : defaults.editGroupSettings;

        const rawAdd =
          data?.addMembers !== undefined
            ? data.addMembers
            : defaults.addMembers;

        // ✅ Admin always bypasses — check via service
        const isAdmin = this.adminIds.includes(String(this.currentUserId));

        this.canEditGroupSettings = isAdmin ? true : rawEdit;
        this.canAddMembers = isAdmin ? true : rawAdd;

        console.log(`🔄 Real-time permissions updated:`, {
          canEditGroupSettings: this.canEditGroupSettings,
          canAddMembers: this.canAddMembers,
          isAdmin,
        });

        try {
          this.cdr.detectChanges();
        } catch {}
      });
    });

    this._permissionsUnsubscribe = unsubscribe;
  }

  async setupGroupMetaListener(groupId: string) {
    const db = getDatabase();

    // Clean up old listener
    if (this.groupMetaUnsubscribe) {
      this.groupMetaUnsubscribe();
    }

    this.groupMetaRef = ref(db, `groups/${groupId}`);

    this.groupMetaUnsubscribe = onValue(
      this.groupMetaRef,
      (snapshot) => {
        this.zone.run(async () => {
          if (snapshot.exists()) {
            const groupData = snapshot.val();

            const createdByUserId =
              groupData.createdBy || groupData.createdByUserId;
            const deviceContacts =
              this.firebaseChatService.currentDeviceContacts || [];
            const pfUsers = this.firebaseChatService.currentUsers || [];

            let createdByName = groupData.createdByName || 'Unknown';

            if (createdByUserId) {
              const currentUserId = this.authService.authData?.userId || '';

              if (String(createdByUserId) === String(currentUserId)) {
                createdByName = 'You';
              } else {
                // Step 1: userId se pfUsers mein dhundo
                const matchedPfUser = pfUsers.find(
                  (u: any) => String(u.userId) === String(createdByUserId)
                );

                if (
                  matchedPfUser?.device_contact_name ||
                  matchedPfUser?.username
                ) {
                  createdByName =
                    matchedPfUser.device_contact_name || matchedPfUser.username;
                } else {
                  // Step 2: userId se device contacts mein dhundo
                  const matchedDeviceContact = deviceContacts.find(
                    (contact) =>
                      String(contact.userId) === String(createdByUserId)
                  );

                  if (matchedDeviceContact?.username) {
                    createdByName = matchedDeviceContact.username;
                  } else {
                    // Step 3: Phone number fetch karo aur match karo
                    try {
                      let phoneNumber = '';

                      const memberData = groupData.members?.[createdByUserId];
                      if (memberData?.phone || memberData?.phoneNumber) {
                        phoneNumber =
                          memberData.phone || memberData.phoneNumber;
                      } else {
                        const userProfile: any = await this.service
                          .getUserProfilebyId(createdByUserId)
                          .toPromise();
                        phoneNumber =
                          userProfile?.phone_number || userProfile?.phone || '';
                      }

                      if (phoneNumber) {
                        const cleanPhone = phoneNumber
                          .replace(/\D/g, '')
                          .slice(-10);

                        // Step 4: Phone se pfUsers mein dhundo (device_contact_name prefer)
                        const phoneMatchedPfUser = pfUsers.find((u: any) => {
                          const uPhone = (u.phoneNumber || '')
                            .replace(/\D/g, '')
                            .slice(-10);
                          return (
                            uPhone === cleanPhone && cleanPhone.length === 10
                          );
                        });

                        if (
                          phoneMatchedPfUser?.device_contact_name ||
                          phoneMatchedPfUser?.username
                        ) {
                          createdByName =
                            phoneMatchedPfUser.device_contact_name ||
                            phoneMatchedPfUser.username;
                        } else {
                          // Step 5: Phone se device contacts mein dhundo
                          const phoneMatchedDevice = deviceContacts.find(
                            (contact) => {
                              const dcPhone = (contact.phoneNumber || '')
                                .replace(/\D/g, '')
                                .slice(-10);
                              return (
                                dcPhone === cleanPhone &&
                                cleanPhone.length === 10
                              );
                            }
                          );

                          if (phoneMatchedDevice?.username) {
                            createdByName = phoneMatchedDevice.username;
                          } else {
                            createdByName = phoneNumber;
                          }
                        }
                      } else {
                        createdByName = groupData.createdByName || 'Unknown';
                      }
                    } catch (err) {
                      console.warn('Failed to fetch creator details:', err);
                      createdByName = groupData.createdByName || 'Unknown';
                    }
                  }
                }
              }
            }

            this.groupMeta = {
              title: groupData.title || groupData.groupName || 'Group',
              description: groupData.description || 'No group description.',
              createdBy: createdByName,
              createdAt: groupData.createdAt || '',
            };

            this.groupName = this.groupMeta.title;
            this.groupDescription = this.groupMeta.description;
            this.groupCreatedBy = this.groupMeta.createdBy;
            this.groupCreatedAt = this.groupMeta.createdAt;
            this.chatTitle = this.groupMeta.title;

            console.log('✅ Group Meta Updated:', {
              groupName: this.groupName,
              createdBy: this.groupCreatedBy,
              chatTitle: this.chatTitle,
            });
          }
        });
      },
      (error) => {
        console.error('Error listening to group meta:', error);
      }
    );
  }

  ionViewWillLeave() {
    // Clean up real-time listener
    if (this.groupMembershipUnsubscribe) {
      this.groupMembershipUnsubscribe();
      this.groupMembershipUnsubscribe = null;
    }

    if (this.groupMetaUnsubscribe) {
      this.groupMetaUnsubscribe();
      this.groupMetaUnsubscribe = null;
    }

    if (this.pastMembersUnsubscribe) {
      this.pastMembersUnsubscribe();
      this.pastMembersUnsubscribe = null;
    }

    if (this._permissionsUnsubscribe) {
      this._permissionsUnsubscribe();
      this._permissionsUnsubscribe = null;
    }

    // Clean up block listeners
    try {
      if (this.iBlockedRef) off(this.iBlockedRef);
      if (this.theyBlockedRef) off(this.theyBlockedRef);
    } catch (e) {
      /* ignore */
    }
  }

  ngOnDestroy() {
    if (this.groupMembershipUnsubscribe) {
      this.groupMembershipUnsubscribe();
    }

    if (this.groupMetaUnsubscribe) {
      this.groupMetaUnsubscribe();
    }

    if (this.pastMembersUnsubscribe) {
      this.pastMembersUnsubscribe();
    }

    if (this._permissionsUnsubscribe) {
      this._permissionsUnsubscribe();
      this._permissionsUnsubscribe = null;
    }

    try {
      if (this.iBlockedRef) off(this.iBlockedRef);
      if (this.theyBlockedRef) off(this.theyBlockedRef);
    } catch (e) {
      /* ignore */
    }
  }

  openExternalLink(url: string) {
    if (!url) return;
    window.open(url, '_blank');
  }

  setDefaultAvatar(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/user.jfif';
  }

  onScroll(event: any) {
    const scrollTop = event.detail.scrollTop;
    this.isScrolled = scrollTop > 10;
  }

  goBackToChat() {
    try {
      // this.navCtrl.back();
      if (this.communityId) {
        this.router.navigate(['/community-chat'], {
          queryParams: {
            receiverId: this.receiverId,
            receiver_phone: this.receiver_phone,
            isGroup: this.isGroup,
            communityId: this.communityId,
          },
        });
      } else {
        this.router.navigate(['/chatting-screen'], {
          queryParams: {
            receiverId: this.receiverId,
            // receiver_phone: this.receiver_phone,
            // isGroup: this.isGroup,
          },
        });
      }
    } catch (err) {
      console.warn('navCtrl.back() failed, fallback:', err);
    }
  }

  // goBackToChat() {
  //   try {
  //     this.navCtrl.back();
  //   } catch (err) {
  //     console.warn('navCtrl.back() failed:', err);
  //   }
  // }

  async deleteGroup() {
    if (!(await this.checkNetworkBeforeAction('deleteGroup'))) {
      return;
    }
    console.log('this delete group function is called');

    // ✅ Show confirmation alert
    const alert = await this.alertCtrl.create({
      header: 'Delete Group',
      message:
        'Are you sure you want to delete this group? This will remove all messages and cannot be undone.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'secondary',
          handler: () => {
            console.log('Delete cancelled');
          },
        },
        {
          text: 'Delete',
          cssClass: 'danger',
          handler: async () => {
            try {
              // Show loading spinner
              const loading = await this.loadingCtrl.create({
                message: 'Deleting group...',
                spinner: 'crescent',
              });
              await loading.present();

              // Perform delete operation
              this.groupId = this.firebaseChatService.currentChat?.roomId || '';
              await this.firebaseChatService.deleteGroup(this.groupId);

              // Dismiss loading
              await loading.dismiss();

              // Show success toast
              const toast = await this.toastCtrl.create({
                message: 'Group deleted successfully',
                duration: 2000,
                color: 'success',
                position: 'bottom',
              });
              await toast.present();

              // Navigate to home
              this.router.navigate(['/home-screen']);
            } catch (error) {
              console.error('Error deleting group:', error);

              // Show error toast
              const toast = await this.toastCtrl.create({
                message: 'Failed to delete group. Please try again.',
                duration: 3000,
                color: 'danger',
                position: 'bottom',
              });
              await toast.present();
            }
          },
        },
      ],
    });

    await alert.present();
  }

  openProfileDp() {
    // ✅ Prevent viewing full DP if blocked
    if (this.chatType === 'private' && this.theyBlocked) {
      console.warn('🚫 Cannot view profile picture: user has blocked you');
      return;
    }
    const profileToShow = this.receiverProfile || 'assets/images/user.jfif';

    this.router.navigate(['/profile-dp-view'], {
      queryParams: {
        image: profileToShow,
        isGroup: this.chatType === 'group',
        receiverId: this.receiverId,
      },
    });
  }

  async onAddMember() {
    // const memberPhones = this.groupMembers.map(member => member.phone);
    if (!(await this.checkNetworkBeforeAction('addMember'))) {
      return;
    }
    if (!this.canAddMembers) {
      const alert = await this.alertCtrl.create({
        header: 'Permission Denied',
        message: 'Only admins can add members to this group.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }
    this.router.navigate(['/add-members'], {
      queryParams: {
        groupId: this.receiverId,
        // members: JSON.stringify(memberPhones)
      },
    });
  }

  viewPastMembers() {
    this.router.navigate(['/view-past-members'], {
      queryParams: {
        groupId: this.receiverId,
      },
    });
  }

  async openMenu(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: UseraboutMenuComponent,
      event: ev,
      translucent: true,
      componentProps: {
        chatType: this.chatType,
        groupId: this.chatType === 'group' ? this.receiverId : '',
        receiver_phone: this.chatType==='private' ?this.receiver_phone:'',
        chatTitle: this.chatTitle,
        isCurrentUserMember: this.isCurrentUserMember,
        groupMeta: this.groupMeta,
        canAddMembers: this.canAddMembers,
        canEditGroupSettings: this.canEditGroupSettings,
      },
    });

    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data?.action === 'memberAdded' || data?.action === 'nameChanged') {
      // refresh members by calling the centralized service
      try {
        const { groupName, groupMembers } =
          await this.firebaseChatService.fetchGroupWithProfiles(
            this.receiverId
          );
        this.groupName = groupName;
        this.groupMembers = groupMembers;
      } catch (err) {
        console.warn(
          'Failed to refresh group with profiles after menu action',
          err
        );
      }
    }
  }

  async openGroupDescriptionPage() {
    if (this.chatType === 'group') {
      if (!this.isCurrentUserMember) {
        const alert = await this.alertCtrl.create({
          header: 'Cannot Edit Description',
          message:
            'You cannot edit group description because you are not a member of this group.',
          buttons: ['OK'],
        });
        await alert.present();
        return;
      }

      // ✅ ADD THIS BLOCK
      if (!this.canEditGroupSettings) {
        const alert = await this.alertCtrl.create({
          header: 'Permission Denied',
          message: 'Only admins can edit the group description.',
          buttons: ['OK'],
        });
        await alert.present();
        return;
      }

      if (!(await this.checkNetworkBeforeAction('groupDescription'))) {
        return;
      }

      this.navCtrl.navigateForward('/group-description', {
        queryParams: {
          receiverId: this.receiverId,
          isGroup: true,
        },
      });
    }
  }
  // ---- ACTION SHEET ----

  async openActionSheet(member: any) {
    const t = this.translate;
    // console.log({member});

    const buttons: ActionSheetButton[] = [
      {
        text: t.instant('userabout.actions.message'),
        icon: 'chatbox',
        handler: () => this.messageMember(member),
      },
    ];

    const groupId = this.receiverId || this.groupId;
    const currentUserId = this.authService.authData?.userId || '';

    try {
      // Get admin details from service
      const { adminIds, isCurrentUserAdmin, isTargetUserAdmin, isSelf } =
        await this.firebaseChatService.getAdminCheckDetails(
          groupId,
          currentUserId,
          member.user_id
        );

      console.log('Admin check:', {
        adminIds,
        currentUserId,
        isCurrentUserAdmin,
        isTargetUserAdmin,
        isSelf,
      });

      if (isCurrentUserAdmin && !isSelf) {
        if (isTargetUserAdmin) {
          buttons.push({
            text: t.instant('userabout.actions.dismissAdmin'),
            icon: 'remove-circle',
            handler: () => this.dismissAdmin(member),
          });
        } else {
          buttons.push({
            text: t.instant('userabout.actions.makeAdmin'),
            icon: 'person-add',
            handler: () => this.makeAdmin(member),
          });
        }

        buttons.push({
          text: t.instant('userabout.actions.removeFromGroup'),
          icon: 'person-remove',
          role: 'destructive',
          handler: () => this.removeMemberFromGroup(member),
        });
      }

      buttons.push({ text: t.instant('common.cancel'), role: 'cancel' });

      const actionSheet = await this.actionSheetCtrl.create({
        header: member.name || member.username || 'Member',
        buttons,
      });
      await actionSheet.present();
    } catch (error) {
      console.error('Error loading admin data:', error);

      // Fallback: show basic options only
      buttons.push({ text: t.instant('common.cancel'), role: 'cancel' });

      const actionSheet = await this.actionSheetCtrl.create({
        header: member.name || member.username || 'Member',
        buttons,
      });
      await actionSheet.present();
    }
  }

  async makeAdmin(member: any) {
    if (!(await this.checkNetworkBeforeAction('makeAdmin'))) {
      return;
    }

    const groupId = this.groupId || this.receiverId;

    if (!groupId || !member?.user_id) {
      console.error('Missing groupId or member.user_id');
      return;
    }

    try {
      const success = await this.firebaseChatService.makeGroupAdmin(
        groupId,
        member.user_id
      );

      if (success) {
        // Update local groupMembers array to show admin badge
        const memberIndex = this.groupMembers.findIndex(
          (m) => m.user_id === member.user_id
        );
        if (memberIndex !== -1) {
          this.groupMembers[memberIndex].role = 'admin';
        }
        this.adminIds.push(member.user_id);

        const toast = await this.toastCtrl.create({
          message: this.translate.instant('userabout.toasts.madeAdmin', {
            name: member.name || member.username,
          }),
          duration: 2000,
          color: 'success',
        });
        await toast.present();
      } else {
        throw new Error('Failed to make admin');
      }
    } catch (error) {
      console.error('Error making admin:', error);
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('userabout.errors.makeAdmin', {
          name: member.name || member.username,
        }),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async dismissAdmin(member: any) {
    if (!(await this.checkNetworkBeforeAction('dismissAdmin'))) {
      return;
    }

    const groupId = this.groupId || this.receiverId;

    if (!groupId || !member?.user_id) {
      console.error('Missing groupId or member.user_id');
      return;
    }

    try {
      const success = await this.firebaseChatService.dismissGroupAdmin(
        groupId,
        member.user_id
      );

      if (success) {
        // Update local groupMembers array
        const memberIndex = this.groupMembers.findIndex(
          (m) => m.user_id === member.user_id
        );
        if (memberIndex !== -1) {
          this.groupMembers[memberIndex].role = 'member';
        }

        this.adminIds = this.adminIds.filter((id) => id != member.user_id);

        const toast = await this.toastCtrl.create({
          message: this.translate.instant('userabout.toasts.dismissedAdmin', {
            name: member.name || member.username,
          }),
          duration: 2000,
          color: 'medium',
        });
        await toast.present();
      } else {
        throw new Error('Failed to dismiss admin');
      }
    } catch (error) {
      console.error('Error dismissing admin:', error);
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('userabout.errors.dismissAdmin', {
          name: member.name || member.username,
        }),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async messageMember(member: any) {
    const senderId = this.authService.authData?.userId || '';
    const receiverId = member.user_id;

    if (!senderId || !receiverId) {
      alert('Missing sender or receiver ID');
      return;
    }

    // Open chat and wait for it to complete
    await this.firebaseChatService.openChat(
      {
        receiver: {
          userId: receiverId,
          username: member.name || member.username || receiverId,
          phoneNumber: member.phone_number || member.phone || '',
        },
      },
      true
    );

    this.router.navigate(['/chatting-screen'], {
      queryParams: {
        receiverId: receiverId,
      },
    });
  }

  // async checkForPastMembers() {
  //   if (!this.receiverId) return;

  //   const db = getDatabase();
  //   const pastRef = ref(db, `groups/${this.receiverId}/pastmembers`);

  //   try {
  //     const snapshot = await get(pastRef);
  //     const exists = snapshot.exists();

  //     this.zone.run(() => {
  //       this.hasPastMembers = exists;
  //     });
  //     console.log('checking for past members', this.hasPastMembers);
  //   } catch (error) {
  //     console.error('Error checking past members:', error);
  //     this.zone.run(() => {
  //       this.hasPastMembers = false;
  //     });
  //   }
  // }

  async checkForPastMembers() {
    if (!this.receiverId) return;

    console.log('🔍 Checking for past members in cache...');
    const cachedPastMembers = await this.chatPouchDb.getCachedPastMembers(
      this.receiverId
    );

    if (cachedPastMembers && cachedPastMembers.length > 0) {
      this.zone.run(() => {
        this.hasPastMembers = true;
      });
      console.log('✅ Found past members in cache:', cachedPastMembers.length);
    } else {
      this.zone.run(() => {
        this.hasPastMembers = false;
      });
    }

    const isOnline = this.networkService.isOnline.value;
    if (isOnline) {
      console.log('🌐 Verifying past members from Firebase...');
      const db = getDatabase();
      const pastRef = ref(db, `groups/${this.receiverId}/pastmembers`);

      try {
        const snapshot = await get(pastRef);
        const exists = snapshot.exists();

        this.zone.run(() => {
          this.hasPastMembers = exists;
        });

        console.log('✅ Verified past members from Firebase:', exists);

        if (exists) {
          const pastMembersData = snapshot.val();
          const pastMembersArray = Object.values(pastMembersData || {});

          if (pastMembersArray.length > 0) {
            await this.chatPouchDb.cachePastMembers(
              this.receiverId,
              pastMembersArray
            );
            console.log('✅ Cached past members from Firebase');
          }
        }
      } catch (error) {
        console.error('❌ Error checking past members from Firebase:', error);
        // Keep cache result (already set above)
      }
    } else {
      console.log('⚠️ Offline - using cache result for past members');
    }
  }

  // async confirmExitGroup() {
  //   // console.log("this exit group function is called")
  //   const alert = await this.alertCtrl.create({
  //     header: this.translateText(
  //       'userabout.exitGroupConfirmHeader',
  //       'Exit group'
  //     ),
  //     message: this.translateText(
  //       'userabout.exitGroupConfirmMsg',
  //       'Are you sure you want to exit this group?'
  //     ),
  //     buttons: [
  //       {
  //         text: this.translateText('common.cancel', 'Cancel'),
  //         role: 'cancel',
  //       },
  //       {
  //         text: this.translateText('common.exit', 'Exit'),
  //         handler: () => {
  //           this.exitGroup();
  //         },
  //       },
  //     ],
  //   });

  //   await alert.present();
  // }

  // async exitGroup() {
  //   try {
  //     this.currentUserId = this.authService.authData?.userId || '';
  //     console.log('this.currentUserId', this.currentUserId);
  //     this.firebaseChatService.exitGroup(this.receiverId, [this.currentUserId]);
  //     this.firebaseChatService.removeMemberFromConvLocal(this.receiverId, this.currentUserId);
  //     const toast = await this.toastCtrl.create({
  //       message: this.translateText(
  //         'userabout.exitSuccess',
  //         'You have exited the group.'
  //       ),
  //       duration: 2000,
  //       position: 'bottom',
  //     });
  //     await toast.present();

  //     // this.navCtrl.back();
  //   } catch (err) {
  //     console.error('Error exiting group:', err);
  //     const toast = await this.toastCtrl.create({
  //       message: this.translateText(
  //         'userabout.exitError',
  //         'Failed to exit group. Please try again.'
  //       ),
  //       duration: 2500,
  //       position: 'bottom',
  //     });
  //     await toast.present();
  //   }
  // }

  // Add these methods to your UseraboutPage class

  async removeMemberFromGroup(member: any) {
    if (!(await this.checkNetworkBeforeAction('removeMember'))) {
      return;
    }
    const groupId = this.groupId || this.receiverId;

    try {
      if (!groupId || !member?.user_id) {
        console.error('Missing groupId or member.user_id');
        return;
      }

      // ✅ Remove from adminIds if the member is an admin
      if (this.adminIds.includes(String(member.user_id))) {
        await this.removeFromAdminList(groupId, member.user_id);
      }

      await this.firebaseChatService.removeMembersToGroup(groupId, [
        member.user_id,
      ]);

      await this.firebaseChatService.removeMemberFromConvLocal(
        this.receiverId,
        this.currentUserId
      );

      const backendGroupId = await this.firebaseChatService.getBackendGroupId(
        groupId
      );

      if (backendGroupId) {
        this.service
          .updateMemberStatus(backendGroupId, Number(member.user_id), false)
          .subscribe({
            next: (res: any) => {
              console.log('Member status updated in backend:', res);
            },
            error: (error: any) => {
              console.error('Error updating member status in backend:', error);
            },
          });
      }

      this.groupMembers = this.groupMembers.filter(
        (m) => m.user_id !== member.user_id
      );

      const toast = await this.toastCtrl.create({
        message: this.translate.instant('userabout.toasts.removedFromGroup', {
          name: member.username,
        }),
        duration: 2000,
        color: 'success',
      });
      await toast.present();
    } catch (error) {
      console.error('Error removing member from group:', error);
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('userabout.errors.removeMember'),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async confirmExitGroup() {
    if (!(await this.checkNetworkBeforeAction('exitGroup'))) {
      return;
    }
    const currentUserId = this.authService.authData?.userId || '';
    const isCurrentUserAdmin = this.adminIds.includes(String(currentUserId));

    // ✅ Check if current user is the only admin
    if (
      isCurrentUserAdmin &&
      this.adminIds.length === 1 &&
      this.groupMembers.length > 1
    ) {
      const alert = await this.alertCtrl.create({
        header: this.translateText(
          'userabout.exitGroupAdminHeader',
          'Cannot Exit'
        ),
        message: this.translateText(
          'userabout.exitGroupAdminMsg',
          'You are the only admin. Please make another member admin before exiting, or the system will randomly assign an admin.'
        ),
        buttons: [
          {
            text: this.translateText('common.cancel', 'Cancel'),
            role: 'cancel',
          },
          {
            text: this.translateText(
              'userabout.makeAdminAndExit',
              'Make Random Admin & Exit'
            ),
            handler: () => {
              this.exitGroupWithRandomAdmin();
            },
          },
        ],
      });

      await alert.present();
      return;
    }

    // ✅ Normal exit confirmation
    const alert = await this.alertCtrl.create({
      header: this.translateText(
        'userabout.exitGroupConfirmHeader',
        'Exit group'
      ),
      message: this.translateText(
        'userabout.exitGroupConfirmMsg',
        'Are you sure you want to exit this group?'
      ),
      buttons: [
        {
          text: this.translateText('common.cancel', 'Cancel'),
          role: 'cancel',
        },
        {
          text: this.translateText('common.exit', 'Exit'),
          handler: () => {
            this.exitGroup();
          },
        },
      ],
    });

    await alert.present();
  }

  async exitGroup() {
    try {
      this.currentUserId = this.authService.authData?.userId || '';
      console.log('Exiting group, currentUserId:', this.currentUserId);

      // ✅ Remove from adminIds if the user is an admin
      if (this.adminIds.includes(String(this.currentUserId))) {
        await this.removeFromAdminList(this.receiverId, this.currentUserId);
      }

      this.firebaseChatService.exitGroup(this.receiverId, [this.currentUserId]);
      this.firebaseChatService.removeMemberFromConvLocal(
        this.receiverId,
        this.currentUserId
      );

      const toast = await this.toastCtrl.create({
        message: this.translateText(
          'userabout.exitSuccess',
          'You have exited the group.'
        ),
        duration: 2000,
        position: 'bottom',
      });
      await toast.present();

      // Navigate back to home
      // this.router.navigate(['/home-screen']);
    } catch (err) {
      console.error('Error exiting group:', err);
      const toast = await this.toastCtrl.create({
        message: this.translateText(
          'userabout.exitError',
          'Failed to exit group. Please try again.'
        ),
        duration: 2500,
        position: 'bottom',
      });
      await toast.present();
    }
  }

  async exitGroupWithRandomAdmin() {
    try {
      this.currentUserId = this.authService.authData?.userId || '';

      // ✅ Find eligible members (excluding current user)
      const eligibleMembers = this.groupMembers.filter(
        (m) => String(m.user_id) !== String(this.currentUserId)
      );

      if (eligibleMembers.length === 0) {
        // If no other members, just exit normally
        await this.exitGroup();
        return;
      }

      // ✅ Select random member to make admin
      const randomMember =
        eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)];

      // Show loading
      const loading = await this.loadingCtrl.create({
        message: 'Assigning new admin...',
        spinner: 'crescent',
      });
      await loading.present();

      // ✅ Make the random member admin
      await this.firebaseChatService.makeGroupAdmin(
        this.receiverId,
        randomMember.user_id
      );

      // ✅ Remove current user from admin list
      await this.removeFromAdminList(this.receiverId, this.currentUserId);

      // ✅ Exit the group
      this.firebaseChatService.exitGroup(this.receiverId, [this.currentUserId]);
      this.firebaseChatService.removeMemberFromConvLocal(
        this.receiverId,
        this.currentUserId
      );

      await loading.dismiss();

      const toast = await this.toastCtrl.create({
        message: `${randomMember.username} is now the admin. You have exited the group.`,
        duration: 3000,
        position: 'bottom',
        color: 'success',
      });
      await toast.present();

      // Navigate back to home
      // this.router.navigate(['/home-screen']);
    } catch (err) {
      console.error('Error exiting group with random admin:', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to assign admin and exit. Please try again.',
        duration: 2500,
        position: 'bottom',
        color: 'danger',
      });
      await toast.present();
    }
  }

  // ✅ Helper method to remove user from adminIds in Firebase
  async removeFromAdminList(groupId: string, userId: string) {
    try {
      const db = getDatabase();
      const adminIdsRef = ref(db, `groups/${groupId}/adminIds`);

      const snapshot = await get(adminIdsRef);
      if (snapshot.exists()) {
        const currentAdminIds = snapshot.val() || {};

        // Convert object to array of admin IDs
        const adminIdsArray = Object.values(currentAdminIds).map((id) =>
          String(id)
        );

        console.log('Current adminIds:', adminIdsArray);
        console.log('Removing userId:', String(userId));

        // Remove the userId from array
        const updatedAdminIdsArray = adminIdsArray.filter(
          (id) => String(id) !== String(userId)
        );

        console.log('Updated adminIds:', updatedAdminIdsArray);

        // Convert back to object format for Firebase (0: "78", 1: "77")
        const updatedAdminIds = updatedAdminIdsArray.reduce(
          (acc, id, index) => {
            acc[index] = id;
            return acc;
          },
          {} as any
        );

        // Update Firebase with new admin list via socket proxy
        await this.firebaseChatService.applySecuredBatchUpdates({
          [`groups/${groupId}/adminIds`]: updatedAdminIds
        });

        // Update local adminIds array
        this.adminIds = this.adminIds.filter(
          (id) => String(id) !== String(userId)
        );

        console.log(`✅ Removed ${userId} from adminIds in Firebase`);
      }
    } catch (error) {
      console.error('❌ Error removing from admin list:', error);
      throw error;
    }
  }

  translateText(key: string, fallback: string) {
    return fallback;
  }

  // async createGroupWithMember() {
  //   const currentUserId = this.authService.authData?.userId;
  //   const currentUserPhone = this.authService.authData?.phone_number;
  //   const currentUserName = this.authService.authData?.name || currentUserPhone;

  //   if (!currentUserId || !this.receiverId || !this.receiver_name) {
  //     console.error('Missing data for group creation');
  //     return;
  //   }

  //   const groupId = `group_${Date.now()}`;
  //   const groupName = `${currentUserName}, ${this.receiver_name}`;

  //   const members = [
  //     {
  //       userId: currentUserId,
  //       username: currentUserName as string,
  //       phoneNumber: currentUserPhone as string,
  //     },
  //     {
  //       userId: this.receiverId,
  //       username: this.receiver_name,
  //       phoneNumber: this.receiver_phone,
  //     },
  //   ];

  //   try {
  //     await this.firebaseChatService.createGroup({
  //       groupId,
  //       groupName,
  //       members,
  //     });
  //     this.router.navigate(['/chatting-screen'], {
  //       queryParams: { receiverId: groupId, isGroup: true },
  //     });
  //   } catch (error) {
  //     console.error('Error creating group:', error);
  //   }
  // }

  async createGroupWithMember() {
    if (!(await this.checkNetworkBeforeAction('createGroup'))) {
      return;
    }
    const currentUserId = this.authService.authData?.userId;
    const currentUserPhone = this.authService.authData?.phone_number;
    const currentUserName = this.authService.authData?.name || currentUserPhone;

    if (!currentUserId || !this.receiverId) {
      console.error('Missing user data');
      return;
    }

    const receiverMember = {
      userId: this.receiverId,
      username: this.receiver_name || this.receiver_phone,
      phoneNumber: this.receiver_phone,
    };

    this.firebaseChatService.setInitialGroupMember(receiverMember);

    this.router.navigate(['/add-select-members'], {
      queryParams: {
        from: 'userabout',
      },
    });
  }

  async findCommonGroups(currentUserId: string, receiverId: string) {
    // ✅ Delegate to the fixed version which uses userchats instead of root groups/
    await this.findCommonGroupsAndCache(currentUserId, receiverId);
  }

  getMemberCount(members: any): number {
    if (!members) return 0;
    return Object.keys(members).length;
  }

  get displayedCommonGroups() {
    if (this.showAllCommonGroups || this.commonGroups.length <= 3) {
      return this.commonGroups;
    }
    return this.commonGroups.slice(0, 3);
  }

  get remainingGroupsCount() {
    return Math.max(0, this.commonGroups.length - 3);
  }

  toggleCommonGroups() {
    this.showAllCommonGroups = !this.showAllCommonGroups;
  }

  // async fetchGroupMeta(groupId: string) {
  //   const db = getDatabase();
  //   const groupRef = ref(db, `groups/${groupId}`);

  //   try {
  //     const snapshot = await get(groupRef);
  //     if (snapshot.exists()) {
  //       const groupData = snapshot.val();
  //       console.log("group data ", groupData)
  //       this.groupDescription =
  //         groupData.description || 'No group description.';
  //       this.groupCreatedBy = groupData.createdByName || 'Unknown';
  //       this.groupCreatedAt = groupData.createdAt || '';
  //     }
  //   } catch (error) {
  //     console.error('Error fetching group meta:', error);
  //   }
  // }

  async fetchGroupMeta(groupId: string) {
    const db = getDatabase();
    const groupRef = ref(db, `groups/${groupId}`);

    try {
      const snapshot = await get(groupRef);
      if (snapshot.exists()) {
        const groupData = snapshot.val();

        this.groupMeta = {
          title: groupData.title || groupData.groupName || 'Group',

          description: groupData.description || 'No group description.',

          createdBy: groupData.createdByName || 'Unknown',

          createdAt: groupData.createdAt || '',
        };

        // (optional) backward compatibility
        this.groupName = this.groupMeta.title;
        this.groupDescription = this.groupMeta.description;
        this.groupCreatedBy = this.groupMeta.createdBy;
        this.groupCreatedAt = this.groupMeta.createdAt;
      }
    } catch (error) {
      console.error('❌ Error fetching group meta:', error);
    }
  }

  //yeh delete nhi krna
  // async fetchReceiverAbout(userId: string) {
  //   const db = getDatabase();
  //   const userRef = ref(db, `users/${userId}`);

  //   try {
  //     const snapshot = await get(userRef);
  //     if (snapshot.exists()) {
  //       const userData = snapshot.val();
  //       this.receiverAbout = userData.about || 'Hey there! I am using WhatsApp.';
  //       this.receiverAboutUpdatedAt = userData.updatedAt || '';
  //     }
  //   } catch (error) {
  //     console.error('Error fetching receiver about info:', error);
  //   }
  // }

  async checkIfBlocked() {
    // 1. Ensure currentUserId is set
    this.currentUserId = String(
      this.authService.authData?.userId ||
        localStorage.getItem('userId') ||
        this.currentUserId ||
        ''
    );

    // 2. Ensure receiverId is set
    if (!this.receiverId) {
      console.warn('checkIfBlocked: no receiverId available');
      return;
    }

    if (!this.currentUserId) {
      console.warn('checkIfBlocked: no currentUserId available yet');
      return;
    }

    console.log(
      `🔍 checkIfBlocked: Checking block for ${this.currentUserId} -> ${this.receiverId}`
    );

    const db = getDatabase();

    // 3. Detach old listeners
    try {
      if (this.iBlockedRef) off(this.iBlockedRef);
      if (this.theyBlockedRef) off(this.theyBlockedRef);
    } catch (e) {}

    // 4. Set up new refs
    this.iBlockedRef = ref(
      db,
      `usersBlocks/${this.currentUserId}/${this.receiverId}`
    );
    this.theyBlockedRef = ref(
      db,
      `usersBlocks/${this.receiverId}/${this.currentUserId}`
    );

    // 5. Setup Real-time listeners
    onValue(this.iBlockedRef, (snapshot) => {
      this.zone.run(() => {
        const val = snapshot.val();
        const isBlockedNow = val?.status === 'active';

        console.log('🔄 Block Status (iBlocked):', isBlockedNow);
        this.iBlocked = isBlockedNow;
        this._iBlockedLoaded = true;
        this.cdr.detectChanges();
      });
    });

    onValue(this.theyBlockedRef, (snapshot) => {
      this.zone.run(() => {
        const val = snapshot.val();
        const theyBlockedNow = val?.status === 'active';

        console.log('🔄 Block Status (theyBlocked):', theyBlockedNow);
        this.theyBlocked = theyBlockedNow;
        this._theyBlockedLoaded = true;
        this.cdr.detectChanges();
      });
    });
  }

  async blockUser() {
    if (!(await this.checkNetworkBeforeAction('block'))) {
      return;
    }

    const t = this.translate;

    const alert = await this.alertCtrl.create({
      header: t.instant('userabout.alerts.block.header'),
      message: t.instant('userabout.alerts.block.message', {
        name: this.receiver_name,
      }),
      buttons: [
        { text: t.instant('common.cancel'), role: 'cancel' },
        {
          text: t.instant('userabout.alerts.block.cta'),
          handler: async () => {
            this.zone.run(async () => {
              const db = getDatabase();
              const auth = getAuth();
              const currentUser = auth?.currentUser;

              if (!currentUser) {
                const toast = await this.toastCtrl.create({
                  message: 'Authentication error. Please try logging in again.',
                  duration: 3000,
                  color: 'danger',
                });
                toast.present();
                return;
              }

              const blockRef = ref(
                db,
                `usersBlocks/${this.currentUserId}/${this.receiverId}`
              );

              try {
                await this.firebaseChatService.applySecuredBatchUpdates({
                  [`usersBlocks/${this.currentUserId}/${this.receiverId}/status`]: 'active',
                  [`usersBlocks/${this.currentUserId}/${this.receiverId}/updatedAt`]: Date.now()
                });

                this.iBlocked = true;
                this.cdr.detectChanges(); // ✅ Immediate UI update

                const toast = await this.toastCtrl.create({
                  message: t.instant('userabout.toasts.blocked', {
                    name: this.receiver_name,
                  }),
                  duration: 2000,
                  color: 'danger',
                });
                toast.present();
              } catch (error: any) {
                console.error('Failed to block user:', error);
                const toast = await this.toastCtrl.create({
                  message: `Failed to block: ${
                    error.message || 'Permission denied'
                  }`,
                  duration: 3000,
                  color: 'danger',
                });
                toast.present();
              }
            });
          },
        },
      ],
    });

    await alert.present();
  }

  async unblockUser() {
    if (!(await this.checkNetworkBeforeAction('unblock'))) {
      return;
    }
    const t = this.translate;

    const alert = await this.alertCtrl.create({
      header: t.instant('userabout.alerts.unblock.header'),
      message: t.instant('userabout.alerts.unblock.message', {
        name: this.receiver_name,
      }),
      buttons: [
        { text: t.instant('common.cancel'), role: 'cancel' },
        {
          text: t.instant('common.ok'),
          handler: async () => {
            this.zone.run(async () => {
              const db = getDatabase();
              const auth = getAuth();
              const currentUser = auth?.currentUser;

              if (!currentUser) {
                const toast = await this.toastCtrl.create({
                  message: 'Authentication error. Please try logging in again.',
                  duration: 3000,
                  color: 'danger',
                });
                toast.present();
                return;
              }

              const blockRef = ref(
                db,
                `usersBlocks/${this.currentUserId}/${this.receiverId}`
              );

              try {
                await this.firebaseChatService.applySecuredBatchUpdates({
                  [`usersBlocks/${this.currentUserId}/${this.receiverId}/status`]: 'revoked',
                  [`usersBlocks/${this.currentUserId}/${this.receiverId}/updatedAt`]: Date.now()
                });

                this.iBlocked = false;
                this.cdr.detectChanges(); // ✅ Immediate UI update

                const toast = await this.toastCtrl.create({
                  message: t.instant('userabout.toasts.unblocked', {
                    name: this.receiver_name,
                  }),
                  duration: 2000,
                  color: 'success',
                });
                toast.present();
              } catch (error: any) {
                console.error('Failed to unblock user:', error);
                const toast = await this.toastCtrl.create({
                  message: `Failed to unblock: ${
                    error.message || 'Permission denied'
                  }`,
                  duration: 3000,
                  color: 'danger',
                });
                toast.present();
              }
            });
          },
        },
      ],
    });
    await alert.present();
  }

  async reportUser() {
    if (!(await this.checkNetworkBeforeAction('report'))) {
      return;
    }

    const t = this.translate;
    const currentChat = this.firebaseChatService.currentChat;

    if (!currentChat) {
      console.error('❌ No current chat found in service');
      return;
    }

    try {
      // 1️⃣ Fetch last 5 messages for evidence (excluding reporter's own messages)
      let evidence: any[] = [];
      try {
        const messages = await this.chatPouchDb.getMessages(currentChat.roomId);
        // Sort by timestamp descending, filter out reporter's messages, map, and then slice
        evidence = messages
          .filter((m: any) => String(m.sender) !== String(this.currentUserId))
          .sort((a, b) => (b.timestamp as number) - (a.timestamp as number))
          .map((m: any) => ({
            id: `msg_${m.timestamp}`,
            senderId: parseInt(m.sender) || this.receiverId,
            content: (m.deleted
              ? '[deleted message]'
              : m.text || (m.attachment && m.attachment.url) || ''
            ).trim(),
            type: m.type || 'text',
            timestamp: new Date(m.timestamp).toISOString(),
          }))
          .filter((msg) => msg.content !== '')
          .slice(0, 5);
      } catch (err) {
        console.warn('⚠️ Failed to fetch evidence messages:', err);
      }

      // Check if at least one message is available for evidence
      if (evidence.length === 0) {
        const toast = await this.toastCtrl.create({
          message:
            'At least one message is required as evidence for the report.',
          duration: 3000,
          color: 'warning',
        });
        toast.present();
        return;
      }

      // 2️⃣ Prepare report data
      const reporter = this.authService.authData;
      const reporterSnapshot = {
        name: reporter?.name || 'Unknown',
        phone: reporter?.phone_number || '',
      };

      const reportedSnapshot = {
        name: this.chatType === 'group' ? this.groupName : this.receiver_name,
        phone: this.receiver_phone || '',
        avatar: this.receiverProfile || '',
      };

      // 3️⃣ Open report modal
      const modal = await this.modalCtrl.create({
        component: ReportModalComponent,
        componentProps: {
          reportedUserId: this.receiverId,
          roomId: currentChat.roomId,
          chatType: this.chatType,
          chatTitle:
            this.chatType === 'group' ? this.groupName : this.receiver_name,
          reporterSnapshot,
          reportedSnapshot,
          evidence,
          showBlockOption: this.chatType === 'private',
          isAlreadyBlocked: !!this.iBlocked,
        },
        breakpoints: [0, 0.8, 1],
        initialBreakpoint: 0.8,
        backdropDismiss: true,
      });

      await modal.present();

      const { data } = await modal.onDidDismiss();

      if (data?.success) {
        // 4️⃣ Handle "Also Block" if checked (only for private chats)
        if (data.alsoBlock && this.chatType === 'private' && !this.iBlocked) {
          await this.blockUserSilently();
        }

        // 5️⃣ Show success message
        const msg =
          data.alsoBlock && this.chatType === 'private'
            ? t.instant('userabout.toasts.reportedAndBlocked', {
                name: this.receiver_name,
              })
            : t.instant('userabout.toasts.reported', {
                name:
                  this.chatType === 'group'
                    ? this.groupName
                    : this.receiver_name,
              });

        const toast = await this.toastCtrl.create({
          message: msg,
          duration: 2500,
          color: 'success',
        });
        toast.present();
      }
    } catch (error: any) {
      console.error('❌ Failed to report:', error);
      const toast = await this.toastCtrl.create({
        message: `Failed to send report: ${error.message || 'Unknown error'}`,
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    }
  }

  /**
   * Internal helper to block user without showing another confirmation alert
   */
  private async blockUserSilently() {
    try {
      await this.firebaseChatService.applySecuredBatchUpdates({
        [`usersBlocks/${this.currentUserId}/${this.receiverId}/status`]: 'active',
        [`usersBlocks/${this.currentUserId}/${this.receiverId}/updatedAt`]: Date.now()
      });

      this.iBlocked = true;
      console.log('✅ User blocked silently after report');
    } catch (error) {
      console.error('❌ Failed to block user silently:', error);
    }
  }

  openDisappearingMessages() {
    if (this.chatType === 'group' && !this.canEditGroupSettings) {
      this.alertCtrl
        .create({
          header: 'Permission Denied',
          message:
            'Only admins can change disappearing messages settings in this group.',
          buttons: ['OK'],
        })
        .then((alert) => alert.present());
      return;
    }
    this.navCtrl.navigateForward('/disappearing-messages');
  }

  get disappearingLabel(): string {
    const labels: Record<string, string> = {
      '2': '2 min',
      '7': '7 days',
      '90': '90 days',
      off: 'Off',
    };
    return labels[this.disappearingDuration] || 'Off';
  }

  // 3. ionViewWillEnter ya ngOnInit mein call karo
  private async loadDisappearingSetting(): Promise<void> {
    try {
      const roomId = this.firebaseChatService.currentChat?.roomId;
      if (!roomId) return;
      const setting = await this.firebaseChatService.getDisappearingSetting(
        roomId
      );
      this.disappearingDuration = setting?.duration || 'off';
    } catch {
      this.disappearingDuration = 'off';
    }
  }

  async onAddToFavourite(): Promise<void> {
    const roomId = this.firebaseChatService.currentChat?.roomId;
    if (!roomId) return;

    try {
      const isNowFav = await this.chatListFilterService.toggleFavourite(roomId);
      const toast = await this.toastCtrl.create({
        message: isNowFav ? 'Added to Favourites' : 'Removed from Favourites',
        duration: 2000,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    } catch (err) {
      console.error('[Userabout] toggleFavourite error:', err);
    }
  }

  // ── Is this chat a favourite? (template mein use karo label ke liye) ──────────
  get isFavourite(): boolean {
    const roomId = this.firebaseChatService.currentChat?.roomId;
    if (!roomId) return false;
    return this.chatListFilterService.isFavourite(roomId);
  }

  // ── Open Choose List Sheet ────────────────────────────────────────────────────
  async openChooseListSheet(): Promise<void> {
    const roomId = this.firebaseChatService.currentChat?.roomId;
    if (!roomId) return;

    const modal = await this.modalCtrl.create({
      component: ChooseListSheetComponent,
      componentProps: {
        roomId: roomId,
        roomIds: [roomId],
      },
      breakpoints: [0, 0.5, 0.85],
      initialBreakpoint: 0.85,
      backdropDismiss: true,
      cssClass: 'choose-list-sheet-modal',
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data?.saved) {
      const toast = await this.toastCtrl.create({
        message: 'List updated',
        duration: 2000,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    }
  }

  get isCurrentUserAdmin(): boolean {
    return Array.isArray(this.adminIds) && this.adminIds.includes(String(this.currentUserId));
  }

  openGroupPermissions() {
    this.navCtrl.navigateForward('/group-permissions', {
      queryParams: {
        groupId: this.receiverId,
      },
    });
  }

  async onChatLockToggle(event: any) {
    console.log('this feature add soon');
    // const locked: boolean = event.detail.checked;
    // const roomId = this.firebaseChatService.currentChat?.roomId;
    // if (!roomId) return;

    // try {
    //   await this.firebaseChatService.setLockConversation([roomId], locked);
    //   const toast = await this.toastCtrl.create({
    //     message: locked ? 'Chat locked' : 'Chat unlocked',
    //     duration: 2000,
    //     color: 'success',
    //     position: 'bottom',
    //   });
    //   await toast.present();
    // } catch (err) {
    //   console.error('Chat lock toggle failed:', err);
    //   // Revert toggle on error
    //   this.isChatLocked = !locked;
    // }
  }

  private async loadAddMembersPermission(): Promise<void> {
    try {
      if (this.chatType !== 'group' || !this.receiverId) {
        this.canAddMembers = true;
        return;
      }

      // Admins always bypass — checkGroupPermission handles this internally
      this.canAddMembers = await this.firebaseChatService.checkGroupPermission(
        this.receiverId,
        'addMembers'
      );

      console.log(`👥 Add members permission: ${this.canAddMembers}`);
    } catch (err) {
      console.warn('loadAddMembersPermission error:', err);
      this.canAddMembers = true; // fail open
    }
  }

  private async loadEditGroupSettingsPermission(): Promise<void> {
    try {
      if (this.chatType !== 'group' || !this.receiverId) {
        this.canEditGroupSettings = true;
        return;
      }
      this.canEditGroupSettings =
        await this.firebaseChatService.checkGroupPermission(
          this.receiverId,
          'editGroupSettings'
        );
      console.log(
        `✏️ Edit group settings permission: ${this.canEditGroupSettings}`
      );
    } catch (err) {
      console.warn('loadEditGroupSettingsPermission error:', err);
      this.canEditGroupSettings = true; // fail open
    }
  }

  private async loadInviteViaLinkPermission(): Promise<void> {
    try {
      if (this.chatType !== 'group' || !this.receiverId) {
        this.canInviteViaLink = false;
        return;
      }
      const perms = await this.firebaseChatService.getGroupPermissions(
        this.receiverId
      );
      this.canInviteViaLink = !!perms.inviteViaLink;
      console.log(`🔗 Invite via link permission: ${this.canInviteViaLink}`);
    } catch (err) {
      console.warn('loadInviteViaLinkPermission error:', err);
      this.canInviteViaLink = false;
    }
  }

  async shareInviteLink() {
    try {
      const groupId = this.receiverId;
      if (!groupId) return;

      // Encode the groupId so raw ID is not visible in the link
      const encoded = btoa(`grp_${groupId}`);
      const inviteLink = `https://telldemm.com/join/g_${encoded}`;

      // Navigate to add-select-contact-in-list with the invite link
      this.router.navigate(['/add-selected-contact-in-list'], {
        queryParams: {
          inviteLink: inviteLink,
          groupName: this.groupName || this.chatTitle,
          mode: 'invite',
        },
      });
    } catch (err) {
      console.error('Error navigating to share invite link:', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to open share screen',
        duration: 2000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    }
  }

  openNotifications() {
    this.navCtrl.navigateForward('/chat-notifications', {
      queryParams: {
        chatId: this.receiverId,
        chatType: this.chatType,
      },
    });
  }
}

