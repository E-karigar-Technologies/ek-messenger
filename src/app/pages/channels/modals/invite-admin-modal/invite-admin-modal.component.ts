import { Component, OnInit, Input } from '@angular/core';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { v4 as uuidv4 } from 'uuid';
import { ChannelDetails } from '../../services/channel';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { ChatBackendSocketService } from 'src/app/services/chat-backend-socket.service';

@Component({
  selector: 'app-invite-admin-modal',
  templateUrl: './invite-admin-modal.component.html',
  styleUrls: ['./invite-admin-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class InviteAdminModalComponent implements OnInit {
  @Input() channel!: ChannelDetails;
  @Input() userToInvite: any; // Follower to invite

  messageText = '';
  isSending = false;

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private chatService: FirebaseChatService,
    private authService: AuthService,
    private chatBackendSocket: ChatBackendSocketService
  ) {}

  ngOnInit() {
    this.messageText = `accept this invitation to be an admin for my channel, '${this.channel.channel_name}'`;
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  async sendInvite() {
    if (this.isSending) return;
    this.isSending = true;

    try {
      const senderId = this.authService.authData?.userId;
      const receiverId = this.userToInvite.user_id;

      if (!senderId || !receiverId) {
        throw new Error('Invalid sender or receiver');
      }

      const roomId = this.chatService.getRoomIdFor1To1(String(senderId), String(receiverId));
      const msgId  = uuidv4();

      const channelInviteData = {
        channelId:       this.channel.channel_id,
        channelName:     this.channel.channel_name,
        channelDp:       this.channel.channel_dp,
        inviteText:      this.messageText,
        expiryDays:      7,
        isFollowerInvite: false,
        requesterId:     senderId,
      };

      // ✅ All RTDB writes happen on the backend via the socket event
      await this.chatBackendSocket.sendChannelInvite({
        roomId,
        msgId,
        receiverId:        String(receiverId),
        content:           this.messageText,
        channelInviteData,
        timestamp:         Date.now(),
      });

      await this.presentToast('Invitation sent successfully');
      this.modalCtrl.dismiss({ sent: true });
    } catch (error) {
      console.error('Error sending invite:', error);
      await this.presentToast('Failed to send invitation');
    } finally {
      this.isSending = false;
    }
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
}
