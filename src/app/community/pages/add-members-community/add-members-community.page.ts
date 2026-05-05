import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController, ToastController, AlertController } from '@ionic/angular';
import { ContactSyncService } from 'src/app/services/contact-sync.service';
import { get, getDatabase, ref, update } from 'firebase/database';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/auth/auth.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-add-members-community',
  templateUrl: './add-members-community.page.html',
  styleUrls: ['./add-members-community.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class AddMembersCommunityPage implements OnInit {
  searchText = '';
  allUsers: any[] = [];
  filteredContacts: any[] = [];
  isLoading = false;
  communityId: string = '';
  
  // ★ Mode: 'add' = direct add, 'invite' = send invite link
  mode: 'add' | 'invite' = 'add';
  
  // ★ Invite link
  private inviteLink: string = '';

  constructor(
    private navCtrl: NavController,
    private contactSyncService: ContactSyncService,
    private route: ActivatedRoute,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private authService: AuthService,
    private firebaseChatService: FirebaseChatService
  ) {}

  ngOnInit() {
    this.communityId =
      this.route.snapshot.queryParamMap.get('communityId') || '';
    
    // ★ Mode read karo URL se
    const modeParam = this.route.snapshot.queryParamMap.get('mode');
    this.mode = modeParam === 'invite' ? 'invite' : 'add';
    
    this.loadDeviceMatchedContacts();
    
    // ★ Invite mode mein link generate karo
    if (this.mode === 'invite' && this.communityId) {
      this.generateInviteLink();
    }
  }

  // ★ Invite link generate karo
  private generateInviteLink(): void {
  const encoded = btoa(`comm_${this.communityId}`);
  this.inviteLink = `https://ekmessenger.com/join/c_${encoded}`;
}

  // ★ Link copy karo
  async copyInviteLink(): Promise<void> {
    try {
      await Clipboard.write({ string: this.inviteLink });
      await this.showToast('Invite link copied!', 'success');
    } catch (err) {
      // Fallback for web
      try {
        await navigator.clipboard.writeText(this.inviteLink);
        await this.showToast('Invite link copied!', 'success');
      } catch {
        await this.showToast('Could not copy link', 'danger');
      }
    }
  }

  // ★ Link share karo (native share sheet)
  async shareInviteLink(): Promise<void> {
    try {
      await Share.share({
        title: 'Join my community on app',
        text: `Join my community on app! Click the link to join: ${this.inviteLink}`,
        url: this.inviteLink,
        dialogTitle: 'Share Community Invite',
      });
    } catch (err) {
      console.warn('Share cancelled or failed:', err);
    }
  }

  // ★ Footer button action — mode ke hisaab se
  async onFooterAction(): Promise<void> {
    if (this.mode === 'invite') {
      await this.sendInviteLinkToSelected();
    } else {
      await this.addSelectedMembers();
    }
  }

  // ★ Selected users ko invite link bhejo (unke private chat mein)
  private async sendInviteLinkToSelected(): Promise<void> {
    if (!this.communityId) {
      await this.showToast('Community ID not found', 'danger');
      return;
    }

    const selected = this.selectedUsers;
    if (!selected || selected.length === 0) {
      await this.showToast('No members selected', 'danger');
      return;
    }

    this.isLoading = true;
    try {
      const senderId = this.authService.authData?.userId || '';
      const senderName = this.authService.authData?.name || '';
      const senderPhone = this.authService.authData?.phone_number || '';

      const sendPromises = selected.map(async (user) => {
        try {
          const receiverId = user.user_id || user.userId;
          if (!receiverId) return;

          const msgId = uuidv4();
          const timestamp = Date.now();

          await this.firebaseChatService.sendMessageDirectly(
            {
              msgId,
              roomId: '',
              sender: senderId,
              sender_name: senderName,
              sender_phone: senderPhone,
              receiver_id: receiverId,
              type: 'text',
              text: this.inviteLink,
              timestamp,
              status: 'sent',
            },
            receiverId
          );

          console.log(`✅ Invite link sent to ${user.name}`);
        } catch (err) {
          console.warn(`Failed to send invite to ${user.name}:`, err);
        }
      });

      await Promise.allSettled(sendPromises);

      await this.showToast(
        `Invite link sent to ${selected.length} member(s)!`,
        'success'
      );
      this.navCtrl.back();
    } catch (err) {
      console.error('Error sending invite links:', err);
      await this.showToast('Error sending invite links', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
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
      const deviceContacts = this.firebaseChatService.currentDeviceContacts || [];

      const pfUserPhones = pfUsers.map((pu: any) => String(pu.phoneNumber));

      this.allUsers = [
        ...pfUsers.map((u: any) => ({
          user_id: String(u.userId ?? u.user_id ?? ''),
          name:
            u.device_contact_name ||
            (() => {
              const cleanPhone = (u.phoneNumber || '')
                .replace(/\D/g, '')
                .slice(-10);
              const deviceMatch = deviceContacts.find((dc: any) => {
                return (
                  (dc.phoneNumber || '').replace(/\D/g, '').slice(-10) ===
                    cleanPhone && cleanPhone.length === 10
                );
              });
              return (
                deviceMatch?.username ||
                u.username ||
                u.phoneNumber ||
                'Unknown'
              );
            })(),
          image: u.avatar ?? u.profile ?? 'assets/images/user.jfif',
          phone_number: String(u.phoneNumber ?? ''),
          isOnPlatform: true,
          selected: false,
        })),
      ];

      this.filteredContacts = [...this.allUsers];
    } catch (error) {
      console.error('Error loading contacts', error);
    } finally {
      this.isLoading = false;
    }
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

  checkboxChanged(user: any) {
    user.selected = !user.selected;
  }

  // Original add members function (unchanged)
  async addSelectedMembers() {
    if (!this.communityId) {
      this.showToast('Community ID not found', 'danger');
      return;
    }

    const selected = this.selectedUsers;
    if (!selected || selected.length === 0) {
      this.showToast('No members selected', 'danger');
      return;
    }

    const userIds: string[] = selected
      .map((u: any) => u.user_id ?? u.userId)
      .filter(Boolean)
      .map((id: any) => String(id));

    if (userIds.length === 0) {
      this.showToast('No valid user ids found', 'danger');
      return;
    }

    this.isLoading = true;
    try {
      await this.firebaseChatService.addMembersToCommunity(
        this.communityId,
        userIds
      );

      await this._syncMembersToCommunityAnnouncementGroup(userIds);

      this.showToast('Members added successfully 🎉', 'success');
      this.navCtrl.back();
    } catch (err) {
      console.error('Error adding members', err);
      this.showToast('Error adding members', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  private async _syncMembersToCommunityAnnouncementGroup(
    userIds: string[]
  ): Promise<void> {
    try {
      const db = getDatabase();

      const conventionId = `${this.communityId}_announcement`;
      const conventionSnap = await get(ref(db, `groups/${conventionId}`));

      let announcementGroupId: string | null = null;

      if (conventionSnap.exists()) {
        announcementGroupId = conventionId;
      } else {
        announcementGroupId =
          await this.firebaseChatService.findCommunityAnnouncementGroupId(
            this.communityId
          );
      }

      if (!announcementGroupId) {
        console.warn(`⚠️ No announcement group found`);
        return;
      }

      const annMembersSnap = await get(
        ref(db, `groups/${announcementGroupId}/members`)
      );
      const existingMembers: Record<string, any> = annMembersSnap.exists()
        ? annMembersSnap.val()
        : {};

      const newUserIds = userIds.filter((uid) => !(uid in existingMembers));

      if (newUserIds.length === 0) return;

      await this.firebaseChatService.addMembersToGroup(
        announcementGroupId,
        newUserIds
      );
    } catch (err) {
      console.error('⚠️ Failed to sync members to announcement group:', err);
    }
  }
}