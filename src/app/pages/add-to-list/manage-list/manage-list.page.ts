import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonicModule,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatListFilterService } from '../../../services/chat-list-filter.service';
import { FirebaseChatService } from '../../../services/firebase-chat.service';
import { AuthService } from '../../../auth/auth.service';
import { getDatabase, ref, get, set, remove } from 'firebase/database';
import { EditCustomListComponent } from 'src/app/components/edit-custom-list/edit-custom-list.component';

// ── Mute duration options ─────────────────────────────────────────────────────
interface MuteDuration {
  label: string;
  value: '2min' | '8hours' | '1week' | 'always';
  ms: number | null;
}

const MUTE_DURATIONS: MuteDuration[] = [
  { label: '2 minutes (test)', value: '2min',   ms: 2 * 60 * 1000 },
  { label: '8 hours',          value: '8hours', ms: 8 * 60 * 60 * 1000 },
  { label: '1 week',           value: '1week',  ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Always',           value: 'always', ms: null },
];

@Component({
  selector: 'app-manage-list',
  templateUrl: './manage-list.page.html',
  styleUrls: ['./manage-list.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ManageListPage implements OnInit, OnDestroy {
  // ── Data ─────────────────────────────────────────────────────────────────────
  listId: string = '';
  listName: string = '';
  chatList: any[] = [];

  // ── UI State ──────────────────────────────────────────────────────────────────
  isLoading: boolean = true;
  isEditMode: boolean = false;

  // ── Mute State ────────────────────────────────────────────────────────────────
  isMuted: boolean = false;
  muteUntilLabel: string | null = null;

  private senderId: string = '';
  private expiryTimer: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chatListFilterService: ChatListFilterService,
    private firebaseChatService: FirebaseChatService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private modalCtrl: ModalController,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  async ngOnInit() {
    this.senderId = this.authService.authData?.userId || '';
    this.listId = this.route.snapshot.queryParams['listId'] || '';
    await this.loadList();
  }

  async ionViewWillEnter() {
    this.senderId = this.authService.authData?.userId || '';
    this.listId = this.route.snapshot.queryParams['listId'] || '';
    await this.loadList();
    await this.syncMuteState();
  }

  ngOnDestroy() {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
  }

  // ── Load List ─────────────────────────────────────────────────────────────────
  private async loadList(): Promise<void> {
    this.isLoading = true;
    try {
      await this.chatListFilterService.loadFromFirebase();

      const list = this.chatListFilterService.currentLists.find(
        (l) => l.listId === this.listId
      );

      this.listName = list?.name || 'List';

      const roomIds = list?.roomIds || [];
      const allConversations = this.firebaseChatService.currentConversations || [];

      this.chatList = allConversations
        .filter((c) => roomIds.includes(c.roomId))
        .map((c) => ({
          roomId: c.roomId,
          name: c.title || 'Unknown',
          image: c.avatar || null,
          lastMessage: c.lastMessage || '',
          type: c.type || 'private',
        }));
    } catch (err) {
      console.error('[ManageList] loadList error:', err);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Mute State Sync ───────────────────────────────────────────────────────────
  private async syncMuteState(): Promise<void> {
    try {
      if (!this.senderId || this.chatList.length === 0) {
        this.isMuted = false;
        this.muteUntilLabel = null;
        return;
      }

      const firstRoomId = this.chatList[0]?.roomId;
      if (!firstRoomId) return;

      const muteUntil = await this.getMuteUntil(firstRoomId);

      if (muteUntil === null) {
        this.isMuted = false;
        this.muteUntilLabel = null;
      } else if (muteUntil === 0) {
        this.isMuted = true;
        this.muteUntilLabel = 'Always';
      } else if (muteUntil <= Date.now()) {
        await this.performUnmuteAll(false);
      } else {
        this.isMuted = true;
        this.muteUntilLabel = this.formatMuteUntil(muteUntil);
        this.scheduleExpiryTimer(muteUntil);
      }

      this.cdr.detectChanges();
    } catch (err) {
      console.error('[ManageList] syncMuteState error:', err);
    }
  }

  // ── Toggle Handler ────────────────────────────────────────────────────────────
  async onMuteToggleChange(event: any): Promise<void> {
    const newValue: boolean = event?.detail?.checked ?? event;
    if (newValue) {
      this.isMuted = false;
      this.cdr.detectChanges();
      await this.showMuteDurationAlert();
    } else {
      await this.confirmAndUnmute();
    }
  }

  // ── Duration Alert ────────────────────────────────────────────────────────────
  private async showMuteDurationAlert(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Mute message notifications',
      message: 'Other members will not see that you muted these chats.',
      inputs: MUTE_DURATIONS.map((d, i) => ({
        name: 'duration',
        type: 'radio' as const,
        label: d.label,
        value: d.value,
        checked: i === 0,
      })),
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            this.isMuted = false;
            this.cdr.detectChanges();
          },
        },
        {
          text: 'OK',
          handler: async (selectedValue: string) => {
            if (!selectedValue) {
              this.isMuted = false;
              this.cdr.detectChanges();
              return;
            }
            await this.performMuteAll(selectedValue as MuteDuration['value']);
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Perform Mute All ──────────────────────────────────────────────────────────
  private async performMuteAll(durationValue: MuteDuration['value']): Promise<void> {
    try {
      const duration = MUTE_DURATIONS.find((d) => d.value === durationValue)!;
      const muteUntilTs = duration.ms ? Date.now() + duration.ms : 0;

      for (const chat of this.chatList) {
        await this.firebaseChatService.muteChat(chat.roomId, this.senderId);
        await this.saveMuteUntil(chat.roomId, muteUntilTs);
      }

      this.isMuted = true;
      this.muteUntilLabel = duration.ms === null ? 'Always' : this.formatMuteUntil(muteUntilTs);

      if (duration.ms !== null) {
        this.scheduleExpiryTimer(muteUntilTs);
      }

      this.cdr.detectChanges();
      await this.showToast(`Muted ${this.chatList.length} chat(s)`);
    } catch (err) {
      console.error('[ManageList] performMuteAll error:', err);
      this.isMuted = false;
      this.cdr.detectChanges();
      await this.showToast('Failed to mute chats', 'danger');
    }
  }

  // ── Confirm Unmute ────────────────────────────────────────────────────────────
  private async confirmAndUnmute(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Unmute notifications',
      message: `You will start receiving notifications for all chats in "${this.listName}".`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            this.isMuted = true;
            this.cdr.detectChanges();
          },
        },
        {
          text: 'Unmute',
          handler: async () => {
            await this.performUnmuteAll(true);
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Perform Unmute All ────────────────────────────────────────────────────────
  private async performUnmuteAll(showToast: boolean = true): Promise<void> {
    try {
      for (const chat of this.chatList) {
        await this.firebaseChatService.unmuteChat(chat.roomId, this.senderId);
        await this.clearMuteUntil(chat.roomId);
      }

      this.isMuted = false;
      this.muteUntilLabel = null;

      if (this.expiryTimer) {
        clearTimeout(this.expiryTimer);
        this.expiryTimer = null;
      }

      this.cdr.detectChanges();
      if (showToast) await this.showToast(`Unmuted ${this.chatList.length} chat(s)`);
    } catch (err) {
      console.error('[ManageList] performUnmuteAll error:', err);
      await this.showToast('Failed to unmute chats', 'danger');
    }
  }

  // ── Expiry Timer ──────────────────────────────────────────────────────────────
  private scheduleExpiryTimer(muteUntilTs: number): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    const ms = muteUntilTs - Date.now();
    if (ms <= 0) return;
    this.expiryTimer = setTimeout(async () => {
      await this.performUnmuteAll(false);
    }, ms);
  }

  // ── Format "Until today, 6:03 PM" ────────────────────────────────────────────
  formatMuteUntil(ts: number): string {
    if (!ts || ts === 0) return 'Always';
    const target = new Date(ts);
    const now = new Date();
    const timeStr = target.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const isToday =
      target.getDate() === now.getDate() &&
      target.getMonth() === now.getMonth() &&
      target.getFullYear() === now.getFullYear();

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow =
      target.getDate() === tomorrow.getDate() &&
      target.getMonth() === tomorrow.getMonth() &&
      target.getFullYear() === tomorrow.getFullYear();

    if (isToday) return `Until today, ${timeStr}`;
    if (isTomorrow) return `Until tomorrow, ${timeStr}`;

    const dateStr = target.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    return `Until ${dateStr}, ${timeStr}`;
  }

  // ── Firebase Helpers ──────────────────────────────────────────────────────────
  private async saveMuteUntil(roomId: string, ts: number): Promise<void> {
    await this.firebaseChatService.applySecuredBatchUpdates({
      [`users/${this.senderId}/mutedChatsUntil/${roomId}`]: ts
    });
  }

  private async getMuteUntil(roomId: string): Promise<number | null> {
    const db = getDatabase();
    const snap = await get(ref(db, `users/${this.senderId}/mutedChatsUntil/${roomId}`));
    return snap.exists() ? (snap.val() as number) : null;
  }

  private async clearMuteUntil(roomId: string): Promise<void> {
    await this.firebaseChatService.applySecuredBatchUpdates({
      [`users/${this.senderId}/mutedChatsUntil/${roomId}`]: null
    });
  }

  // ── Remove Chat from List ─────────────────────────────────────────────────────
  async removeFromList(chat: any, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.chatListFilterService.removeRoomFromList(this.listId, chat.roomId);
      this.chatList = this.chatList.filter((c) => c.roomId !== chat.roomId);
      this.cdr.detectChanges();
      await this.showToast(`${chat.name} removed from list`);
    } catch (err) {
      console.error('[ManageList] removeFromList error:', err);
      await this.showToast('Failed to remove', 'danger');
    }
  }

  // ── Add People ────────────────────────────────────────────────────────────────
  addPeople(): void {
    this.router.navigate(['/add-selected-contact-in-list'], {
      queryParams: {
        listId: this.listId,
        isNew: 'false',
      },
    });
  }

  // ── Edit Mode (rename list) ───────────────────────────────────────────────────
  async renameList(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Rename List',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: this.listName,
          placeholder: 'List name',
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            const newName = data.name?.trim();
            if (!newName) return;
            if (this.chatListFilterService.listNameExists(newName) && newName !== this.listName) {
              await this.showToast('A list with this name already exists', 'warning');
              return;
            }
            try {
              await this.chatListFilterService.renameList(this.listId, newName);
              this.listName = newName;
              this.cdr.detectChanges();
              await this.showToast('List renamed');
            } catch (err) {
              await this.showToast('Failed to rename', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Delete List ───────────────────────────────────────────────────────────────
  async deleteList(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete List',
      message: `Delete "${this.listName}"? Chats will not be deleted.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          cssClass: 'danger-button',
          handler: async () => {
            try {
              await this.chatListFilterService.deleteList(this.listId);
              this.router.navigate(['/home-screen'], { queryParams: { filter: 'all' } });
            } catch (err) {
              await this.showToast('Failed to delete list', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async openEditModal(): Promise<void> {
  const modal = await this.modalCtrl.create({
    component: EditCustomListComponent,
    componentProps: {
      listId: this.listId,
      listName: this.listName,
    },
    breakpoints: [0, 0.75, 1],
    initialBreakpoint: 0.75,
    backdropDismiss: true,
    cssClass: 'edit-list-sheet-modal',
  });

  await modal.present();

  const { data } = await modal.onDidDismiss();
  if (data?.action === 'saved') {
    // Refresh list
    if (data.newName) this.listName = data.newName;
    await this.loadList();  // private method → make it accessible
    this.cdr.detectChanges();
  } else if (data?.action === 'addPeople') {
    // Already navigated from component
  }
}

  // ── Toggle Edit Mode ──────────────────────────────────────────────────────────
  toggleEdit(): void {
    this.isEditMode = !this.isEditMode;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────────
  private async showToast(message: string, color: string = 'success'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}