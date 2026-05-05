import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { Channel, ChannelService } from '../../services/channel';

export type ReactionMode = 'any' | 'default' | 'none';

@Component({
  selector: 'app-channel-settings-modal',
  templateUrl: './channel-settings-modal.component.html',
  styleUrls: ['./channel-settings-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ChannelSettingsModalComponent implements OnInit {
  @Input() channel!: Channel;

  reactionMode: ReactionMode = 'any';
  isSaving = false;

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private channelService: ChannelService
  ) {}

  ngOnInit() {
    // Read existing value if stored on the channel object
    const existing = (this.channel as any).reaction_mode as ReactionMode | undefined;
    if (existing === 'default' || existing === 'none') {
      this.reactionMode = existing;
    } else {
      this.reactionMode = 'any';
    }
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  async save() {
    // TODO: implement save — commented out for now
    // if (this.isSaving) return;
    // this.isSaving = true;

    // try {
    //   const form = new FormData();
    //   form.append('reaction_mode', this.reactionMode);

    //   await firstValueFrom(
    //     this.channelService.updateChannel(this.channel.channel_id, form)
    //   );

    //   // Persist locally on the channel object so the feed reflects it immediately
    //   (this.channel as any).reaction_mode = this.reactionMode;

    //   await this.presentToast('Settings saved');
    //   this.modalCtrl.dismiss({ updated: true, reactionMode: this.reactionMode });
    // } catch {
    //   await this.presentToast('Failed to save settings');
    // } finally {
    //   this.isSaving = false;
    // }
  }

  private async presentToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom',
    });
    await toast.present();
  }
}
