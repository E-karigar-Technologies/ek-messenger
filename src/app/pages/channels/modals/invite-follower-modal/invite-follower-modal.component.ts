import { Component, OnInit, Input } from '@angular/core';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChannelDetails } from '../../services/channel';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import { Router } from '@angular/router';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';

@Component({
  selector: 'app-invite-follower-modal',
  templateUrl: './invite-follower-modal.component.html',
  styleUrls: ['./invite-follower-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class InviteFollowerModalComponent implements OnInit {
  @Input() channel!: ChannelDetails;
  
  channelLink = '';

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private router: Router,
    private chatService: FirebaseChatService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Generate a deep link or web link for the channel
    // In a real app, this might be your domain + channel ID
    this.channelLink = `https://convo.app/channel/${this.channel.channel_id}`;
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  /**
   * Send link via Convo (Internal)
   * This redirects to the forward/select contact screen
   */
  async sendViaApp() {
    // Create a mock message to "forward"
    const inviteMessage: any = {
      type: 'channel_invite',
      text: `Check out this channel on Convo: ${this.channel.channel_name}\n${this.channelLink}`,
      sender_phone: this.authService.authData?.phone_number,
      sender_name: this.authService.authData?.name,
      channel_invite: {
        channelId: this.channel.channel_id,
        channelName: this.channel.channel_name,
        channelDp: this.channel.channel_dp,
        inviteText: `I'd like to invite you to follow my channel, '${this.channel.channel_name}'`,
        isFollowerInvite: true,
        requesterId: this.authService.authData?.userId || this.channel.created_by
      }
    };

    // Set as forward message and navigate to select contacts
    this.chatService.setForwardMessage([inviteMessage]);
    
    this.dismiss();
    this.router.navigate(['/forwardmessage']);
  }

  /**
   * Share to status
   */
  shareToStatus() {
    this.presentToast('Feature coming soon: Share to Status');
  }

  /**
   * Copy link to clipboard
   */
  async copyLink() {
    await Clipboard.write({
      string: this.channelLink
    });
    this.presentToast('Link copied to clipboard');
  }

  /**
   * System Share
   */
  async systemShare() {
    await Share.share({
      title: this.channel.channel_name,
      text: `Follow my channel ${this.channel.channel_name} on Convo!`,
      url: this.channelLink,
      dialogTitle: 'Share Channel'
    });
  }

  async presentToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }
}
