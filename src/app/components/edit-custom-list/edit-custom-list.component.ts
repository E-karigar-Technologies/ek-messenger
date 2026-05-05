import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  OnInit,
  ChangeDetectorRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';

import { ChatListFilterService } from '../../services/chat-list-filter.service';
import { FirebaseChatService } from '../../services/firebase-chat.service';
import { EmojiPickerModalComponent } from '../emoji-picker-modal/emoji-picker-modal.component';

@Component({
  selector: 'app-edit-custom-list',
  templateUrl: './edit-custom-list.component.html',
  styleUrls: ['./edit-custom-list.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class EditCustomListComponent implements OnInit {
  // ── Inputs ────────────────────────────────────────────────────────────────
  @Input() listId!: string;
  @Input() listName!: string;

  // ── State ─────────────────────────────────────────────────────────────────
  editedName: string = '';
  selectedEmoji: string = '';
  chatList: any[] = [];
  isLoading: boolean = true;

  private removedRoomIds: Set<string> = new Set();

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private chatListFilterService: ChatListFilterService,
    private firebaseChatService: FirebaseChatService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}

  async ngOnInit() {
    this.editedName = this.listName;
    await this.loadChats();
  }

  // ── Load chats ────────────────────────────────────────────────────────────
  private async loadChats(): Promise<void> {
    this.isLoading = true;
    try {
      await this.chatListFilterService.loadFromFirebase();
      const list = this.chatListFilterService.currentLists.find(
        (l) => l.listId === this.listId
      );
      const roomIds = list?.roomIds || [];
      const allConversations = this.firebaseChatService.currentConversations || [];

      this.chatList = allConversations
        .filter((c) => roomIds.includes(c.roomId))
        .map((c) => ({
          roomId: c.roomId,
          name: c.title || 'Unknown',
          image: c.avatar || null,
          type: c.type || 'private',
          markedRemoved: false,
        }));
    } catch (err) {
      console.error('[EditCustomList] loadChats error:', err);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  get visibleChats(): any[] {
    return this.chatList.filter((c) => !c.markedRemoved);
  }

  markRemove(chat: any): void {
    chat.markedRemoved = true;
    this.removedRoomIds.add(chat.roomId);
    this.cdr.detectChanges();
  }

  // ── Open Emoji Picker (nested modal) ─────────────────────────────────────
  async openEmojiPicker(): Promise<void> {
    const emojiModal = await this.modalCtrl.create({
      component: EmojiPickerModalComponent,
      breakpoints: [0, 0.55, 0.9],
      initialBreakpoint: 0.55,
      backdropDismiss: true,
      cssClass: 'emoji-picker-sheet',
    });

    await emojiModal.present();

    const { data } = await emojiModal.onDidDismiss();

    if (data?.selected && data?.emoji) {
      this.selectedEmoji = data.emoji;
      // Strip any trailing emoji from current name then append new one
      const baseName = this.editedName
        .replace(/[\u{1F300}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')
        .trim();
      this.editedName = baseName ? `${baseName} ${data.emoji}` : data.emoji;
      this.cdr.detectChanges();
    }
  }

  // ── Add People ────────────────────────────────────────────────────────────
  addPeople(): void {
    this.modalCtrl.dismiss({ action: 'addPeople' });
    setTimeout(() => {
      this.router.navigate(['/add-selected-contact-in-list'], {
        queryParams: { listId: this.listId, isNew: 'false' },
      });
    }, 200);
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  cancel(): void {
    this.modalCtrl.dismiss({ action: 'cancelled' });
  }

  // ── Confirm ✓ ─────────────────────────────────────────────────────────────
  async confirm(): Promise<void> {
    const newName = this.editedName.trim();
    let nameChanged = false;
    let membersChanged = false;

    try {
      if (newName && newName !== this.listName) {
        const duplicate =
          this.chatListFilterService.listNameExists(newName) &&
          newName !== this.listName;
        if (duplicate) {
          await this.showToast('A list with this name already exists', 'warning');
          return;
        }
        await this.chatListFilterService.renameList(this.listId, newName);
        nameChanged = true;
      }

      if (this.removedRoomIds.size > 0) {
        for (const roomId of this.removedRoomIds) {
          await this.chatListFilterService.removeRoomFromList(this.listId, roomId);
        }
        membersChanged = true;
      }

      await this.modalCtrl.dismiss({
        action: 'saved',
        newName: nameChanged ? newName : null,
        removedCount: this.removedRoomIds.size,
      });

      if (nameChanged || membersChanged) {
        const msg =
          nameChanged && membersChanged
            ? `Renamed to "${newName}" and updated members`
            : nameChanged
              ? `Renamed to "${newName}"`
              : `${this.removedRoomIds.size} member(s) removed`;
        await this.showToast(msg);
      }
    } catch (err) {
      console.error('[EditCustomList] confirm error:', err);
      await this.showToast('Failed to save changes', 'danger');
    }
  }

  private async showToast(msg: string, color = 'success'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}