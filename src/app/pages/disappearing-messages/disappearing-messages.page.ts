import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController, LoadingController, NavController } from '@ionic/angular';
import { FirebaseChatService } from '../../services/firebase-chat.service';

@Component({
  selector: 'app-disappearing-messages',
  templateUrl: './disappearing-messages.page.html',
  styleUrls: ['./disappearing-messages.page.scss'],
  imports: [IonicModule, FormsModule, CommonModule],
  standalone: true,
})
export class DisappearingMessagesPage implements OnInit {
  selectedTimer: string = 'off';

  constructor(
    private router: Router,
    private firebaseChatService: FirebaseChatService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private navCtrl: NavController,
  ) {}

  async ngOnInit() {
    const roomId = this.firebaseChatService.currentChat?.roomId;
    if (!roomId) return;

    try {
      const setting = await this.firebaseChatService.getDisappearingSetting(roomId);
      this.selectedTimer = setting?.duration || 'off';
    } catch {
      this.selectedTimer = 'off';
    }
  }

  async onTimerChange() {
    const roomId = this.firebaseChatService.currentChat?.roomId;
    if (!roomId) {
      await this.showToast('No active chat found', 'danger');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Updating...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      await this.firebaseChatService.setDisappearingMessages(
        roomId,
        this.selectedTimer as '2' | '24' | '7' | '90' | 'off'
      );

      const label: Record<string, string> = {
        '2': '2 min', '24': '24 hours', '7': '7 days', '90': '90 days',
      };

      const msg = this.selectedTimer === 'off'
        ? 'Disappearing messages turned off'
        : `Messages will disappear after ${label[this.selectedTimer]}`;

      await this.showToast(msg, 'success');
    } catch (err) {
      console.error('setDisappearingMessages error:', err);
      await this.showToast('Failed to update. Try again.', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  // openDefaultTimer() {
  //   this.router.navigate(['/default-message-timer']);
  // }
  openDefaultTimer() {
  this.navCtrl.navigateForward('/default-message-timer');
}
}