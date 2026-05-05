import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { getDatabase, ref, get, set, remove } from 'firebase/database';

import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';

// ── Mute duration options (manage-favorite jaisi exactly) ────────────────────
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
  selector: 'app-chat-notifications',
  templateUrl: './chat-notifications.page.html',
  styleUrls: ['./chat-notifications.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
})
export class ChatNotificationsPage implements OnInit, OnDestroy {
  // ── State ─────────────────────────────────────────────────────────────────
  isMuted: boolean = false;
  muteUntilLabel: string | null = null; // "Until today, 6:03 PM" / "Always"
  notifyFor = 'All';
  chatType: 'private' | 'group' = 'private';

  private roomId: string = '';
  private senderId: string = '';
  private expiryTimer: any = null;

  constructor(
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private firebaseChatService: FirebaseChatService,
    private authService: AuthService
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async ngOnInit() {
    this.senderId = String(this.authService.authData?.userId || '');

    // roomId — route param se ya currentChat se
    const params = this.route.snapshot.queryParams;
    this.roomId =
      params['roomId'] ||
      this.firebaseChatService.currentChat?.roomId ||
      '';
    this.chatType = params['chatType'] === 'group' ? 'group' : 'private';

    await this.syncMuteState();
  }

  async ionViewWillEnter() {
    this.senderId = String(this.authService.authData?.userId || '');

    const params = this.route.snapshot.queryParams;
    this.roomId =
      params['roomId'] ||
      this.firebaseChatService.currentChat?.roomId ||
      '';
    this.chatType = params['chatType'] === 'group' ? 'group' : 'private';

    await this.syncMuteState();
  }

  ngOnDestroy() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
    }
  }

  // ── Sync mute state on page enter ─────────────────────────────────────────
  private async syncMuteState(): Promise<void> {
    try {
      if (!this.senderId || !this.roomId) {
        this.isMuted = false;
        this.muteUntilLabel = null;
        return;
      }

      const muteUntil = await this.getMuteUntilFromFirebase(this.roomId);

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
        await this.performUnmute(false);
      } else {
        // Still active
        this.isMuted = true;
        this.muteUntilLabel = this.formatMuteUntil(muteUntil);
        this.scheduleExpiryTimer(muteUntil);
      }

      this.cdr.detectChanges();
    } catch (err) {
      console.error('[ChatNotifications] syncMuteState error:', err);
    }
  }

  // ── Toggle handler ─────────────────────────────────────────────────────────
  async onToggleMute(event: any): Promise<void> {
    const newValue: boolean = event?.detail?.checked ?? false;

    if (newValue) {
      // Toggle ON → show duration picker
      this.isMuted = false;
      this.cdr.detectChanges();
      await this.showMuteDurationAlert();
    } else {
      // Toggle OFF → confirm unmute
      await this.confirmAndUnmute();
    }
  }

  // ── Duration picker alert (manage-favorite jaisi exactly) ─────────────────
  private async showMuteDurationAlert(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Mute message notifications',
      message:
        'Other members will not see that you muted this chat, and you will still be notified if you are mentioned.',
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
            await this.performMute(selectedValue as MuteDuration['value']);
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Mute this room ────────────────────────────────────────────────────────
  private async performMute(durationValue: MuteDuration['value']): Promise<void> {
    try {
      const duration = MUTE_DURATIONS.find((d) => d.value === durationValue)!;
      const muteUntilTs = duration.ms ? Date.now() + duration.ms : 0;

      // FirebaseChatService ka existing muteChat use karo
      await this.firebaseChatService.muteChat(this.roomId, this.senderId);

      // Expiry timestamp Firebase mein save karo
      await this.saveMuteUntilToFirebase(this.roomId, muteUntilTs);

      this.isMuted = true;
      this.muteUntilLabel =
        duration.ms === null ? 'Always' : this.formatMuteUntil(muteUntilTs);

      // Agar "Always" nahi toh auto-unmute timer schedule karo
      if (duration.ms !== null) {
        this.scheduleExpiryTimer(muteUntilTs);
      }

      this.cdr.detectChanges();
      await this.showToast('Chat muted');
    } catch (err) {
      console.error('[ChatNotifications] performMute error:', err);
      this.isMuted = false;
      this.cdr.detectChanges();
      await this.showToast('Failed to mute chat', 'danger');
    }
  }

  // ── Confirm unmute alert ───────────────────────────────────────────────────
  private async confirmAndUnmute(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Unmute notifications',
      message: 'You will start receiving notifications for this chat.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            // Toggle wapas ON karo
            this.isMuted = true;
            this.cdr.detectChanges();
          },
        },
        {
          text: 'Unmute',
          handler: async () => {
            await this.performUnmute(true);
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Unmute this room ──────────────────────────────────────────────────────
  // showToast = false when called silently on expiry
  private async performUnmute(showToast: boolean = true): Promise<void> {
    try {
      // FirebaseChatService ka existing unmuteChat use karo
      await this.firebaseChatService.unmuteChat(this.roomId, this.senderId);

      // Firebase se expiry timestamp clear karo
      await this.clearMuteUntilFromFirebase(this.roomId);

      this.isMuted = false;
      this.muteUntilLabel = null;

      // Pending timer clear karo
      if (this.expiryTimer) {
        clearTimeout(this.expiryTimer);
        this.expiryTimer = null;
      }

      this.cdr.detectChanges();
      if (showToast) {
        await this.showToast('Chat unmuted');
      }
    } catch (err) {
      console.error('[ChatNotifications] performUnmute error:', err);
      if (showToast) {
        await this.showToast('Failed to unmute chat', 'danger');
      }
    }
  }

  // ── Auto-expiry timer ──────────────────────────────────────────────────────
  private scheduleExpiryTimer(muteUntilTs: number): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
    }

    const msRemaining = muteUntilTs - Date.now();
    if (msRemaining <= 0) return;

    console.log(
      `[ChatNotifications] Mute expires in ${Math.round(msRemaining / 1000)}s`
    );

    this.expiryTimer = setTimeout(async () => {
      console.log('[ChatNotifications] Mute expired — auto unmuting');
      await this.performUnmute(false);
    }, msRemaining);
  }

  // ── Firebase helpers ──────────────────────────────────────────────────────
  // Path: users/{userId}/mutedChatsUntil/{roomId}

  private async saveMuteUntilToFirebase(
    roomId: string,
    muteUntilTs: number
  ): Promise<void> {
    try {
      await this.firebaseChatService.applySecuredBatchUpdates({
        [`users/${this.senderId}/mutedChatsUntil/${roomId}`]: muteUntilTs
      });
    } catch (err) {
      console.error('[ChatNotifications] saveMuteUntilToFirebase error:', err);
    }
  }

  private async getMuteUntilFromFirebase(
    roomId: string
  ): Promise<number | null> {
    try {
      const db = getDatabase();
      const snap = await get(
        ref(db, `users/${this.senderId}/mutedChatsUntil/${roomId}`)
      );
      if (!snap.exists()) return null;
      return snap.val() as number;
    } catch (err) {
      console.error('[ChatNotifications] getMuteUntilFromFirebase error:', err);
      return null;
    }
  }

  private async clearMuteUntilFromFirebase(roomId: string): Promise<void> {
    try {
      await this.firebaseChatService.applySecuredBatchUpdates({
        [`users/${this.senderId}/mutedChatsUntil/${roomId}`]: null
      });
    } catch (err) {
      console.error('[ChatNotifications] clearMuteUntilFromFirebase error:', err);
    }
  }

  // ── Format label (manage-favorite jaisi exactly) ──────────────────────────
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

  // ── Toast helper ──────────────────────────────────────────────────────────
  private async showToast(
    message: string,
    color: string = 'success'
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}