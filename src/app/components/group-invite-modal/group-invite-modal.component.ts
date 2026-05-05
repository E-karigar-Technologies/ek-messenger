import { Component, OnInit, Input } from '@angular/core';
import {
  IonicModule,
  ModalController,
  ToastController,
  LoadingController,
} from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { getDatabase, ref, get } from 'firebase/database';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';

@Component({
  selector: 'app-group-invite-modal',
  templateUrl: './group-invite-modal.component.html',
  styleUrls: ['./group-invite-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class GroupInviteModalComponent implements OnInit {
  @Input() groupId: string = '';
  @Input() communityId: string = '';
  @Input() inviteType: 'group' | 'community' = 'group';
  @Input() inviteLink: string = '';

  // Shared display fields
  displayName: string = '';
  displayDescription: string = '';
  displayDp: string = 'assets/images/user.jfif';
  memberCount: number = 0;
  isCurrentUserMember: boolean = false;
  isLoading: boolean = true;
  isJoining: boolean = false;
  currentUserId: string = '';

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private router: Router,
    private chatService: FirebaseChatService,
    private authService: AuthService,
    private apiService: ApiService
  ) {}

  async ngOnInit() {
    this.currentUserId = this.authService.authData?.userId || '';
    if (this.inviteType === 'community') {
      await this.loadCommunityInfo();
    } else {
      await this.loadGroupInfo();
    }
  }

  // ─── Load group info ─────────────────────────────────────────────────────────
  async loadGroupInfo(): Promise<void> {
    this.isLoading = true;
    try {
      if (!this.groupId) {
        await this.showToast('Invalid invite link', 'danger');
        this.dismiss();
        return;
      }

      const db = getDatabase();
      const groupRef = ref(db, `groups/${this.groupId}`);
      const snap = await get(groupRef);

      if (!snap.exists()) {
        await this.showToast('Group not found or invite link is invalid', 'danger');
        this.dismiss();
        return;
      }

      const groupData = snap.val();
      this.displayName = groupData.title || groupData.groupName || 'Group';
      this.displayDescription = groupData.description || '';

      const members = groupData.members || {};
      this.memberCount = Object.keys(members).length;
      this.isCurrentUserMember = !!members[this.currentUserId];

      try {
        const dpResponse: any = await this.apiService.getGroupDp(this.groupId).toPromise();
        if (dpResponse?.group_dp_url) {
          this.displayDp = dpResponse.group_dp_url;
        }
      } catch { }
    } catch (err) {
      console.error('Error loading group info:', err);
      await this.showToast('Failed to load group info', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  // ─── Load community info ─────────────────────────────────────────────────────
  async loadCommunityInfo(): Promise<void> {
    this.isLoading = true;
    try {
      if (!this.communityId) {
        await this.showToast('Invalid invite link', 'danger');
        this.dismiss();
        return;
      }

      const db = getDatabase();
      const communityRef = ref(db, `communities/${this.communityId}`);
      const snap = await get(communityRef);

      if (!snap.exists()) {
        await this.showToast('Community not found or invite link is invalid', 'danger');
        this.dismiss();
        return;
      }

      const data = snap.val();
      this.displayName = data.title || data.name || 'Community';
      this.displayDescription = data.description || '';
      this.displayDp = data.avatar || 'assets/images/user.jfif';

      const members = data.members || {};
      this.memberCount = Object.keys(members).length;
      this.isCurrentUserMember = !!members[this.currentUserId];
    } catch (err) {
      console.error('Error loading community info:', err);
      await this.showToast('Failed to load community info', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  // ─── Join (group or community) ───────────────────────────────────────────────
  async joinAction(): Promise<void> {
    if (this.isJoining) return;
    this.isJoining = true;

    const loading = await this.loadingCtrl.create({
      message: this.inviteType === 'community' ? 'Joining community...' : 'Joining group...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      if (this.inviteType === 'community') {
        await this.joinCommunity();
      } else {
        await this.joinGroup();
      }
      await loading.dismiss();
      this.isJoining = false;
      this.isCurrentUserMember = true;
      this.memberCount += 1;

      const label = this.inviteType === 'community' ? 'community' : 'group';
      await this.showToast(`Joined "${this.displayName}" successfully! 🎉`, 'success');
      await this.dismiss();
      await this.navigateAfterJoin();
    } catch (err) {
      console.error('Error joining:', err);
      await loading.dismiss();
      this.isJoining = false;
      const label = this.inviteType === 'community' ? 'community' : 'group';
      await this.showToast(`Failed to join ${label}. Please try again.`, 'danger');
    }
  }

  private async joinGroup(): Promise<void> {
    await this.chatService.addMembersToGroup(this.groupId, [this.currentUserId]);
  }

  private async joinCommunity(): Promise<void> {
    const userProfile = this.authService.authData;
    await this.chatService.addMembersToCommunity(this.communityId, [this.currentUserId]);

    // Also add to announcement + general groups
    const announcementGroupId = await this.chatService.findCommunityAnnouncementGroupId(this.communityId);
    const generalGroupId = await this.chatService.findCommunityGeneralGroupId(this.communityId);

    const memberIds = [this.currentUserId];
    if (announcementGroupId) {
      await this.chatService.addMembersToGroup(announcementGroupId, memberIds);
    }
    if (generalGroupId) {
      await this.chatService.addMembersToGroup(generalGroupId, memberIds);
    }
  }

  // ─── View (already a member) ─────────────────────────────────────────────────
  async viewAction(): Promise<void> {
    await this.dismiss();
    await this.navigateAfterJoin();
  }

  // ─── Navigate after join/open ────────────────────────────────────────────────
  private async navigateAfterJoin(): Promise<void> {
    await this.chatService.closeChat();

    if (this.inviteType === 'community') {
      this.router.navigate(['/community-detail'], {
        queryParams: { receiverId: this.communityId },
        replaceUrl: true,
      });
    } else {
      // Group: go home then open the group chat
      await this.router.navigate(['/home-screen'], { replaceUrl: true });
      setTimeout(() => {
        const groupChat = {
          roomId: this.groupId,
          type: 'group',
          title: this.displayName,
          avatar: this.displayDp,
          members: [],
        };
        this.chatService.openChat(groupChat).then(() => {
          this.router.navigate(['/chatting-screen'], {
            queryParams: {
              receiverId: this.groupId,
              receiver_name: this.displayName,
              chatType: 'group',
            },
          });
        });
      }, 150);
    }
  }

  async dismiss(): Promise<void> {
    await this.modalCtrl.dismiss();
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = 'assets/images/user.jfif';
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'primary'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color, position: 'bottom' });
    await toast.present();
  }
}