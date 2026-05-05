import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { ContactSyncService } from 'src/app/services/contact-sync.service';
import { FileSystemService } from 'src/app/services/file-system.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { IMessage } from 'src/app/services/sqlite.service';

export interface SelectableContact {
  /** For existing chats: roomId. For contacts without chat: their userId. */
  roomId: string;
  title: string;
  avatar: string | null;
  type: 'private' | 'group' | 'community';
  /** true = platform user without an existing chat (device-matched contact) */
  isContact: boolean;
}

@Component({
  selector: 'app-select-contact-list',
  templateUrl: './select-contact-list.page.html',
  styleUrls: ['./select-contact-list.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class SelectContactListPage implements OnInit {
  @ViewChild('searchInputRef') searchInputRef!: ElementRef<HTMLInputElement>;

  searchText = '';
  showSearch = false;
  isLoading = false;
  selectedAttachment: any;

  selected: SelectableContact[] = [];

  /** Existing chats (private + group), sorted from most-recent */
  frequentChats: SelectableContact[] = [];
  /** Platform users that are on device but have no existing chat */
  deviceContacts: SelectableContact[] = [];

  filteredFrequent: SelectableContact[] = [];
  filteredDevice: SelectableContact[] = [];

  constructor(
    private navCtrl: NavController,
    private contactSyncService: ContactSyncService,
    private route: ActivatedRoute,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private service: ApiService,
    private firebaseChatService: FirebaseChatService,
    private FileService: FileSystemService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.selectedAttachment = this.firebaseChatService.getSelectedAttachment();
    await this.buildLists();
  }

  // ── Search toggle ────────────────────────────────────────────
  openSearch(): void {
    this.showSearch = true;
    this.cdr.detectChanges();
    setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 100);
  }

  closeSearch(): void {
    this.showSearch = false;
    this.clearSearch();
  }

  clearSearch(): void {
    this.searchText = '';
    this.applySearch();
    this.cdr.detectChanges();
  }

  onSearch(): void {
    this.applySearch();
  }

  // ── Build lists ──────────────────────────────────────────────
  private async buildLists(): Promise<void> {
    this.isLoading = true;
    try {
      const senderId = this.authService.authData?.userId || '';
      const conversations = this.firebaseChatService.currentConversations || [];
      const platformUsers = await this.firebaseChatService.getResolvedPlatformUsers();

      // Frequently contacted: all non-community, non-archived, non-locked chats
      this.frequentChats = conversations
        .filter((c: any) => c.type !== 'community' && !c.isArchived && !c.isLocked)
        .map((c: any) => ({
          roomId: c.roomId,
          title: c.title || c.roomId,
          avatar: c.avatar || null,
          type: c.type as any,
          isContact: false,
        }));

      // Device matched contacts: platform users who don't already have a chat
      const chattedUserIds = new Set<string>();
      conversations.forEach((c: any) => {
        if (c.type === 'private') {
          c.roomId.split('_').forEach((p: string) => {
            if (p !== senderId) chattedUserIds.add(p);
          });
        }
      });

      this.deviceContacts = platformUsers
        .filter((u: any) => {
          const uid = String(u.userId || u.user_id || '');
          return uid && uid !== senderId && !chattedUserIds.has(uid);
        })
        .map((u: any) => ({
          roomId: String(u.userId || u.user_id || ''),
          title: u.device_contact_name || u.username || u.name || u.phoneNumber || 'Unknown',
          avatar: u.avatar || u.profile || null,
          type: 'private' as const,
          isContact: true,
        }));

      this.applySearch();
    } catch (err) {
      console.error('[SelectContactList] buildLists error:', err);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private applySearch(): void {
    const q = this.searchText.trim().toLowerCase();
    if (!q) {
      this.filteredFrequent = [...this.frequentChats];
      this.filteredDevice   = [...this.deviceContacts];
    } else {
      this.filteredFrequent = this.frequentChats.filter(c =>
        c.title.toLowerCase().includes(q)
      );
      this.filteredDevice = this.deviceContacts.filter(c =>
        c.title.toLowerCase().includes(q)
      );
    }
  }

  // ── Selection ────────────────────────────────────────────────
  isSelected(chat: SelectableContact): boolean {
    return this.selected.some(s => s.roomId === chat.roomId);
  }

  toggleSelect(chat: SelectableContact): void {
    if (this.isSelected(chat)) {
      this.selected = this.selected.filter(s => s.roomId !== chat.roomId);
    } else {
      this.selected.push({ ...chat });
    }
    this.cdr.detectChanges();
  }

  removeSelected(chat: SelectableContact): void {
    this.selected = this.selected.filter(s => s.roomId !== chat.roomId);
    this.cdr.detectChanges();
  }

  getInitial(title: string): string {
    return (title || '?').charAt(0).toUpperCase();
  }

  goBack(): void {
    if (this.showSearch) {
      this.closeSearch();
    } else {
      this.navCtrl.back();
    }
  }

  async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  // ── Send attachment ──────────────────────────────────────────
  async sendAttachment() {
    if (!this.selectedAttachment) {
      await this.showToast('No attachment selected', 'danger');
      return;
    }

    if (this.selected.length === 0) {
      await this.showToast('Please select at least one contact', 'danger');
      return;
    }

    this.isLoading = true;
    const loadingToast = await this.toastCtrl.create({
      message: `Sending to ${this.selected.length} contact(s)...`,
      duration: 0,
      position: 'bottom',
    });
    await loadingToast.present();

    try {
      const currentUserId   = this.authService.authData?.userId || '';
      const currentUserName = this.authService.authData?.name   || 'You';

      // Upload once, reuse for all recipients
      const mediaId  = await this.uploadAttachmentToS3(this.selectedAttachment);
      const res      = await firstValueFrom(this.service.getDownloadUrl(mediaId));
      const cdnUrl   = res.status ? res.downloadUrl : '';
      const localUrl = await this.FileService.saveFileToSent(
        this.selectedAttachment.fileName,
        this.selectedAttachment.blob
      );

      const attachmentPayload = {
        type:     this.selectedAttachment.type,
        mediaId,
        fileName: this.selectedAttachment.fileName,
        mimeType: this.selectedAttachment.mimeType,
        fileSize: this.selectedAttachment.fileSize,
        caption:  this.selectedAttachment.caption || '',
        cdnUrl,
        localUrl,
      };

      const sendPromises = this.selected.map(async (chat) => {
        let receiverId: string;

        if (chat.isContact) {
          // Device contact without existing chat — roomId IS the userId
          receiverId = chat.roomId;
        } else if (chat.type === 'private') {
          // Extract the other participant from private roomId (senderId_receiverId)
          const parts = chat.roomId.split('_');
          receiverId  = parts.find(p => p !== currentUserId) ?? parts[1] ?? chat.roomId;
        } else {
          // Group chat — use roomId as the group room target
          receiverId = chat.roomId;
        }

        const message: Partial<IMessage & { attachment?: any }> = {
          sender:       currentUserId,
          sender_name:  currentUserName,
          receiver_id:  receiverId,
          text:         attachmentPayload.caption || '',
          timestamp:    Date.now(),
          msgId:        this.generateUUID(),
          replyToMsgId: '',
          isEdit:       false,
          isPinned:     false,
          type:         'image',
          reactions:    [],
          attachment: {
            ...attachmentPayload,
            msgId: this.generateUUID(),
          },
        };

        return this.firebaseChatService.sendMessageDirectly(message, receiverId);
      });

      await Promise.all(sendPromises);
      await loadingToast.dismiss();
      await this.showToast(`Attachment sent to ${this.selected.length} contact(s)`, 'success');

      this.selectedAttachment = null;
      this.firebaseChatService.clearSelectedAttachment();
      this.navCtrl.back();
    } catch (error) {
      console.error('❌ Error sending attachment:', error);
      await loadingToast.dismiss();
      await this.showToast('Failed to send attachment. Please try again.', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────
  private async uploadAttachmentToS3(attachment: any): Promise<string> {
    const currentUserId = parseInt(this.authService.authData?.userId || '0');
    const uploadResponse: any = await firstValueFrom(
      this.service.getUploadUrl(
        currentUserId,
        attachment.type,
        attachment.fileSize,
        attachment.mimeType,
        { caption: attachment.caption || '', fileName: attachment.fileName }
      )
    );
    if (!uploadResponse?.status || !uploadResponse.upload_url) {
      throw new Error('Failed to get upload URL');
    }
    const file = this.blobToFile(attachment.blob, attachment.fileName, attachment.mimeType);
    await firstValueFrom(this.service.uploadToS3(uploadResponse.upload_url, file));
    return uploadResponse.media_id;
  }

  private blobToFile(blob: Blob, fileName: string, mimeType?: string): File {
    return new File([blob], fileName, {
      type: mimeType || blob.type,
      lastModified: Date.now(),
    });
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
