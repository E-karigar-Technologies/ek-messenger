// // src/app/add-selected-contact-in-list/add-selected-contact-in-list.page.ts

// import { CommonModule } from '@angular/common';
// import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
// import { FormsModule } from '@angular/forms';
// import { IonicModule, NavController } from '@ionic/angular';
// import { ActivatedRoute, Router } from '@angular/router';
// import { FirebaseChatService } from '../../services/firebase-chat.service';
// import { ChatListFilterService } from '../../services/chat-list-filter.service';
// import { AuthService } from '../../auth/auth.service';

// export interface SelectableChat {
//   roomId:    string;
//   title:     string;
//   avatar:    string | null;
//   type:      'private' | 'group' | 'community';
//   isContact: boolean;
// }

// @Component({
//   selector: 'app-add-selected-contact-in-list',
//   templateUrl: './add-selected-contact-in-list.page.html',
//   styleUrls: ['./add-selected-contact-in-list.page.scss'],
//   standalone: true,
//   imports: [CommonModule, FormsModule, IonicModule],
// })
// export class AddSelectedContactInListPage implements OnInit {

//   @ViewChild('searchInputRef') searchInputRef!: ElementRef<HTMLInputElement>;

//   listId    = '';
//   listName  = '';
//   isNewList = false;

//   // ── Special flag: this page is managing FAVOURITES not a custom list ──
//   isFavouritesMode = false;

//   searchText = '';
//   showSearch = false;
//   isLoading  = true;
//   isSaving   = false;

//   selected:       SelectableChat[] = [];
//   frequentChats:  SelectableChat[] = [];
//   otherContacts:  SelectableChat[] = [];
//   filteredFrequent: SelectableChat[] = [];
//   filteredOther:    SelectableChat[] = [];

//   constructor(
//     private route:       ActivatedRoute,
//     private router:      Router,
//     private navCtrl:     NavController,
//     private firebaseSvc: FirebaseChatService,
//     private filterSvc:   ChatListFilterService,
//     private authService: AuthService,
//     private cdr:         ChangeDetectorRef,
//   ) {}

//   async ngOnInit() {
//     this.listId    = this.route.snapshot.queryParams['listId']   || '';
//     this.listName  = this.route.snapshot.queryParams['listName'] || '';
//     this.isNewList = this.route.snapshot.queryParams['isNew']    === 'true';

//     // Special: listId === 'favourites' means we're managing the Favourites list
//     this.isFavouritesMode = this.listId === 'favourites';

//     await this.buildLists();
//   }

//   // ════════════════════════════════════════════════════
//   // SEARCH TOGGLE
//   // ════════════════════════════════════════════════════
//   openSearch(): void {
//     this.showSearch = true;
//     this.cdr.detectChanges();
//     setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 100);
//   }

//   closeSearch(): void {
//     this.showSearch = false;
//     this.clearSearch();
//   }

//   clearSearch(): void {
//     this.searchText = '';
//     this.applySearch();
//     this.cdr.detectChanges();
//   }

//   onSearch(): void {
//     this.applySearch();
//   }

//   // ════════════════════════════════════════════════════
//   // BUILD LISTS
//   // ════════════════════════════════════════════════════
//   private async buildLists(): Promise<void> {
//     this.isLoading = true;
//     try {
//       await this.filterSvc.loadFromFirebase();

//       const senderId      = this.authService.authData?.userId || '';
//       const conversations = this.firebaseSvc.currentConversations || [];
//       const platformUsers = this.firebaseSvc.currentUsers         || [];

//       // ── Frequently contacted: all chats excl. communities ──
//       this.frequentChats = conversations
//         .filter(c => c.type !== 'community' && !c.isArchived && !c.isLocked)
//         .map(c => ({
//           roomId:    c.roomId,
//           title:     c.title || c.roomId,
//           avatar:    c.avatar || null,
//           type:      c.type as any,
//           isContact: false,
//         }));

//       // ── Other contacts: app users without a chat ──
//       const chattedUserIds = new Set<string>();
//       conversations.forEach(c => {
//         if (c.type === 'private') {
//           c.roomId.split('_').forEach((p: string) => {
//             if (p !== senderId) chattedUserIds.add(p);
//           });
//         }
//       });

//       this.otherContacts = platformUsers
//         .filter((u: any) => {
//           const uid = String(u.userId || '');
//           return uid && uid !== senderId && !chattedUserIds.has(uid);
//         })
//         .map((u: any) => ({
//           roomId:    u.userId,
//           title:     u.device_contact_name || u.username || u.phoneNumber || 'Unknown',
//           avatar:    u.avatar || null,
//           type:      'private' as const,
//           isContact: true,
//         }));

//       // ── Pre-select already-added items ──────────────────
//       this.selected = [];

//       if (this.isFavouritesMode) {
//         // Pre-select all existing favourites
//         const favIds = new Set(this.filterSvc.currentFavouriteIds);
//         this.frequentChats.forEach(c => {
//           if (favIds.has(c.roomId)) this.selected.push({ ...c });
//         });
//         this.otherContacts.forEach(c => {
//           if (favIds.has(c.roomId)) this.selected.push({ ...c });
//         });
//       } else if (!this.isNewList && this.listId) {
//         // Pre-select chats already in this custom list
//         const list = this.filterSvc.currentLists.find(l => l.listId === this.listId);
//         if (list) {
//           const inList = new Set(list.roomIds);
//           this.frequentChats.forEach(c => {
//             if (inList.has(c.roomId)) this.selected.push({ ...c });
//           });
//         }
//       }

//       this.applySearch();
//     } catch (err) {
//       console.error('[AddSelectedContact] buildLists error:', err);
//     } finally {
//       this.isLoading = false;
//       this.cdr.detectChanges();
//     }
//   }

//   private applySearch(): void {
//     const q = this.searchText.trim().toLowerCase();
//     if (!q) {
//       this.filteredFrequent = [...this.frequentChats];
//       this.filteredOther    = [...this.otherContacts];
//     } else {
//       this.filteredFrequent = this.frequentChats.filter(c =>
//         c.title.toLowerCase().includes(q)
//       );
//       this.filteredOther = this.otherContacts.filter(c =>
//         c.title.toLowerCase().includes(q)
//       );
//     }
//   }

//   // ════════════════════════════════════════════════════
//   // SELECTION
//   // ════════════════════════════════════════════════════
//   isSelected(chat: SelectableChat): boolean {
//     return this.selected.some(s => s.roomId === chat.roomId);
//   }

//   toggleSelect(chat: SelectableChat): void {
//     if (this.isSelected(chat)) {
//       this.selected = this.selected.filter(s => s.roomId !== chat.roomId);
//     } else {
//       this.selected.push({ ...chat });
//     }
//     this.cdr.detectChanges();
//   }

//   removeSelected(chat: SelectableChat): void {
//     this.selected = this.selected.filter(s => s.roomId !== chat.roomId);
//     this.cdr.detectChanges();
//   }

//   // ════════════════════════════════════════════════════
//   // SAVE — handles both favourites mode and custom list mode
//   // ════════════════════════════════════════════════════
//   get canSave(): boolean {
//     return !this.isSaving;
//   }

//   async onDone(): Promise<void> {
//     if (this.isSaving) return;
//     this.isSaving = true;

//     try {
//       if (this.isFavouritesMode) {
//         // ── FAVOURITES MODE ──────────────────────────────
//         // Current favourites from service
//         const currentFavIds = new Set(this.filterSvc.currentFavouriteIds);
//         // Newly selected roomIds
//         const newSelectedIds = new Set(
//           this.selected.filter(s => !s.isContact).map(s => s.roomId)
//         );

//         // Add newly selected ones
//         for (const roomId of newSelectedIds) {
//           if (!currentFavIds.has(roomId)) {
//             await this.filterSvc.addToFavourites(roomId);
//           }
//         }

//         // Remove deselected ones
//         for (const roomId of currentFavIds) {
//           if (!newSelectedIds.has(roomId)) {
//             await this.filterSvc.removeFromFavourites(roomId);
//           }
//         }

//       } else {
//         // ── CUSTOM LIST MODE ─────────────────────────────
//         let targetListId = this.listId;

//         if (this.isNewList && this.listName) {
//           const newList = await this.filterSvc.createList(this.listName);
//           targetListId  = newList.listId;
//         }

//         if (!targetListId) return;

//         const currentList    = this.filterSvc.currentLists.find(l => l.listId === targetListId);
//         const currentRoomIds = new Set(currentList?.roomIds || []);
//         const newSelectedIds = new Set(
//           this.selected.filter(s => !s.isContact).map(s => s.roomId)
//         );

//         // Add new ones
//         for (const roomId of newSelectedIds) {
//           if (!currentRoomIds.has(roomId)) {
//             await this.filterSvc.addRoomToList(targetListId, roomId);
//           }
//         }

//         // Remove deselected ones
//         for (const roomId of currentRoomIds) {
//           if (!newSelectedIds.has(roomId)) {
//             await this.filterSvc.removeRoomFromList(targetListId, roomId);
//           }
//         }
//       }

//       this.navCtrl.back();
//     } catch (err) {
//       console.error('[AddSelectedContact] onDone error:', err);
//     } finally {
//       this.isSaving = false;
//     }
//   }

//   goBack(): void {
//     if (this.showSearch) {
//       this.closeSearch();
//     } else {
//       this.navCtrl.back();
//     }
//   }

//   getInitial(title: string): string {
//     return (title || '?').charAt(0).toUpperCase();
//   }
// }

import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseChatService } from '../../services/firebase-chat.service';
import { ChatListFilterService } from '../../services/chat-list-filter.service';
import { AuthService } from '../../auth/auth.service';
import { v4 as uuidv4 } from 'uuid';

export interface SelectableChat {
  roomId: string;
  title: string;
  avatar: string | null;
  type: 'private' | 'group' | 'community';
  isContact: boolean;
}

@Component({
  selector: 'app-add-selected-contact-in-list',
  templateUrl: './add-selected-contact-in-list.page.html',
  styleUrls: ['./add-selected-contact-in-list.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class AddSelectedContactInListPage implements OnInit {
  @ViewChild('searchInputRef') searchInputRef!: ElementRef<HTMLInputElement>;

  listId = '';
  listName = '';
  isNewList = false;

  // ── Special flags ──────────────────────────────────────────────
  isFavouritesMode = false;

  // ── NEW: Invite link mode ──────────────────────────────────────
  isInviteMode = false;
  inviteLink = '';
  inviteGroupName = '';
  isSendingInvite = false;

  searchText = '';
  showSearch = false;
  isLoading = true;
  isSaving = false;

  selected: SelectableChat[] = [];
  frequentChats: SelectableChat[] = [];
  otherContacts: SelectableChat[] = [];
  filteredFrequent: SelectableChat[] = [];
  filteredOther: SelectableChat[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private navCtrl: NavController,
    private firebaseSvc: FirebaseChatService,
    private filterSvc: ChatListFilterService,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.listId = this.route.snapshot.queryParams['listId'] || '';
    this.listName = this.route.snapshot.queryParams['listName'] || '';
    this.isNewList = this.route.snapshot.queryParams['isNew'] === 'true';

    // ── Detect invite mode ─────────────────────────────────────
    const mode = this.route.snapshot.queryParams['mode'];
    if (mode === 'invite') {
      this.isInviteMode = true;
      this.inviteLink = this.route.snapshot.queryParams['inviteLink'] || '';
      this.inviteGroupName =
        this.route.snapshot.queryParams['groupName'] || 'Group';
    }

    this.isFavouritesMode = this.listId === 'favourites';

    await this.buildLists();
  }

  // ── Page title helper ──────────────────────────────────────────
  get pageTitle(): string {
    if (this.isInviteMode) return 'Send Invite Link';
    if (this.isFavouritesMode) return 'Favourites';
    if (this.isNewList) return 'New List';
    return this.listName || 'Edit List';
  }

  // ── Done button label ──────────────────────────────────────────
  get doneLabel(): string {
    if (this.isInviteMode) {
      return this.selected.length > 0
        ? `Send to ${this.selected.length} chat${this.selected.length > 1 ? 's' : ''}`
        : 'Send';
    }
    return 'Done';
  }

  // ── Search toggle ──────────────────────────────────────────────
  openSearch(): void {
    this.showSearch = true;
    this.cdr.detectChanges();
    setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 100);
  }

  closeSearch(): void {
    this.showSearch = false;
    this.clearSearch();
  }

  clearSearch(): void {
    this.searchText = '';
    this.applySearch();
    this.cdr.detectChanges();
  }

  onSearch(): void {
    this.applySearch();
  }

  // ── Build lists ────────────────────────────────────────────────
  private async buildLists(): Promise<void> {
    this.isLoading = true;
    try {
      await this.filterSvc.loadFromFirebase();

      const senderId = this.authService.authData?.userId || '';
      const conversations = this.firebaseSvc.currentConversations || [];
      const platformUsers = this.firebaseSvc.currentUsers || [];

      // All chats except communities
      this.frequentChats = conversations
        .filter((c) => c.type !== 'community' && !c.isArchived && !c.isLocked)
        .map((c) => ({
          roomId: c.roomId,
          title: c.title || c.roomId,
          avatar: c.avatar || null,
          type: c.type as any,
          isContact: false,
        }));

      // Platform users without an existing chat
      const chattedUserIds = new Set<string>();
      conversations.forEach((c) => {
        if (c.type === 'private') {
          c.roomId.split('_').forEach((p: string) => {
            if (p !== senderId) chattedUserIds.add(p);
          });
        }
      });

      this.otherContacts = platformUsers
        .filter((u: any) => {
          const uid = String(u.userId || '');
          return uid && uid !== senderId && !chattedUserIds.has(uid);
        })
        .map((u: any) => ({
          roomId: u.userId,
          title:
            u.device_contact_name ||
            u.username ||
            u.phoneNumber ||
            'Unknown',
          avatar: u.avatar || null,
          type: 'private' as const,
          isContact: true,
        }));

      // Pre-select already-added items (only for non-invite mode)
      this.selected = [];

      if (!this.isInviteMode) {
        if (this.isFavouritesMode) {
          const favIds = new Set(this.filterSvc.currentFavouriteIds);
          this.frequentChats.forEach((c) => {
            if (favIds.has(c.roomId)) this.selected.push({ ...c });
          });
          this.otherContacts.forEach((c) => {
            if (favIds.has(c.roomId)) this.selected.push({ ...c });
          });
        } else if (!this.isNewList && this.listId) {
          const list = this.filterSvc.currentLists.find(
            (l) => l.listId === this.listId
          );
          if (list) {
            const inList = new Set(list.roomIds);
            this.frequentChats.forEach((c) => {
              if (inList.has(c.roomId)) this.selected.push({ ...c });
            });
          }
        }
      }

      this.applySearch();
    } catch (err) {
      console.error('[AddSelectedContact] buildLists error:', err);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private applySearch(): void {
    const q = this.searchText.trim().toLowerCase();
    if (!q) {
      this.filteredFrequent = [...this.frequentChats];
      this.filteredOther = [...this.otherContacts];
    } else {
      this.filteredFrequent = this.frequentChats.filter((c) =>
        c.title.toLowerCase().includes(q)
      );
      this.filteredOther = this.otherContacts.filter((c) =>
        c.title.toLowerCase().includes(q)
      );
    }
  }

  // ── Selection ──────────────────────────────────────────────────
  isSelected(chat: SelectableChat): boolean {
    return this.selected.some((s) => s.roomId === chat.roomId);
  }

  toggleSelect(chat: SelectableChat): void {
    if (this.isSelected(chat)) {
      this.selected = this.selected.filter((s) => s.roomId !== chat.roomId);
    } else {
      this.selected.push({ ...chat });
    }
    this.cdr.detectChanges();
  }

  removeSelected(chat: SelectableChat): void {
    this.selected = this.selected.filter((s) => s.roomId !== chat.roomId);
    this.cdr.detectChanges();
  }

  // ── Main action: routes to invite sender or list manager ───────
  get canSave(): boolean {
    if (this.isInviteMode) return this.selected.length > 0 && !this.isSaving;
    return !this.isSaving;
  }

  async onDone(): Promise<void> {
    if (this.isSaving) return;

    if (this.isInviteMode) {
      await this.sendInviteLinks();
      return;
    }

    this.isSaving = true;
    try {
      if (this.isFavouritesMode) {
        const currentFavIds = new Set(this.filterSvc.currentFavouriteIds);
        const newSelectedIds = new Set(
          this.selected.filter((s) => !s.isContact).map((s) => s.roomId)
        );
        for (const roomId of newSelectedIds) {
          if (!currentFavIds.has(roomId))
            await this.filterSvc.addToFavourites(roomId);
        }
        for (const roomId of currentFavIds) {
          if (!newSelectedIds.has(roomId))
            await this.filterSvc.removeFromFavourites(roomId);
        }
      } else {
        let targetListId = this.listId;
        if (this.isNewList && this.listName) {
          const newList = await this.filterSvc.createList(this.listName);
          targetListId = newList.listId;
        }
        if (!targetListId) return;

        const currentList = this.filterSvc.currentLists.find(
          (l) => l.listId === targetListId
        );
        const currentRoomIds = new Set(currentList?.roomIds || []);
        const newSelectedIds = new Set(
          this.selected.filter((s) => !s.isContact).map((s) => s.roomId)
        );
        for (const roomId of newSelectedIds) {
          if (!currentRoomIds.has(roomId))
            await this.filterSvc.addRoomToList(targetListId, roomId);
        }
        for (const roomId of currentRoomIds) {
          if (!newSelectedIds.has(roomId))
            await this.filterSvc.removeRoomFromList(targetListId, roomId);
        }
      }
      this.navCtrl.back();
    } catch (err) {
      console.error('[AddSelectedContact] onDone error:', err);
    } finally {
      this.isSaving = false;
    }
  }

  // ── NEW: Send invite link to all selected chats ────────────────
  private async sendInviteLinks(): Promise<void> {
    if (this.selected.length === 0) {
      await this.showToast('Please select at least one chat', 'warning');
      return;
    }

    this.isSaving = true;
    this.isSendingInvite = true;

    try {
      const senderId = this.authService.authData?.userId || '';
      const senderName = this.authService.authData?.name || '';
      const senderPhone = this.authService.authData?.phone_number || '';
      const timestamp = Date.now();

      const messageText = `Join "${this.inviteGroupName}" on app: ${this.inviteLink}`;

      let successCount = 0;
      let failCount = 0;

      for (const chat of this.selected) {
        try {
          const msgId = uuidv4();

          if (chat.isContact) {
            // ── Contact without existing chat: open a new chat first ──
            await this.firebaseSvc.openChat(
              {
                receiver: {
                  userId: chat.roomId,
                  username: chat.title,
                  phoneNumber: '',
                },
              },
              true
            );

            const roomId = this.firebaseSvc.getRoomIdFor1To1(
              senderId,
              chat.roomId
            );

            await this.firebaseSvc.sendMessageDirectly(
              {
                msgId,
                sender: senderId,
                sender_name: senderName,
                sender_phone: senderPhone,
                receiver_id: chat.roomId,
                type: 'text',
                text: messageText,
                timestamp,
                status: 'sent',
                receipts: {
                  read: { status: false, readBy: [] },
                  delivered: { status: false, deliveredTo: [] },
                },
              },
              chat.roomId
            );
          } else {
            // ── Existing chat (private or group) ──────────────────────
            if (chat.type === 'private') {
              // Extract receiver from roomId (e.g. "23_45")
              const parts = chat.roomId.split('_');
              const receiverId =
                parts.find((p) => p !== senderId) ?? parts[1];

              await this.firebaseSvc.sendMessageDirectly(
                {
                  msgId,
                  sender: senderId,
                  sender_name: senderName,
                  sender_phone: senderPhone,
                  receiver_id: receiverId,
                  type: 'text',
                  text: messageText,
                  timestamp: timestamp + successCount, // slight offset to avoid collision
                  status: 'sent',
                  receipts: {
                    read: { status: false, readBy: [] },
                    delivered: { status: false, deliveredTo: [] },
                  },
                },
                receiverId
              );
            } else {
              // Group chat: use sendForwardMessage approach
              // We temporarily set currentChat to target group
              await this.firebaseSvc.sendGroupInviteMessage(
                chat.roomId,
                senderId,
                senderName,
                senderPhone,
                messageText,
                msgId,
                timestamp + successCount
              );
            }
          }

          successCount++;
        } catch (err) {
          console.error(`Failed to send invite to ${chat.title}:`, err);
          failCount++;
        }
      }

      // Show result toast
      if (failCount === 0) {
        await this.showToast(
          `Invite sent to ${successCount} chat${successCount > 1 ? 's' : ''}!`,
          'success'
        );
      } else {
        await this.showToast(
          `Sent to ${successCount}, failed for ${failCount}`,
          'warning'
        );
      }

      this.navCtrl.back();
    } catch (err) {
      console.error('[AddSelectedContact] sendInviteLinks error:', err);
      await this.showToast('Failed to send invite links', 'danger');
    } finally {
      this.isSaving = false;
      this.isSendingInvite = false;
    }
  }

  private async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  goBack(): void {
    if (this.showSearch) {
      this.closeSearch();
    } else {
      this.navCtrl.back();
    }
  }

  getInitial(title: string): string {
    return (title || '?').charAt(0).toUpperCase();
  }
}