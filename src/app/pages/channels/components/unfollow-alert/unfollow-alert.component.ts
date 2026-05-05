
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-unfollow-alert',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterModule],

})
export class UnfollowAlertComponent {
  @Input() channelName = 'this channel';
  @Output() confirmed = new EventEmitter<boolean>();

  constructor(private alertCtrl: AlertController) { }

  async present() {
    const alert = await this.alertCtrl.create({
      header: 'Unfollow channel',
      message: `Are you sure you want to unfollow "${this.channelName}"? Stars will be removed from updates in this channel.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Unfollow',
          role: 'destructive',
          handler: () => this.confirmed.emit(true),
        },
      ],
    });
    await alert.present();
  }
}
