import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { v4 as uuidv4 } from 'uuid';
import { Channel } from '../../services/channel';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { ChatBackendSocketService } from 'src/app/services/chat-backend-socket.service';
import { ChatPouchDb } from 'src/app/services/chat-pouch-db';

@Component({
  selector: 'app-invite-admin-contacts-modal',
  templateUrl: './invite-admin-contacts-modal.component.html',
  styleUrls: ['./invite-admin-contacts-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class InviteAdminContactsModalComponent implements OnInit {
  @Input() channel!: Channel;

  searchText = '';
  allContacts: any[] = [];
  isLoading = false;
  isSending = false;

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private firebaseChatService: FirebaseChatService,
    private authService: AuthService,
    private chatBackendSocket: ChatBackendSocketService,
    private chatPouchDb: ChatPouchDb
  ) {}

  ngOnInit() {
    this.loadContacts();
  }

  async loadContacts() {
    this.isLoading = true;
    try {
      let pfUsers = this.firebaseChatService.currentUsers || [];
      const deviceContacts = this.firebaseChatService.currentDeviceContacts || [];

      // PouchDB fallback if in-memory cache is empty
      if (pfUsers.length === 0) {
        try {
          pfUsers = await this.chatPouchDb.getPlatformUsers();
        } catch {
          pfUsers = [];
        }
      }

      const currentUserId = String(this.authService.authData?.userId || '');

      this.allContacts = pfUsers
        .filter((u: any) => String(u.userId ?? u.user_id ?? '') !== currentUserId)
        .map((u: any) => {
          const cleanPhone = (u.phoneNumber || '').replace(/\D/g, '').slice(-10);
          const deviceMatch = deviceContacts.find(
            (dc: any) =>
              (dc.phoneNumber || '').replace(/\D/g, '').slice(-10) === cleanPhone &&
              cleanPhone.length === 10
          );
          return {
            user_id: String(u.userId ?? u.user_id ?? ''),
            name:
              u.device_contact_name ||
              deviceMatch?.username ||
              u.username ||
              u.phoneNumber ||
              'Unknown',
            image: u.avatar ?? u.profile ?? 'assets/images/user.jfif',
            selected: false,
          };
        });
    } catch (e) {
      await this.presentToast('Failed to load contacts');
    } finally {
      this.isLoading = false;
    }
  }

  get filteredContacts(): any[] {
    const q = this.searchText.toLowerCase().trim();
    if (!q) return this.allContacts;
    return this.allContacts.filter(c => c.name.toLowerCase().includes(q));
  }

  get selectedContacts(): any[] {
    return this.allContacts.filter(c => c.selected);
  }

  toggleSelect(contact: any) {
    contact.selected = !contact.selected;
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  async sendInvites() {
    const selected = this.selectedContacts;
    if (!selected.length || !this.channel) return;

    this.isSending = true;
    const senderId = this.authService.authData?.userId;
    const messageText = `accept this invitation to be an admin for my channel, '${this.channel.channel_name}'`;

    let successCount = 0;
    let failCount = 0;

    for (const user of selected) {
      try {
        const receiverId = user.user_id;
        if (!senderId || !receiverId) { failCount++; continue; }

        const roomId = this.firebaseChatService.getRoomIdFor1To1(
          String(senderId),
          String(receiverId)
        );
        const msgId = uuidv4();

        const channelInviteData = {
          channelId: this.channel.channel_id,
          channelName: this.channel.channel_name,
          channelDp: this.channel.channel_dp,
          inviteText: messageText,
          expiryDays: 7,
          isFollowerInvite: false,
          requesterId: senderId,
        };

        await this.chatBackendSocket.sendChannelInvite({
          roomId,
          msgId,
          receiverId: String(receiverId),
          content: messageText,
          channelInviteData,
          timestamp: Date.now(),
        });

        successCount++;
      } catch {
        failCount++;
      }
    }

    this.isSending = false;

    if (successCount > 0) {
      await this.presentToast(
        `Invitation${successCount > 1 ? 's' : ''} sent successfully`
      );
    }
    if (failCount > 0) {
      await this.presentToast(
        `Failed to send ${failCount} invitation${failCount > 1 ? 's' : ''}`
      );
    }

    this.modalCtrl.dismiss({ sent: successCount > 0 });
  }

  async presentToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom',
    });
    await toast.present();
  }

  onImageError(event: any) {
    event.target.src = 'assets/images/user.jfif';
  }
}
