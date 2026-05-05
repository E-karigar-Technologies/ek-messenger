import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { FirebaseChatService } from '../../services/firebase-chat.service';

@Component({
  selector: 'app-default-message-timer',
  templateUrl: './default-message-timer.page.html',
  styleUrls: ['./default-message-timer.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule]
})
export class DefaultMessageTimerPage implements OnInit {
  selectedTimer: string = 'off';

  constructor(
    private firebaseChatService: FirebaseChatService,
    private toastCtrl: ToastController,
    private navCtrl: NavController,
  ) {}

  async ngOnInit() {
    // ✅ Current chat ka existing setting load karo
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
    if (!roomId) return;

    try {
      await this.firebaseChatService.setDisappearingMessages(
        roomId,
        this.selectedTimer as '2' | '24' | '7' | '90' | 'off'
      );

      const label: Record<string, string> = {
        '2': '2 minutes', '24': '24 hours', '7': '7 days', '90': '90 days',
      };

      const msg = this.selectedTimer === 'off'
        ? 'Disappearing messages turned off'
        : `Default timer set to ${label[this.selectedTimer]}`;

      const toast = await this.toastCtrl.create({
        message: msg,
        duration: 2000,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    } catch (err) {
      console.error('setDisappearingMessages error:', err);
    }
  }
  goBack() {
  this.navCtrl.back();
}
}