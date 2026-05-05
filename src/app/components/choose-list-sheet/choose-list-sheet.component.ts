import { CommonModule } from '@angular/common';
import { Component, OnInit, Input } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { ChatListFilterService, ChatCustomList } from '../../services/chat-list-filter.service';
import { FormsModule } from '@angular/forms';

export interface ListSheetItem {
  id: string;           // 'favourites' | listId
  label: string;
  icon: string;         // ion-icon name
  isSelected: boolean;
  isFavourite: boolean;
}

@Component({
  selector: 'app-choose-list-sheet',
  templateUrl: './choose-list-sheet.component.html',
  styleUrls: ['./choose-list-sheet.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
})
export class ChooseListSheetComponent implements OnInit {

  @Input() roomId!: string;
  // ✅ NEW: multiple roomIds support (multi-select se aate hain)
  @Input() roomIds: string[] = [];

  items: ListSheetItem[] = [];
  showNewListInput = false;
  newListName = '';
  newListNameError = '';
  isSaving = false;

  constructor(
    private modalCtrl: ModalController,
    private chatListFilterService: ChatListFilterService,
  ) {}

  ngOnInit(): void {
    // ✅ Normalize: single roomId ko roomIds array mein merge karo
    if (this.roomId && !this.roomIds.includes(this.roomId)) {
      this.roomIds = [this.roomId, ...this.roomIds];
    }
    this.roomIds = this.roomIds.filter(id => !!id);
    this.buildList();
  }

  // ── Build list items with pre-selected state ──────────
  // ✅ isSelected = ALL roomIds us list/fav mein hain
  private buildList(): void {
    const favIds = this.chatListFilterService.currentFavouriteIds;
    const lists  = this.chatListFilterService.currentLists;

    const favItem: ListSheetItem = {
      id:          'favourites',
      label:       'Favourites',
      icon:        'heart-outline',
      isSelected:  this.roomIds.length > 0 &&
                   this.roomIds.every(id => favIds.includes(id)),
      isFavourite: true,
    };

    const listItems: ListSheetItem[] = lists.map(l => ({
      id:          l.listId,
      label:       l.name,
      icon:        'people-outline',
      isSelected:  this.roomIds.length > 0 &&
                   this.roomIds.every(id => l.roomIds.includes(id)),
      isFavourite: false,
    }));

    this.items = [favItem, ...listItems];
  }

  // ── Toggle selection (local only — saved on Done) ─────
  toggleItem(item: ListSheetItem): void {
    item.isSelected = !item.isSelected;
  }

  // ── Show / hide new list input ────────────────────────
  openNewListInput(): void {
    this.showNewListInput = true;
    this.newListName      = '';
    this.newListNameError = '';
  }

  cancelNewList(): void {
    this.showNewListInput = false;
    this.newListName      = '';
    this.newListNameError = '';
  }

  // ── Create new list + auto-select it ─────────────────
  async confirmNewList(): Promise<void> {
    const name = this.newListName.trim();

    if (!name) {
      this.newListNameError = 'List name cannot be empty';
      return;
    }
    if (this.chatListFilterService.listNameExists(name)) {
      this.newListNameError = 'A list with this name already exists';
      return;
    }

    try {
      const newList = await this.chatListFilterService.createList(name);

      this.items.push({
        id:          newList.listId,
        label:       newList.name,
        icon:        'people-outline',
        isSelected:  true,
        isFavourite: false,
      });

      this.showNewListInput = false;
      this.newListName      = '';
      this.newListNameError = '';
    } catch (err) {
      console.error('[ChooseListSheet] createList error:', err);
      this.newListNameError = 'Failed to create list';
    }
  }

  // ── Done — apply all changes to Firebase ─────────────
  // ✅ UPDATED: saare roomIds ke liye loop karta hai
  async onDone(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;

    try {
      for (const item of this.items) {
        if (item.isFavourite) {
          // ── Favourites — har roomId ke liye check ────────────
          for (const id of this.roomIds) {
            const isCurrFav = this.chatListFilterService.isFavourite(id);
            if (item.isSelected && !isCurrFav) {
              await this.chatListFilterService.addToFavourites(id);
            } else if (!item.isSelected && isCurrFav) {
              await this.chatListFilterService.removeFromFavourites(id);
            }
          }
        } else {
          // ── Custom lists — har roomId ke liye check ──────────
          const list = this.chatListFilterService.currentLists.find(
            l => l.listId === item.id
          );
          if (!list) continue;

          for (const id of this.roomIds) {
            const isInList = list.roomIds.includes(id);
            if (item.isSelected && !isInList) {
              await this.chatListFilterService.addRoomToList(item.id, id);
            } else if (!item.isSelected && isInList) {
              await this.chatListFilterService.removeRoomFromList(item.id, id);
            }
          }
        }
      }

      await this.modalCtrl.dismiss({ saved: true });
    } catch (err) {
      console.error('[ChooseListSheet] onDone error:', err);
    } finally {
      this.isSaving = false;
    }
  }

  // ── Close without saving ──────────────────────────────
  dismiss(): void {
    this.modalCtrl.dismiss({ saved: false });
  }
}