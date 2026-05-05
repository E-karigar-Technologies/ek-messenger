import { Component, OnInit, Input } from '@angular/core';
import { IonicModule, ModalController, ToastController, NavController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChannelService, Channel } from '../../services/channel';
import { AuthService } from 'src/app/auth/auth.service';
import { ChannelPouchDbService } from '../../services/pouch-db';

@Component({
  selector: 'app-invite-admin-preview-modal',
  templateUrl: './invite-admin-preview-modal.component.html',
  styleUrls: ['./invite-admin-preview-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class InviteAdminPreviewModalComponent implements OnInit {
  @Input() inviteData: any;
  
  step: 'terms' | 'preview' = 'terms';
  isProcessing = false;

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private channelService: ChannelService,
    private authService: AuthService,
    private navCtrl: NavController,
    private postPouchDb: ChannelPouchDbService
  ) {}

  ngOnInit() {
    // inviteData contains: channelId, channelName, channelDp, inviteText, expiryDays, isFollowerInvite
    if (this.inviteData?.isFollowerInvite) {
      this.step = 'preview';
    }
  }

  dismiss(data?: any) {
    this.modalCtrl.dismiss(data);
  }

  agreeAndContinue() {
    this.step = 'preview';
  }

  async acceptInvite() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // ✅ CORRECT LOGIC: 
      // inviterId = the one who SENT the invite (from message.channel_invite.requesterId)
      // currentUserId = the one ACCEPTING (the current user)
      const currentUserId = this.authService.authData?.userId;
      const inviterId = this.inviteData.requesterId;

      if (!currentUserId || !inviterId) {
        throw new Error('Invalid invitation data: missing user information');
      }

      const channelId = this.inviteData.channelId;
      const isFollowerInvite = this.inviteData.isFollowerInvite;

      if (!isFollowerInvite) {
        // Admin invite - use the new invite API
        console.log('--- ADMIN INVITE ACCEPTANCE ---');
        console.log('Inviter (Owner):', inviterId);
        console.log('New Admin (Me):', currentUserId);

        this.channelService.inviteAdmin(channelId, inviterId, [currentUserId]).subscribe({
          next: (res) => {
            console.log('User made admin:', res);
            // ✅ FIX ISSUE #2: UPDATE CACHE AFTER BECOMING ADMIN
            this.updateCacheAfterBecomingAdmin(channelId, currentUserId);
            
            this.presentToast('You are now an admin of this channel!');
            this.dismiss({ accepted: true });
            
            // Redirect to channel chat (channel-feed)
            this.navCtrl.navigateForward('/channel-feed', {
              queryParams: {
                channelId: channelId,
                forceRefresh: 1
              }
            });
          },
          error: (err) => {
            console.error('Error making user admin:', err);
            this.presentToast('Failed to accept admin invitation');
            this.isProcessing = false;
          }
        });
      } else {
        // Follower invite - use the new invite API
        console.log('--- FOLLOWER INVITE ACCEPTANCE ---');
        console.log('Inviter (Owner):', inviterId);
        console.log('New Follower (Me):', currentUserId);
        console.log('Channel ID:', channelId);

        this.channelService.inviteFollower(channelId, inviterId, [currentUserId]).subscribe({
          next: (res) => {
            console.log('Follower added successfully:', res);
            this.presentToast('You are now following this channel!');
            this.dismiss({ accepted: true });

            // Redirect to channel feed
            this.navCtrl.navigateForward('/channel-feed', {
              queryParams: {
                channelId: channelId,
                forceRefresh: 1
              }
            });
          },
          error: (err) => {
            console.error('Error adding follower:', err);
            this.presentToast('Failed to follow channel');
            this.isProcessing = false;
          }
        });
      }

    } catch (error) {
      console.error('Accept invite error:', error);
      this.presentToast(error instanceof Error ? error.message : 'Failed to accept invitation');
      this.isProcessing = false;
    }
  }

  viewChannel() {
    this.dismiss({ viewChannel: true });
  }

  async presentToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }

  setDefaultAvatar(event: any) {
    event.target.src = 'assets/images/user.jfif';
  }

  // ✅ NEW METHOD TO UPDATE LOCAL CACHE WHEN USER BECOMES ADMIN
  private async updateCacheAfterBecomingAdmin(channelId: number | string, userNum: number | string): Promise<void> {
    try {
      const uidString = String(userNum);
      
      // Get current cached My Channels
      const myChannels = await this.postPouchDb.getMyChannels(uidString);
      
      // Find and update the specific channel's role_id
      if (myChannels && myChannels.length > 0) {
        const index = myChannels.findIndex(c => c.channel_id === Number(channelId));
        if (index !== -1) {
          myChannels[index].role_id = 2; // Set as admin (2 = Admin)
          // Also mark as following since they accepted invite
          myChannels[index].is_following = true;
          
          // Save back
          await this.postPouchDb.saveMyChannels(uidString, myChannels);
          console.log(`✅ Updated My Channels cache for new admin. User: ${userNum}, Channel: ${channelId}`);
        }
      }
      
      // Also delete single-channel cache so fresh data loads
      await this.postPouchDb.deleteChannel(Number(channelId));
    } catch (err) {
      console.warn('Cache update failed (safe to ignore):', err);
    }
  }
}
