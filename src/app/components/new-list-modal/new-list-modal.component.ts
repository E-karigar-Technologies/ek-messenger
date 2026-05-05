// src/app/components/new-list-modal/new-list-modal.component.ts

import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { Router } from '@angular/router';
import { ChatListFilterService } from '../../services/chat-list-filter.service';
import { EmojiPickerModalComponent } from '../emoji-picker-modal/emoji-picker-modal.component';

@Component({
  selector: 'app-new-list-modal',
  templateUrl: './new-list-modal.component.html',
  styleUrls: ['./new-list-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class NewListModalComponent {

  listName  = '';
  nameError = '';

  constructor(
    private modalCtrl: ModalController,
    private router:    Router,
    private filterSvc: ChatListFilterService,
  ) {}

  onInput(): void {
    this.nameError = '';
  }

  // ── Emoji picker ──────────────────────────────────────
  async openEmojiPicker(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: EmojiPickerModalComponent,
      breakpoints: [0, 0.5, 0.9],
      initialBreakpoint: 0.9,
      backdropDismiss: true,
      cssClass: 'emoji-picker-sheet',
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data?.selected && data?.emoji) {
      this.listName += data.emoji;
      this.nameError = '';
    }
  }

  // ── Navigate to contact selection page ────────────────
  async goToAddContacts(): Promise<void> {
    const name = this.listName.trim();

    if (!name) {
      this.nameError = 'List name cannot be empty';
      return;
    }
    if (this.filterSvc.listNameExists(name)) {
      this.nameError = 'A list with this name already exists';
      return;
    }

    // Close modal first, then navigate
    await this.modalCtrl.dismiss({ created: false });

    this.router.navigate(['/add-selected-contact-in-list'], {
      queryParams: {
        listName: name,
        isNew:    'true',
      },
    });
  }

  close(): void {
    this.modalCtrl.dismiss({ created: false });
  }
}