import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController } from '@ionic/angular';
import { ContactSyncService } from 'src/app/services/contact-sync.service'; // adjust if path differs
import {
  get,
  child,
  getDatabase,
  ref as dbRef,
  update,
  ref,
} from 'firebase/database';
import { ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';

@Component({
  selector: 'app-add-members',
  templateUrl: './add-members.page.html',
  styleUrls: ['./add-members.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class AddMembersPage implements OnInit {
  searchText = '';
  allUsers: any[] = [];
  filteredContacts: any[] = [];
  isLoading = false;
  groupId: string = '';

  constructor(
    private navCtrl: NavController,
    private contactSyncService: ContactSyncService,
    private route: ActivatedRoute,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private service: ApiService,
    private firebaseChatService: FirebaseChatService
  ) {}

  ngOnInit() {
    this.loadDeviceMatchedContacts();
    this.groupId = this.route.snapshot.queryParamMap.get('groupId') || '';
  }

  async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    toast.present();
  }

  async loadDeviceMatchedContacts(): Promise<void> {
    const currentUserPhone = this.authService.authData?.phone_number;
    this.allUsers = [];
    this.isLoading = true;

    try {
      const pfUsers = await this.firebaseChatService.getResolvedPlatformUsers();
      const currentChatMember = this.firebaseChatService.currentChat?.members;
      console.log({ currentChatMember });
      const deviceContacts =
        this.firebaseChatService.currentDeviceContacts || [];

      // Extract platform user phone numbers for reference
      const pfUserPhones = pfUsers.map((pu: any) => String(pu.phoneNumber));

      // Optionally: find device contacts not on the platform
      const nonPfUsers = deviceContacts.filter(
        (dc: any) => !pfUserPhones.includes(String(dc.phoneNumber))
      );

      // Normalize platform users to match your HTML structure
      // Build a helper: device_contact_name → phone number (backend omits phone for privacy)
      const resolvePhoneFromDeviceName = (deviceContactName?: string): string => {
        if (!deviceContactName) return '';
        const dcMatch = deviceContacts.find(
          (dc: any) =>
            (dc.username || '').toLowerCase() === deviceContactName.toLowerCase()
        );
        return dcMatch?.phoneNumber || '';
      };

      this.allUsers = [
        ...pfUsers
          .filter(
            (u: any) =>
              !currentChatMember?.includes(String(u.userId ?? u.user_id ?? ''))
          )
          .map((u: any) => {
            // Phone is empty from backend for privacy — resolve from device contacts
            const resolvedPhone =
              (u.phoneNumber as string) ||
              resolvePhoneFromDeviceName(u.device_contact_name);

            const cleanPhone = resolvedPhone.replace(/\D/g, '').slice(-10);
            const deviceMatch =
              cleanPhone.length === 10
                ? deviceContacts.find(
                    (dc: any) =>
                      (dc.phoneNumber || '').replace(/\D/g, '').slice(-10) ===
                      cleanPhone
                  )
                : undefined;

            return {
              user_id: String(u.userId ?? u.user_id ?? ''),
              name:
                u.device_contact_name ||
                deviceMatch?.username ||
                resolvedPhone ||
                'Unknown',
              image: u.avatar ?? u.profile ?? 'assets/images/user.jfif',
              phone_number: resolvedPhone,
              isOnPlatform: true,
              selected: false,
            };
          }),
      ];
      console.log('all users ', this.allUsers);

      // Initialize filtered list for search
      this.filteredContacts = [...this.allUsers];
    } catch (error) {
      console.error('Error loading contacts', error);
    } finally {
      this.isLoading = false;
    }
  }

  onBack() {
    this.navCtrl.back();
  }

  get selectedUsers() {
    return this.allUsers.filter((user) => user.selected);
  }

  toggleSelect(user: any) {
    user.selected = !user.selected;
  }

  filteredUsers() {
    const search = this.searchText.toLowerCase();
    return this.filteredContacts.filter((user) =>
      user.name?.toLowerCase().includes(search)
    );
  }

  async addSelectedMembers() {
    if (!this.groupId) {
      this.showToast('Group ID not found', 'danger');
      return;
    }

    const selected = this.selectedUsers;
    if (!selected || selected.length === 0) {
      this.showToast('No members selected', 'danger');
      return;
    }

    // Normalize user ids to strings (firebase user ids)
    const userIds: string[] = selected
      .map((u: any) => u.user_id ?? u.userId ?? u.userId)
      .filter(Boolean)
      .map((id: any) => String(id));

    if (userIds.length === 0) {
      this.showToast('No valid user ids found', 'danger');
      return;
    }

    this.isLoading = true;
    try {
      // ── Step 1: Add members to the target group ──────────────────────────────
      await this.firebaseChatService.addMembersToGroup(this.groupId, userIds);
      console.log(`✅ Members added to group: ${this.groupId}`);

      // ── Step 2: If group belongs to a community → sync to announcement group ─
      const db = getDatabase();
      const communityIdSnap = await get(
        ref(db, `groups/${this.groupId}/communityId`)
      );
      const communityId: string | null = communityIdSnap.val();

      if (communityId) {
        console.log(`🏘️ Group belongs to community: ${communityId}`);

        // Run both syncs in parallel (non-blocking individually)
        await Promise.allSettled([
          this._syncMembersToCommunityMembers(communityId, userIds, db),
          this._syncMembersToCommunityAnnouncementGroup(communityId, userIds, db),
        ]);
      } else {
        console.log(`ℹ️ Group is not part of any community — skipping community sync`);
      }

      // ── Step 3: Sync to backend ───────────────────────────────────────────────
      const backendGroupIdSnap = await get(
        ref(db, `groups/${this.groupId}/backendGroupId`)
      );
      const backendGroupId = backendGroupIdSnap.val();

      if (!backendGroupId) {
        this.showToast(
          'Members added in Firebase (backend id missing)',
          'success'
        );
        this.navCtrl.back();
        return;
      }

      const platformUsers = this.firebaseChatService.currentUsers || [];

      const backendCalls = userIds.map((uid) => {
        const found = platformUsers.find(
          (p: any) =>
            String(p.userId) === String(uid) ||
            String(p.user_id) === String(uid)
        );
        const numericUserId = Number(found?.userId ?? found?.userId ?? uid);
        const userIdForApi = Number.isFinite(numericUserId)
          ? numericUserId
          : Number(uid);

        return new Promise<void>((resolve) => {
          this.service
            .addGroupMember(Number(backendGroupId), Number(userIdForApi), 2)
            .subscribe({
              next: () => resolve(),
              error: (err) => {
                console.error('Failed to sync member to backend', uid, err);
                resolve(); // non-blocking
              },
            });
        });
      });

      await Promise.all(backendCalls);

      this.showToast('Members added successfully 🎉', 'success');
      this.navCtrl.back();
    } catch (err) {
      console.error('Error adding members', err);
      this.showToast('Error adding members', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Add selected members to the community's members list.
   * Only adds users who are not already community members.
   */
  private async _syncMembersToCommunityMembers(
    communityId: string,
    userIds: string[],
    db: ReturnType<typeof getDatabase>
  ): Promise<void> {
    try {
      // Fetch existing community members
      const communityMembersSnap = await get(
        ref(db, `communities/${communityId}/members`)
      );
      const existingMembers: Record<string, any> = communityMembersSnap.exists()
        ? communityMembersSnap.val()
        : {};

      // Filter out users already in the community
      const newUserIds = userIds.filter((uid) => !(uid in existingMembers));

      if (newUserIds.length === 0) {
        console.log(`ℹ️ All selected users are already community members`);
        return;
      }

      const now = Date.now();
      const platformUsers = this.firebaseChatService.currentUsers || [];
      const updates: Record<string, any> = {};

      for (const uid of newUserIds) {
        // Get user info for richer member entry
        const pfUser = platformUsers.find(
          (p: any) => String(p.userId ?? p.user_id) === uid
        );

        // Add to communities/${communityId}/members
        updates[`communities/${communityId}/members/${uid}`] = {
          isActive: true,
          joinedAt: now,
          role: 'member',
          username: pfUser?.username || '',
          phoneNumber: pfUser?.phoneNumber || '',
        };

        // Add community to user's userchats (so it appears in their chat list)
        // Fetch existing userchats entry to avoid overwriting settings
        const userChatSnap = await get(
          ref(db, `userchats/${uid}/${communityId}`)
        );
        if (!userChatSnap.exists()) {
          updates[`userchats/${uid}/${communityId}`] = {
            type: 'community',
            lastmessageAt: now,
            lastmessageType: 'text',
            lastmessage: '',
            unreadCount: 0,
            isArchived: false,
            isPinned: false,
            isLocked: false,
          };
        }

        // Track in usersInCommunity index
        updates[`usersInCommunity/${uid}/joinedCommunities/${communityId}`] = true;
      }

      await this.firebaseChatService.applySecuredBatchUpdates(updates);

      console.log(
        `✅ ${newUserIds.length} member(s) added to community: ${communityId}`
      );
    } catch (err) {
      console.error('⚠️ Failed to sync members to community:', err);
    }
  }

  /**
   * Add selected members to the community's announcement group.
   * Only adds users who are not already members of the announcement group.
   */
  private async _syncMembersToCommunityAnnouncementGroup(
    communityId: string,
    userIds: string[],
    db: ReturnType<typeof getDatabase>
  ): Promise<void> {
    try {
      // Primary: convention-based ID (communityId_announcement)
      const conventionId = `${communityId}_announcement`;
      const conventionSnap = await get(ref(db, `groups/${conventionId}`));

      let announcementGroupId: string | null = null;

      if (conventionSnap.exists()) {
        announcementGroupId = conventionId;
        console.log(`📢 Found announcement group by convention: ${announcementGroupId}`);
      } else {
        // Fallback: dynamic lookup via service
        announcementGroupId =
          await this.firebaseChatService.findCommunityAnnouncementGroupId(
            communityId
          );
        if (announcementGroupId) {
          console.log(`📢 Found announcement group dynamically: ${announcementGroupId}`);
        }
      }

      if (!announcementGroupId) {
        console.warn(`⚠️ No announcement group found for community: ${communityId}`);
        return;
      }

      // Filter out users already in the announcement group to avoid duplicates
      const annMembersSnap = await get(
        ref(db, `groups/${announcementGroupId}/members`)
      );
      const existingMembers: Record<string, any> = annMembersSnap.exists()
        ? annMembersSnap.val()
        : {};

      const newUserIds = userIds.filter((uid) => !(uid in existingMembers));

      if (newUserIds.length === 0) {
        console.log(`ℹ️ All selected users are already in announcement group`);
        return;
      }

      await this.firebaseChatService.addMembersToGroup(
        announcementGroupId,
        newUserIds
      );

      console.log(
        `✅ ${newUserIds.length} member(s) added to announcement group: ${announcementGroupId}`
      );
    } catch (err) {
      // Non-blocking: log but don't throw — main group add already succeeded
      console.error('⚠️ Failed to sync members to announcement group:', err);
    }
  }

  checkboxChanged(user: any) {
    user.selected = !user.selected;
  }
}