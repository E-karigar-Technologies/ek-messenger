import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonicModule,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { Router } from '@angular/router';
import { getDatabase, ref, get, set, remove } from 'firebase/database';

import { ChatListFilterService } from '../../../services/chat-list-filter.service';
import { FirebaseChatService } from '../../../services/firebase-chat.service';
import { EditFavoritePage } from '../edit-favorite/edit-favorite.page';
import { AuthService } from '../../../auth/auth.service';

// ── Mute duration options ─────────────────────────────────────────────────────
interface MuteDuration {
  label: string;
  value: '2min' | '8hours' | '1week' | 'always';
  ms: number | null; // null = always (no expiry)
}

const MUTE_DURATIONS: MuteDuration[] = [
  { label: '2 minutes (test)', value: '2min',   ms: 2 * 60 * 1000 },
  { label: '8 hours',          value: '8hours', ms: 8 * 60 * 60 * 1000 },
  { label: '1 week',           value: '1week',  ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Always',           value: 'always', ms: null },
];

// Firebase path: users/{userId}/mutedChatsUntil/{roomId}
// 0 = always muted | positive number = expiry timestamp ms | absent = not muted

@Component({
  selector: 'app-manage-favorite',
  templateUrl: './manage-favorite.page.html',
  styleUrls: ['./manage-favorite.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ManageFavoritePage implements OnInit, OnDestroy {
  // ── UI State ──────────────────────────────────────────────────────────────
  isMuted: boolean = false;
  muteUntilLabel: string | null = null;  // "Until today, 6:03 PM" / "Always"
  isEditMode: boolean = false;
  isLoading: boolean = true;
  favoriteList: any[] = [];

  private senderId: string = '';
  private expiryTimer: any = null;  // setTimeout handle for auto-unmute

  constructor(
    private chatListFilterService: ChatListFilterService,
    private firebaseChatService: FirebaseChatService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private authService: AuthService,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    this.senderId = this.authService.authData?.userId || '';
    await this.loadFavourites();
  }

  async ionViewWillEnter() {
    this.senderId = this.authService.authData?.userId || '';
    await this.loadFavourites();
    await this.syncMuteState();
  }

  ngOnDestroy() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
    }
  }

  // ── Load favourites ────────────────────────────────────────────────────────
  private async loadFavourites(): Promise<void> {
    this.isLoading = true;
    try {
      await this.chatListFilterService.loadFromFirebase();
      const favIds = this.chatListFilterService.currentFavouriteIds;
      const allConversations = this.firebaseChatService.currentConversations || [];
      this.favoriteList = allConversations
        .filter((c) => favIds.includes(c.roomId))
        .map((c) => ({
          roomId: c.roomId,
          name: c.title || 'Unknown',
          image: c.avatar || null,
          lastMessage: c.lastMessage || '',
          type: c.type || 'private',
        }));
    } catch (err) {
      console.error('[ManageFavorite] loadFavourites error:', err);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Sync mute state on page enter ─────────────────────────────────────────
  // Reads muteUntil from Firebase and sets UI accordingly.
  // If already expired → auto unmute silently.
  private async syncMuteState(): Promise<void> {
    try {
      if (!this.senderId || this.favoriteList.length === 0) {
        this.isMuted = false;
        this.muteUntilLabel = null;
        return;
      }

      // Use first favourite room as reference (all rooms muted together)
      const firstRoomId = this.favoriteList[0]?.roomId;
      if (!firstRoomId) return;

      const muteUntil = await this.getMuteUntilFromFirebase(firstRoomId);

      if (muteUntil === null) {
        // Not muted
        this.isMuted = false;
        this.muteUntilLabel = null;
      } else if (muteUntil === 0) {
        // Always muted
        this.isMuted = true;
        this.muteUntilLabel = 'Always';
      } else if (muteUntil <= Date.now()) {
        // Expired → silent auto-unmute
        await this.performUnmuteAll(false);
      } else {
        // Still active
        this.isMuted = true;
        this.muteUntilLabel = this.formatMuteUntil(muteUntil);
        this.scheduleExpiryTimer(muteUntil);
      }

      this.cdr.detectChanges();
    } catch (err) {
      console.error('[ManageFavorite] syncMuteState error:', err);
    }
  }

  // ── Toggle handler ─────────────────────────────────────────────────────────
  async onMuteToggleChange(event: any): Promise<void> {
    const newValue: boolean = event?.detail?.checked ?? false;

    if (newValue) {
      this.isMuted = false;
      this.cdr.detectChanges();
      await this.showMuteDurationAlert();
    } else {
      await this.confirmAndUnmute();
    }
  }

  // ── Duration picker alert (WhatsApp-style) ─────────────────────────────────
  private async showMuteDurationAlert(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Mute message notifications',
      message:
        'Other members will not see that you muted these chats, and you will still be notified if you are mentioned.\n\nMute all chats in Favorites',
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

  // ── Mute all favourite rooms ───────────────────────────────────────────────
  private async performMuteAll(durationValue: MuteDuration['value']): Promise<void> {
    try {
      const duration = MUTE_DURATIONS.find((d) => d.value === durationValue)!;
      // 0 means always, positive number means expiry timestamp
      const muteUntilTs = duration.ms ? Date.now() + duration.ms : 0;

      for (const chat of this.favoriteList) {
        // Use FirebaseChatService's existing muteChat method
        await this.firebaseChatService.muteChat(chat.roomId, this.senderId);
        // Store the expiry timestamp in Firebase
        await this.saveMuteUntilToFirebase(chat.roomId, muteUntilTs);
      }

      this.isMuted = true;
      this.muteUntilLabel =
        duration.ms === null ? 'Always' : this.formatMuteUntil(muteUntilTs);

      // Schedule auto-unmute timer if not "Always"
      if (duration.ms !== null) {
        this.scheduleExpiryTimer(muteUntilTs);
      }

      this.cdr.detectChanges();
      await this.showToast(`Muted ${this.favoriteList.length} chat(s)`);
    } catch (err) {
      console.error('[ManageFavorite] performMuteAll error:', err);
      this.isMuted = false;
      this.cdr.detectChanges();
      await this.showToast('Failed to mute chats', 'danger');
    }
  }

  // ── Confirm unmute ─────────────────────────────────────────────────────────
  private async confirmAndUnmute(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Unmute notifications',
      message: 'You will start receiving notifications for all chats in Favorites.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            // Revert toggle back to ON
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

  // ── Unmute all favourite rooms ─────────────────────────────────────────────
  // showToast = false when called silently on expiry
  private async performUnmuteAll(showToast: boolean = true): Promise<void> {
    try {
      for (const chat of this.favoriteList) {
        // Use FirebaseChatService's existing unmuteChat method
        await this.firebaseChatService.unmuteChat(chat.roomId, this.senderId);
        // Clear the expiry timestamp from Firebase
        await this.clearMuteUntilFromFirebase(chat.roomId);
      }

      this.isMuted = false;
      this.muteUntilLabel = null;

      // Clear pending expiry timer
      if (this.expiryTimer) {
        clearTimeout(this.expiryTimer);
        this.expiryTimer = null;
      }

      this.cdr.detectChanges();
      if (showToast) {
        await this.showToast(`Unmuted ${this.favoriteList.length} chat(s)`);
      }
    } catch (err) {
      console.error('[ManageFavorite] performUnmuteAll error:', err);
      if (showToast) {
        await this.showToast('Failed to unmute chats', 'danger');
      }
    }
  }

  // ── Auto-expiry timer ──────────────────────────────────────────────────────
  // When the mute duration expires, auto-unmute without showing a toast.
  private scheduleExpiryTimer(muteUntilTs: number): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
    }

    const msRemaining = muteUntilTs - Date.now();
    if (msRemaining <= 0) return;

    console.log(`[ManageFavorite] Mute expires in ${Math.round(msRemaining / 1000)}s`);

    this.expiryTimer = setTimeout(async () => {
      console.log('[ManageFavorite] Mute expired — auto unmuting');
      await this.performUnmuteAll(false);
    }, msRemaining);
  }

  // ── Firebase helpers: muteUntil per room ──────────────────────────────────
  // Path: users/{userId}/mutedChatsUntil/{roomId}
  // Value: 0 = always | timestamp ms = expiry | absent = not muted

  private async saveMuteUntilToFirebase(
    roomId: string,
    muteUntilTs: number
  ): Promise<void> {
    try {
      await this.firebaseChatService.applySecuredBatchUpdates({
        [`/users/${this.senderId}/mutedChatsUntil/${roomId}`]: muteUntilTs
      });
    } catch (err) {
      console.error('[ManageFavorite] saveMuteUntilToFirebase error:', err);
    }
  }

  private async getMuteUntilFromFirebase(roomId: string): Promise<number | null> {
    try {
      const db = getDatabase();
      const snap = await get(
        ref(db, `users/${this.senderId}/mutedChatsUntil/${roomId}`)
      );
      if (!snap.exists()) return null;
      return snap.val() as number;
    } catch (err) {
      console.error('[ManageFavorite] getMuteUntilFromFirebase error:', err);
      return null;
    }
  }

  private async clearMuteUntilFromFirebase(roomId: string): Promise<void> {
    try {
      await this.firebaseChatService.applySecuredBatchUpdates({
        [`/users/${this.senderId}/mutedChatsUntil/${roomId}`]: null
      });
    } catch (err) {
      console.error('[ManageFavorite] clearMuteUntilFromFirebase error:', err);
    }
  }

  // ── Format label (WhatsApp style) ─────────────────────────────────────────
  // "Until today, 6:03 PM" / "Until tomorrow, 10:03 AM" / "Until March 26, 10:03 AM" / "Always"
  formatMuteUntil(ts: number): string {
    if (!ts || ts === 0) return 'Always';

    const target = new Date(ts);
    const now = new Date();

    const timeStr = target.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

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

    const dateStr = target.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });
    return `Until ${dateStr}, ${timeStr}`;
  }

  // ── Existing methods (unchanged) ───────────────────────────────────────────
  async removeFromFavourites(chat: any, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.chatListFilterService.removeFromFavourites(chat.roomId);
      this.favoriteList = this.favoriteList.filter((c) => c.roomId !== chat.roomId);
      this.cdr.detectChanges();
    } catch (err) {
      console.error('[ManageFavorite] removeFromFavourites error:', err);
    }
  }

  async toggleEdit(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: EditFavoritePage,
      cssClass: 'favorite-modal',
      breakpoints: [0, 0.5, 0.9],
      initialBreakpoint: 0.9,
    });
    await modal.present();
    await modal.onDidDismiss();
    await this.loadFavourites();
  }

  addPeople(): void {
    this.router.navigate(['/add-selected-contact-in-list'], {
      queryParams: { listId: 'favourites', isNew: 'false' },
    });
  }

  goBack(): void {
    this.router.navigate(['/home-screen']);
  }

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