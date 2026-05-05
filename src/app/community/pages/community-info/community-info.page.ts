import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  IonContent,
  NavController,
  IonRouterOutlet,
  ToastController,
  AlertController,
  LoadingController,
  ActionSheetController,
} from '@ionic/angular';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { firstValueFrom } from 'rxjs';
import { ApiService } from 'src/app/services/api/api.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChatPouchDb } from 'src/app/services/chat-pouch-db';
import { getDatabase, ref as rtdbRef, get, push } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { NetworkService } from 'src/app/services/network-connection/network.service';

@Component({
  selector: 'app-community-info',
  templateUrl: './community-info.page.html',
  styleUrls: ['./community-info.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class CommunityInfoPage implements OnInit {
  @ViewChild(IonContent, { static: true }) content!: IonContent;

  communityId: string | null = null;
  communityName: string | null = null;
  memberCount = 0;
  groupCount = 0;
  isScrolled: boolean = false;
  chatTitle = 'Test';
  currentUserId: string = '';
  isCreator: boolean = false;
  loading = false;

  communityMembers: any[] = [];
  adminIds: string[] = [];
  isOffline: boolean = false;
  isSyncing: boolean = false;

  activeSection: 'community' | 'announcements' = 'community';

  community: any = {
    name: '',
    icon: '',
    description:
      'Hi everyone! This community is for members to chat in topic-based groups and get important announcements.',
  };

  whoCanAddMembers: 'everyone' | 'only_admins' = 'only_admins';
  whoCanAddGroups: 'everyone' | 'only_admins' = 'everyone';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private service: ApiService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private actionSheetCtrl: ActionSheetController,
    private translate: TranslateService,
    private chatPouchDb: ChatPouchDb,
    private networkService: NetworkService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const cid = params['communityId'] || '';
      this.communityId = cid;
      console.log('community id is', this.communityId);
    });
  }

  async ionViewWillEnter() {
    this.route.queryParams.subscribe((params) => {
      const cid = params['communityId'] || '';
      this.communityId = cid;
      console.log('community id is', this.communityId);
    });

    this.currentUserId = this.authService?.authData?.userId || '';

    // Update offline status
    this.networkService.isOnline.subscribe((online) => {
      this.isOffline = !online;
    });

    const allGroups = this.firebaseService.currentConversations.filter(
      (c) => c.type === 'group' && c.communityId === this.communityId
    );
    this.groupCount = allGroups.length;

    // Load from cache first for instant display
    await this.loadFromCache();

    // Then load/sync from server if online
    await this.loadCommunityDetail();
  }

  private async loadFromCache(): Promise<void> {
    if (!this.communityId) return;

    try {
      const cachedData = await this.chatPouchDb.getCachedCommunityInfo(
        this.communityId
      );

      if (cachedData) {
        this.community = cachedData.community;
        this.communityMembers = cachedData.members || [];
        this.memberCount = this.communityMembers.length;
        this.groupCount = cachedData.groupCount || 0;
        this.adminIds = cachedData.adminIds || [];
        this.isCreator = this.community?.ownerId === this.currentUserId;

        const settings = this.community?.settings || {};
        this.whoCanAddMembers = settings.whoCanAddMembers || 'only_admins';
        this.whoCanAddGroups = settings.whoCanAddGroups || 'everyone';
      }
    } catch (error) {
      console.error('❌ Error loading from cache:', error);
    }
  }

  async loadCommunityDetail() {
    if (!this.communityId) return;

    if (this.isOffline) {
      console.log('📴 Offline - using cached data only');
      this.loading = false;
      return;
    }

    this.loading = true;
    this.isSyncing = true;

    try {
      this.community = await this.firebaseService.getCommunityDetails(
        this.communityId
      );

      if (!this.community) {
        this.memberCount = 0;
        this.groupCount = 0;
        this.communityMembers = [];
        this.loading = false;
        this.isSyncing = false;
        return;
      }

      this.isCreator = this.community.ownerId === this.currentUserId;
      this.adminIds = this.community.adminIds || [];
      this.memberCount = Object.keys(this.community.members || {}).length;

      // ✅ Settings load karo
      const settings = this.community?.settings || {};
      this.whoCanAddMembers = settings.whoCanAddMembers || 'only_admins';
      this.whoCanAddGroups = settings.whoCanAddGroups || 'everyone';

      await this.fetchCommunityMembersWithProfiles();
      await this.cacheCommunityData();
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
      this.isSyncing = false;
    }
  }

  async fetchCommunityMembersWithProfiles() {
    if (!this.community?.members) {
      this.communityMembers = [];
      return;
    }

    const members = this.community.members || {};
    console.log({ members });
    const memberIds = Object.keys(members);
    console.log({ memberIds });

    // ✅ Use ownerId for current owner, createdBy for original creator
    const currentOwnerId = this.community.ownerId;
    const originalCreatorId = this.community.createdBy;

    console.log({ currentOwnerId, originalCreatorId });

    const memberPromises = memberIds.map(async (userId) => {
      const memberData = members[userId];
      console.log({ memberData });

      try {
        const userProfileRes: any = await firstValueFrom(
          this.service.getUserProfilebyId(userId)
        );
        console.log({ userProfileRes });

        return {
          user_id: userId,
          username: userProfileRes?.name || 'Unknown',
          phone: userProfileRes?.phone_number || '',
          phoneNumber: userProfileRes?.phone_number || '',
          avatar: userProfileRes?.profile || 'assets/images/community_icon.svg',
          isActive: memberData.isActive ?? true,
          isOwner: String(userId) === String(currentOwnerId), // ✅ Current owner
          isCreator: String(userId) === String(originalCreatorId), // ✅ Original creator
          status: userProfileRes.dp_status,
        };
      } catch (err) {
        console.warn(`Failed to fetch profile for user ${userId}`, err);

        return {
          user_id: userId,
          username: memberData.username || 'Unknown',
          phone: memberData.phoneNumber || '',
          phoneNumber: memberData.phoneNumber || '',
          avatar: 'assets/images/community_icon.svg',
          isActive: memberData.isActive ?? true,
          isOwner: String(userId) === String(currentOwnerId), // ✅ Current owner
          isCreator: String(userId) === String(originalCreatorId), // ✅ Original creator
        };
      }
    });

    let fetchedMembers = await Promise.all(memberPromises);
    fetchedMembers = fetchedMembers.filter((m) => m.isActive !== false);

    this.communityMembers = await this.membersWithDeviceNames(fetchedMembers);

    console.log('Community members with device names:', this.communityMembers);
  }

  /**
   * 🔥 Cache community data to PouchDB for offline access
   */
  private async cacheCommunityData(): Promise<void> {
    if (!this.communityId || !this.community) return;

    try {
      console.log('💾 Caching community data to PouchDB...');

      await this.chatPouchDb.cacheCommunityInfo(this.communityId, {
        community: this.community,
        members: this.communityMembers,
        memberCount: this.memberCount,
        groupCount: this.groupCount,
        adminIds: this.adminIds,
      });

      console.log('✅ Community data cached successfully');
    } catch (error) {
      console.error('❌ Error caching community data:', error);
    }
  }

  async membersWithDeviceNames(communityMembers: any[]): Promise<any[]> {
    try {
      const deviceContacts = this.firebaseService.currentDeviceContacts || [];
      const pfUsers = this.firebaseService.currentUsers || [];
      const nameByUserId = new Map<string, string>();
      pfUsers.forEach((u: any) => {
        if (u?.userId) {
          const preferred =
            u.device_contact_name || u.username || u.phoneNumber || '';
          if (preferred) nameByUserId.set(String(u.userId), preferred);
        }
      });
      const currentUserId = this.authService.authData?.userId || '';

      return communityMembers.map((member) => {
        if (String(member.user_id) === String(currentUserId)) {
          return {
            ...member,
            username: 'You',
          };
        }

        // Prefer platform user match by user_id first
        const byId = nameByUserId.get(String(member.user_id));
        if (byId) {
          return {
            ...member,
            username: byId,
          };
        }

        const deviceContact = deviceContacts.find((dc) => {
          const memberPhone = (
            member.phoneNumber ||
            member.phone ||
            member.phone_number ||
            ''
          ).replace(/\D/g, '');
          const dcPhone = (dc.phoneNumber || '').replace(/\D/g, '');

          return memberPhone.slice(-10) === dcPhone.slice(-10);
        });

        return {
          ...member,
          username: deviceContact
            ? deviceContact.username
            : member.phoneNumber ||
              member.phone ||
              member.phone_number ||
              member.name ||
              member.username,
        };
      });
    } catch (error) {
      console.error('Error mapping members with device names:', error);
      return communityMembers;
    }
  }

  isAdmin(userId: string): boolean {
    return this.adminIds.includes(String(userId));
  }

  private async checkNetworkBeforeAction(
    action:
      | 'addMembers'
      | 'invite'
      | 'addGroups'
      | 'editCommunity'
      | 'makeAdmin'
      | 'dismissAdmin'
      | 'removeMember'
      | 'exitCommunity'
      | 'assignOwner'
      | 'deactivateCommunity'
      | 'reportCommunity'
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
      | 'addMembers'
      | 'invite'
      | 'addGroups'
      | 'editCommunity'
      | 'makeAdmin'
      | 'dismissAdmin'
      | 'removeMember'
      | 'exitCommunity'
      | 'assignOwner'
      | 'deactivateCommunity'
      | 'reportCommunity'
  ) {
    const messages: Record<typeof action, string> = {
      addMembers:
        'You are offline. Please connect to the internet to add members to the community.',
      invite:
        'You are offline. Please connect to the internet to invite members.',
      addGroups:
        'You are offline. Please connect to the internet to add groups.',
      editCommunity:
        'You are offline. Please connect to the internet to edit community details.',
      makeAdmin:
        'You are offline. Please connect to the internet to make this user a community admin.',
      dismissAdmin:
        'You are offline. Please connect to the internet to dismiss admin.',
      removeMember:
        'You are offline. Please connect to the internet to remove this member.',
      exitCommunity:
        'You are offline. Please connect to the internet to exit the community.',
      assignOwner:
        'You are offline. Please connect to the internet to assign a new owner.',
      deactivateCommunity:
        'You are offline. Please connect to the internet to deactivate the community.',
      reportCommunity:
        'You are offline. Please connect to the internet to report the community.',
    };

    const alert = await this.alertCtrl.create({
      header: "You're Offline",
      message:
        messages[action] ||
        'You are offline. Please connect to the internet to perform this action.',
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
    });

    await alert.present();
  }

  // ✅ NEW: Open member action sheet (like userabout page)
  async openMemberActionSheet(member: any) {
    const isCurrentUserAdmin = this.isAdmin(this.currentUserId);
    const isTargetUserAdmin = this.isAdmin(member.user_id);
    const isSelf = String(member.user_id) === String(this.currentUserId);

    // Build buttons array based on permissions
    const buttons: any[] = [];

    // Message option - Available to everyone except self
    if (!isSelf) {
      buttons.push({
        text: this.translate.instant('message') || 'Message',
        icon: 'chatbox-outline',
        handler: () => this.messageMember(member),
      });
    }

    // Make Admin - Only for Creator when target is not admin
    if (this.isCreator && !isTargetUserAdmin && !isSelf) {
      buttons.push({
        text:
          this.translate.instant('Make community Admin') ||
          'Make community admin',
        icon: 'person-add-outline',
        handler: () => this.makeCommunityAdmin(member),
      });
    }

    // Dismiss Admin - Only for Creator when target is admin
    if (this.isCreator && isTargetUserAdmin && !isSelf) {
      buttons.push({
        text: this.translate.instant('Dismiss Admin') || 'Dismiss as admin',
        icon: 'remove-circle-outline',
        handler: () => this.dismissCommunityAdmin(member),
      });
    }

    // Remove Member - Only for Creator
    if (this.isCreator && !isSelf) {
      buttons.push({
        text:
          this.translate.instant('Remove Member') || 'Remove from community',
        icon: 'person-remove-outline',
        role: 'destructive',
        handler: () => this.removeCommunityMember(member),
      });
    }

    // Cancel button
    buttons.push({
      text: this.translate.instant('common.cancel') || 'Cancel',
      role: 'cancel',
    });

    // Create and present ActionSheet
    const actionSheet = await this.actionSheetCtrl.create({
      header: member.username || 'Member',
      buttons: buttons,
    });

    await actionSheet.present();
  }

  // ✅ NEW: Message a member
  async messageMember(member: any) {
    const senderId = this.authService.authData?.userId || '';
    const receiverId = member.user_id;

    if (!senderId || !receiverId) {
      const toast = await this.toastCtrl.create({
        message: 'Unable to open chat',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
      return;
    }

    await this.firebaseService.openChat(
      {
        receiver: {
          userId: receiverId,
          username: member.username || receiverId,
          phoneNumber: member.phoneNumber || member.phone || '',
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

  // ✅ NEW: Make community admin
  // async makeCommunityAdmin(member: any) {
  //    if (!(await this.checkNetworkBeforeAction('makeAdmin'))) {
  //   return;
  // }

  //   if (!this.communityId || !member?.user_id) {
  //     console.error('Missing communityId or member.user_id');
  //     return;
  //   }

  //   try {
  //     const success = await this.firebaseService.makeCommunityAdmin(
  //       this.communityId,
  //       member.user_id
  //     );

  //     if (success) {
  //       this.adminIds.push(member.user_id);

  //       const toast = await this.toastCtrl.create({
  //         message: this.translate.instant('Make Community Admin Successful', {
  //           name: member.username,
  //         }),
  //         duration: 2000,
  //         color: 'success',
  //       });
  //       await toast.present();

  //       // Refresh members
  //       await this.loadCommunityDetail();
  //     } else {
  //       throw new Error('Failed to make admin');
  //     }
  //   } catch (error) {
  //     console.error('Error making admin:', error);
  //     const toast = await this.toastCtrl.create({
  //       message: this.translate.instant('Something went wrong', {
  //         name: member.username,
  //       }),
  //       duration: 2000,
  //       color: 'danger',
  //     });
  //     await toast.present();
  //   }
  // }

  // ✅ NEW: Make community admin
  async makeCommunityAdmin(member: any) {
    if (!(await this.checkNetworkBeforeAction('makeAdmin'))) {
      return;
    }

    if (!this.communityId || !member?.user_id) {
      console.error('Missing communityId or member.user_id');
      return;
    }

    try {
      const loading = await this.loadingCtrl.create({
        message: 'Making community admin...',
      });
      await loading.present();

      // 1️⃣ First, make user community admin
      const success = await this.firebaseService.makeCommunityAdmin(
        this.communityId,
        member.user_id
      );

      if (!success) {
        throw new Error('Failed to make community admin');
      }

      // 2️⃣ Get announcement and general group IDs
      const announcementGroupId = `${this.communityId}_announcement`;
      const generalGroupId = `${this.communityId}_general`;

      // 3️⃣ Make user admin of announcement group
      try {
        await this.firebaseService.makeGroupAdmin(
          announcementGroupId,
          member.user_id
        );
        console.log(
          `✅ Made user admin of announcement group: ${announcementGroupId}`
        );
      } catch (groupErr) {
        console.warn(
          '⚠️ Failed to make admin of announcement group:',
          groupErr
        );
      }

      // 4️⃣ Make user admin of general group
      try {
        await this.firebaseService.makeGroupAdmin(
          generalGroupId,
          member.user_id
        );
        console.log(`✅ Made user admin of general group: ${generalGroupId}`);
      } catch (groupErr) {
        console.warn('⚠️ Failed to make admin of general group:', groupErr);
      }

      await loading.dismiss();

      // 5️⃣ Update local adminIds array
      this.adminIds.push(member.user_id);

      const toast = await this.toastCtrl.create({
        message:
          this.translate.instant('Make Community Admin Successful', {
            name: member.username,
          }) + ' (also admin of Announcements & General)',
        duration: 3000,
        color: 'success',
      });
      await toast.present();

      // 6️⃣ Refresh members list to show updated admin status
      await this.loadCommunityDetail();
    } catch (error) {
      console.error('Error making admin:', error);

      const loading = await this.loadingCtrl.getTop();
      if (loading) await loading.dismiss();

      const toast = await this.toastCtrl.create({
        message: this.translate.instant('Something went wrong', {
          name: member.username,
        }),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  // ✅ NEW: Dismiss community admin
  // async dismissCommunityAdmin(member: any) {
  //    if (!(await this.checkNetworkBeforeAction('dismissAdmin'))) {
  //   return;
  // }

  //   if (!this.communityId || !member?.user_id) {
  //     console.error('Missing communityId or member.user_id');
  //     return;
  //   }

  //   try {
  //     const success = await this.firebaseService.dismissCommunityAdmin(
  //       this.communityId,
  //       member.user_id
  //     );

  //     if (success) {
  //       this.adminIds = this.adminIds.filter((id) => id !== member.user_id);

  //       const toast = await this.toastCtrl.create({
  //         message: this.translate.instant('Dismiss Community Admin', {
  //           name: member.username,
  //         }),
  //         duration: 2000,
  //         color: 'medium',
  //       });
  //       await toast.present();

  //       // Refresh members
  //       await this.loadCommunityDetail();
  //     } else {
  //       throw new Error('Failed to dismiss admin');
  //     }
  //   } catch (error) {
  //     console.error('Error dismissing admin:', error);
  //     const toast = await this.toastCtrl.create({
  //       message: this.translate.instant('Something went wrong', {
  //         name: member.username,
  //       }),
  //       duration: 2000,
  //       color: 'danger',
  //     });
  //     await toast.present();
  //   }
  // }

  // ✅ NEW: Dismiss community admin
  async dismissCommunityAdmin(member: any) {
    if (!(await this.checkNetworkBeforeAction('dismissAdmin'))) {
      return;
    }

    if (!this.communityId || !member?.user_id) {
      console.error('Missing communityId or member.user_id');
      return;
    }

    try {
      const loading = await this.loadingCtrl.create({
        message: 'Dismissing admin...',
      });
      await loading.present();

      // 1️⃣ First, dismiss as community admin
      const success = await this.firebaseService.dismissCommunityAdmin(
        this.communityId,
        member.user_id
      );

      if (!success) {
        throw new Error('Failed to dismiss community admin');
      }

      // 2️⃣ Get announcement and general group IDs
      const announcementGroupId = `${this.communityId}_announcement`;
      const generalGroupId = `${this.communityId}_general`;

      // 3️⃣ Dismiss as admin of announcement group
      try {
        await this.firebaseService.dismissGroupAdmin(
          announcementGroupId,
          member.user_id
        );
        console.log(
          `✅ Dismissed user as admin of announcement group: ${announcementGroupId}`
        );
      } catch (groupErr) {
        console.warn(
          '⚠️ Failed to dismiss admin of announcement group:',
          groupErr
        );
      }

      // 4️⃣ Dismiss as admin of general group
      try {
        await this.firebaseService.dismissGroupAdmin(
          generalGroupId,
          member.user_id
        );
        console.log(
          `✅ Dismissed user as admin of general group: ${generalGroupId}`
        );
      } catch (groupErr) {
        console.warn('⚠️ Failed to dismiss admin of general group:', groupErr);
      }

      await loading.dismiss();

      // 5️⃣ Update local adminIds array
      this.adminIds = this.adminIds.filter((id) => id !== member.user_id);

      const toast = await this.toastCtrl.create({
        message:
          this.translate.instant('Dismiss Community Admin', {
            name: member.username,
          }) + ' (removed from Announcements & General as well)',
        duration: 3000,
        color: 'medium',
      });
      await toast.present();

      // 6️⃣ Refresh members list
      await this.loadCommunityDetail();
    } catch (error) {
      console.error('Error dismissing admin:', error);

      const loading = await this.loadingCtrl.getTop();
      if (loading) await loading.dismiss();

      const toast = await this.toastCtrl.create({
        message: this.translate.instant('Something went wrong', {
          name: member.username,
        }),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  // ✅ NEW: Remove community member
  async removeCommunityMember(member: any) {
    if (!(await this.checkNetworkBeforeAction('removeMember'))) {
      return;
    }

    if (!this.communityId || !member?.user_id) {
      console.error('Missing communityId or member.user_id');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: this.translate.instant('Remove Member'),
      message: this.translate.instant(
        'Remove member from this Community as well as remove from announcement group of this community',
        {
          name: member.username,
        }
      ),
      buttons: [
        {
          text: this.translate.instant('common.cancel'),
          role: 'cancel',
        },
        {
          text: this.translate.instant('Remove'),
          role: 'destructive',
          handler: async () => {
            await this.performRemoveMember(member);
          },
        },
      ],
    });

    await alert.present();
  }

  async performRemoveMember(member: any) {
    const loading = await this.loadingCtrl.create({
      message: 'Removing member...',
    });
    await loading.present();

    try {
      const success = await this.firebaseService.removeCommunityMember(
        this.communityId!,
        member.user_id
      );

      await loading.dismiss();

      if (success) {
        const toast = await this.toastCtrl.create({
          message: this.translate.instant('removed Member successfully', {
            name: member.username,
          }),
          duration: 2000,
          color: 'success',
        });
        await toast.present();

        // Refresh members
        await this.loadCommunityDetail();
      } else {
        throw new Error('Failed to remove member');
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Error removing member:', error);

      const toast = await this.toastCtrl.create({
        message: this.translate.instant('community.errors.removeMember'),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  onScroll(event: any) {
    const scrollTop = event.detail.scrollTop;
    this.isScrolled = scrollTop > 10;
  }

  setDefaultAvatar(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/community_icon.svg';
  }

  goBackToChat() {
    // if (!this.communityId) return;
    // this.router.navigate(['/community-detail'], {
    //   queryParams: {
    //     communityId: this.communityId,
    //   },
    // });
    this.navCtrl.back();
  }

  setActiveSection(section: 'community' | 'announcements') {
    this.activeSection = section;
  }

  onAddGroups() {
    if (!this.communityId) return;
    this.router.navigate(['/add-group-community'], {
      queryParams: {
        communityId: this.communityId,
      },
    });
  }

  async scrollToSegment(seg: 'community' | 'announcements') {
    await new Promise((r) => setTimeout(r, 80));
    const elId =
      seg === 'community' ? 'section-community' : 'section-announcements';
    const el = document.getElementById(elId);
    if (!el) {
      await this.content.scrollToTop(300);
      return;
    }
    const top = el.offsetTop;
    await this.content.scrollToPoint(0, top, 300);
  }

  async invite() {
    if (!(await this.checkNetworkBeforeAction('invite'))) {
      return;
    }

    this.router.navigate(['/add-members-community'], {
      queryParams: {
        communityId: this.communityId,
        mode: 'invite',
      },
    });
  }

  async addMembers() {
    if (!(await this.checkNetworkBeforeAction('addMembers'))) {
      return;
    }

    this.router.navigate(['/add-members-community'], {
      queryParams: {
        communityId: this.communityId,
      },
    });
  }

  async addGroups() {
    if (!(await this.checkNetworkBeforeAction('addGroups'))) {
      return;
    }
    this.router.navigate(['/add-existing-groups'], {
      queryParams: {
        communityId: this.communityId,
        communityName: this.communityName,
      },
    });
  }

  async editCommunity() {
    if (!(await this.checkNetworkBeforeAction('editCommunity'))) {
      return;
    }

    this.router.navigate(['/edit-community-info'], {
      queryParams: { communityId: this.communityId },
    });
  }

  communitySettings() {
    this.router.navigate(['/community-settings'], {
      queryParams: { communityId: this.communityId },
    });
  }
  async viewGroups() {
    // Preload all groups data before navigation
    await this.preloadAllGroupsData();

    this.router.navigate(['/add-group-community'], {
      queryParams: { communityId: this.communityId },
    });
  }

  /**
   * 🔥 NEW: Preload all groups data (details + chats) into PouchDB
   * This ensures offline access to all community groups
   */
  private async preloadAllGroupsData(): Promise<void> {
    if (!this.communityId) {
      console.warn('No communityId for preloading');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Loading all groups data...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      console.log(
        '🔄 Starting preload of all groups in community:',
        this.communityId
      );

      // Get all groups in this community
      const db = getDatabase();
      const communityRef = rtdbRef(db, `communities/${this.communityId}`);
      const communitySnap = await get(communityRef);

      if (!communitySnap.exists()) {
        console.warn('Community not found');
        await loading.dismiss();
        return;
      }

      const communityData = communitySnap.val();
      const groupIds = Object.keys(communityData.groups || {});

      console.log(`📦 Found ${groupIds.length} groups to preload`);

      if (groupIds.length === 0) {
        await loading.dismiss();
        return;
      }

      // Update loading message
      loading.message = `Loading ${groupIds.length} groups...`;

      // 🔥 PARALLEL PRELOAD: Process all groups simultaneously
      const preloadPromises = groupIds.map((groupId) =>
        this.preloadSingleGroupData(groupId)
      );

      const results = await Promise.allSettled(preloadPromises);

      // Count successful preloads
      const successCount = results.filter(
        (r) => r.status === 'fulfilled'
      ).length;
      const failCount = results.length - successCount;

      console.log(
        `✅ Preloaded ${successCount}/${groupIds.length} groups successfully`
      );

      if (failCount > 0) {
        console.warn(`⚠️ Failed to preload ${failCount} groups`);
      }

      // Show success toast
      const toast = await this.toastCtrl.create({
        message: `Loaded ${successCount} groups for offline access`,
        duration: 2000,
        color: 'success',
      });
      await toast.present();
    } catch (error) {
      console.error('❌ Error preloading groups:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to load some groups data',
        duration: 2000,
        color: 'warning',
      });
      await toast.present();
    } finally {
      await loading.dismiss();
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

      const groupData = groupSnap.val();

      // 2️⃣ Fetch group members with profiles
      const members = groupData.members || {};
      const memberIds = Object.keys(members);
      const adminIds = groupData.adminIds || [];

      const memberProfiles = await Promise.all(
        memberIds.map(async (userId) => {
          try {
            const profileRes: any = await firstValueFrom(
              this.service.getUserProfilebyId(userId)
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

  async assignNewOwner() {
    if (!(await this.checkNetworkBeforeAction('assignOwner'))) {
      return;
    }

    if (!this.communityId) {
      console.error('No community ID');
      return;
    }

    this.router.navigate(['/select-new-owner'], {
      queryParams: { communityId: this.communityId },
    });
  }

  async exitCommunity() {
    if (!(await this.checkNetworkBeforeAction('exitCommunity'))) {
      return;
    }

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
          'Owner cannot exit the community. Please transfer ownership first.',
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

  async reportCommunity() {
    if (!(await this.checkNetworkBeforeAction('reportCommunity'))) {
      return;
    }

    const t = this.translate;

    const alert = await this.alertCtrl.create({
      header: t.instant('userabout.alerts.report.header'),
      message: t.instant('userabout.alerts.report.message', {
        name: this.community?.name || 'this community',
      }),
      buttons: [
        { text: t.instant('common.cancel'), role: 'cancel' },
        {
          text: t.instant('userabout.alerts.report.cta'),
          handler: async () => {
            try {
              const db = getDatabase();
              const auth = getAuth();
              const currentUser = auth?.currentUser;

              if (!currentUser) {
                const toast = await this.toastCtrl.create({
                  message: 'Authentication error. Please try logging in again.',
                  duration: 3000,
                  color: 'danger',
                });
                await toast.present();
                return;
              }

              const reportData = {
                reporterId: this.currentUserId,
                reportedCommunityId: this.communityId,
                communityName: this.community?.name || '',
                category: 'community_report',
                description: `User reported community ${
                  this.community?.name || ''
                }`,
                createdAt: Date.now(),
                status: 'pending',
                resolution: 'none',
                reporterSnapshot: {
                  userId: this.currentUserId,
                  communityId: this.communityId,
                  communityName: this.community?.name || '',
                },
              };

              const reportsRef = rtdbRef(db, 'reports');
              await push(reportsRef, reportData);

              const toast = await this.toastCtrl.create({
                message: t.instant('userabout.toasts.reported', {
                  name: this.community?.name || 'community',
                }),
                duration: 2500,
                color: 'warning',
              });
              await toast.present();
            } catch (error: any) {
              console.error('Failed to report community:', error);
              const toast = await this.toastCtrl.create({
                message: `Failed to send report: ${
                  error?.message || 'Please try again later.'
                }`,
                duration: 3000,
                color: 'danger',
              });
              await toast.present();
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async deactivateCommunity() {
    if (!(await this.checkNetworkBeforeAction('deactivateCommunity'))) {
      return;
    }

    if (!this.communityId || !this.currentUserId) {
      const toast = await this.toastCtrl.create({
        message: 'Unable to deactivate community',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
      return;
    }

    // Only owner can deactivate
    if (!this.isCreator) {
      const toast = await this.toastCtrl.create({
        message: 'Only the community owner can deactivate the community',
        duration: 3000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Deactivate Community',
      message: `Are you sure you want to deactivate "${
        this.community.title || 'this community'
      }"? This will:\n\n• Remove ALL members from the community\n• Remove ALL members from Announcement & General groups\n• Unlink all groups from the community\n• Delete the community from everyone's chat list\n\nThis action cannot be undone.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Deactivate',
          role: 'destructive',
          handler: async () => {
            await this.performDeactivateCommunity();
          },
        },
      ],
    });

    await alert.present();
  }

  private async performDeactivateCommunity() {
    const loading = await this.loadingCtrl.create({
      message: 'Deactivating community...',
    });
    await loading.present();

    try {
      const result = await this.firebaseService.deactivateCommunity(
        this.communityId!,
        this.currentUserId
      );

      await loading.dismiss();

      if (result.success) {
        const toast = await this.toastCtrl.create({
          message: 'Community deactivated successfully',
          duration: 2000,
          color: 'success',
        });
        await toast.present();

        // Navigate back to home screen
        this.router.navigate(['/home-screen'], { replaceUrl: true });
      } else {
        const toast = await this.toastCtrl.create({
          message: result.message || 'Failed to deactivate community',
          duration: 2000,
          color: 'danger',
        });
        await toast.present();
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Deactivate community error:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to deactivate community. Please try again.',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  get canAddMembers(): boolean {
  if (this.isCreator) return true;
  if (this.isAdmin(this.currentUserId)) return true;
  return this.whoCanAddMembers === 'everyone';
}

  async notifications() {
  if (!this.communityId) return;

  const announcementRoomId = `${this.communityId}_announcement`;

  await this.firebaseService.openChat({
    roomId: announcementRoomId,
    type: 'group',
    title: 'Announcements',
  });

  this.router.navigate(['/chat-notifications'], {
    queryParams: {
      roomId: announcementRoomId,
    },
  });
}

  mediaVisibility() {
    console.log('media visibility');
  }

  async disappearingMessages() {
  if (!this.communityId) return;

  const announcementRoomId = `${this.communityId}_announcement`;

  await this.firebaseService.openChat({
    roomId: announcementRoomId,
    type: 'group',
    title: 'Announcements',
  });

  this.router.navigate(['/disappearing-messages']);
}

  chatLock() {
    console.log('chat lock');
  }

  phoneNumberPrivacy() {
    console.log('phone privacy');
  }

  back() {
    this.navCtrl.back();
  }
}
