import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { Router } from '@angular/router';
import { ChatListFilterService } from '../../../services/chat-list-filter.service';
import { FirebaseChatService } from '../../../services/firebase-chat.service';

@Component({
  selector: 'app-edit-favorite',
  templateUrl: './edit-favorite.page.html',
  styleUrls: ['./edit-favorite.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class EditFavoritePage implements OnInit {

  favoriteList: any[] = [];
  isLoading:    boolean = true;
  isSaving:     boolean = false;

  constructor(
    private modalCtrl:             ModalController,
    private chatListFilterService: ChatListFilterService,
    private firebaseChatService:   FirebaseChatService,
    private router:                Router,
    private cdr:                   ChangeDetectorRef,
  ) {}

  async ngOnInit() {
    await this.loadFavourites();
  }

  // ── Load real favourite chats in saved order ──────────
  private async loadFavourites(): Promise<void> {
    this.isLoading = true;
    try {
      await this.chatListFilterService.loadFromFirebase();

      // currentFavouriteIds is already in saved order (from loadFromFirebase)
      const favIds           = this.chatListFilterService.currentFavouriteIds;
      const allConversations = this.firebaseChatService.currentConversations || [];

      // Build a map for fast lookup
      const convMap = new Map(allConversations.map(c => [c.roomId, c]));

      // Preserve saved order
      this.favoriteList = favIds
        .map(id => {
          const c = convMap.get(id);
          if (!c) return null;
          return {
            roomId:      c.roomId,
            name:        c.title || 'Unknown',
            image:       c.avatar || null,
            lastMessage: c.lastMessage || '',
            type:        c.type || 'private',
          };
        })
        .filter(Boolean);

    } catch (err) {
      console.error('[EditFavorite] loadFavourites error:', err);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Remove from favourites (Firebase + local) ─────────
  async remove(chat: any, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.chatListFilterService.removeFromFavourites(chat.roomId);
      this.favoriteList = this.favoriteList.filter(c => c.roomId !== chat.roomId);
      // Save updated order after removal
      // await this.saveOrder();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('[EditFavorite] remove error:', err);
    }
  }

  // ── Reorder — save to Firebase immediately ────────────
  async doReorder(event: any): Promise<void> {
    // 1. Update local array
    const itemMove = this.favoriteList.splice(event.detail.from, 1)[0];
    this.favoriteList.splice(event.detail.to, 0, itemMove);
    event.detail.complete();

    // 2. Persist new order to Firebase
    // await this.saveOrder();
    this.cdr.detectChanges();
  }

  // ── Save current order to Firebase ───────────────────
  // private async saveOrder(): Promise<void> {
  //   try {
  //     const orderedIds = this.favoriteList.map(c => c.roomId);
  //     await this.chatListFilterService.saveFavouritesOrder(orderedIds);
  //   } catch (err) {
  //     console.error('[EditFavorite] saveOrder error:', err);
  //   }
  // }

  // ── Add people — close modal then navigate ────────────
  async addPeople(): Promise<void> {
    // Dismiss modal first so navigation works cleanly
    await this.modalCtrl.dismiss();

    this.router.navigate(['/add-selected-contact-in-list'], {
      queryParams: {
        listId: 'favourites',
        isNew:  'false',
      },
    });
  }

  // ── Close without explicit save (order already saved on reorder) ──
  close(): void {
    this.modalCtrl.dismiss();
  }

  // ── Save button — dismiss with updated list ───────────
  save(): void {
    this.modalCtrl.dismiss(this.favoriteList);
  }
}