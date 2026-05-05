import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import {
  IonicModule,
  AlertController,
  PopoverController,
  NavController,
} from '@ionic/angular';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import {
  getDatabase,
  ref as rtdbRef,
  onValue,
  off,
  get,
  remove,
  set,
} from 'firebase/database';
import { AuthService } from '../../auth/auth.service';
import { ApiService } from '../../services/api/api.service';
import { FirebaseChatService } from '../../services/firebase-chat.service';
import { EncryptionService } from '../../services/encryption.service';
import { ChatBackendSocketService } from '../../services/chat-backend-socket.service';
import { ArchItem } from 'src/types';
import { SecureStorageService } from 'src/app/services/secure-storage/secure-storage.service';
import { ContactSyncService } from 'src/app/services/contact-sync.service';
import { ArchieveMenuPopoverComponent } from 'src/app/components/archieve-menu-popover/archieve-menu-popover.component';
import { IConversation } from 'src/app/services/sqlite.service';
import { Subscription } from 'rxjs';
import { NetworkService } from 'src/app/services/network-connection/network.service';

@Component({
  selector: 'app-archieved-screen',
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
  templateUrl: './archieved-screen.page.html',
  styleUrls: ['./archieved-screen.page.scss'],
})
export class ArchievedScreenPage implements OnInit, OnDestroy {
  items: IConversation[] = [];
  isLoading = true;

  // selection state
  selected: IConversation[] = [];
  private longPressTimer: any = null;

  private userId = '';
  private unsubArchive?: () => void;

  private deviceNameMap = new Map<string, string>();
  chatList: any[] = [];
  unreadSubs: Subscription[] = [];
  private typingUnsubs: Map<string, () => void> = new Map();

  constructor(
    private auth: AuthService,
    private api: ApiService,
    private router: Router,
    private alertCtrl: AlertController,
    private popover: PopoverController,
    private firebaseChat: FirebaseChatService,
    private enc: EncryptionService,
    private navCtrl: NavController,
    private secureStorage: SecureStorageService,
    private firebaseChatService : FirebaseChatService,
    private authService : AuthService,
    private contactSync: ContactSyncService,
    private alertController : AlertController,
    private networkService: NetworkService,   // ✅ ADD
    private cdr: ChangeDetectorRef,            // ✅ ADD
    private chatBackendSocket: ChatBackendSocketService
  ) {}

  async ngOnInit() {
    this.userId = this.auth.authData?.userId?.toString() || '';
  }

   async ionViewWillEnter() {
    try {
      this.isLoading = true;
      this.firebaseChat.conversations.subscribe((conv) => {
        this.items = conv
          .filter((c) => c.isArchived)
          .map((c) => {
            return {
              ...c,
              theyBlocked: c.theyBlocked ?? false,
            };
          });
        this.resolveBlockStatusInPlace();
      });
      this.isLoading = false;
    } catch (error) {
      console.error('Error in Archived', error);
    }
  }

  /**
   * ✅ Resolve block status for all private chats
   */
  private async resolveBlockStatusInPlace(): Promise<void> {
    if (!this.items || this.items.length === 0) return;

    const currentUserId = this.authService.authData?.userId;
    if (!currentUserId) return;

    const db = getDatabase();
    let updatedCount = 0;

    for (const chat of this.items) {
      if (chat.type === 'private' && chat.roomId && !chat.isMyself) {
        const parts = chat.roomId.split('_');
        const receiverId = parts.find((p) => p !== String(currentUserId));

        if (receiverId) {
          try {
            const blockRef = rtdbRef(
              db,
              `usersBlocks/${receiverId}/${currentUserId}`
            );
            const snapshot = await get(blockRef);
            const val = snapshot.val();
            const isBlocked = val?.status === 'active';

            if (chat.theyBlocked !== isBlocked) {
              chat.theyBlocked = isBlocked;
              updatedCount++;
            }
          } catch (err) {
            console.warn(
              `⚠️ Error resolving block status for ${receiverId}:`,
              err
            );
          }
        }
      }
    }

    if (updatedCount > 0) {
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    try {
      this.unsubArchive?.();
    } catch {}
  }

  private async checkNetworkBeforeAction(
  action:
    | 'unarchive'
    | 'deleteChats'
    | 'markUnread'
    | 'exitGroup'
    | 'exitGroups'
): Promise<boolean> {
  const currentStatus = this.networkService.isOnline.value;

  this.isLoading = false;
  const isOffline = !currentStatus;
  this.cdr.detectChanges();

  console.log(
    `🔍 ArchivedScreen network check for "${action}": ${
      currentStatus ? 'ONLINE' : 'OFFLINE'
    }`
  );

  if (!currentStatus) {
    await this.showOfflineAlert(action);
    return false;
  }

  return true;
}

private async showOfflineAlert(
  action:
    | 'unarchive'
    | 'deleteChats'
    | 'markUnread'
    | 'exitGroup'
    | 'exitGroups'
) {
  const messages: Record<typeof action, string> = {
    unarchive:
      'You are offline. Please connect to the internet to unarchive chats.',
    deleteChats:
      'You are offline. Please connect to the internet to delete chats.',
    markUnread:
      'You are offline. Please connect to the internet to mark chats as unread.',
    exitGroup:
      'You are offline. Please connect to the internet to exit the group.',
    exitGroups:
      'You are offline. Please connect to the internet to exit groups.',
  };

  const alert = await this.alertCtrl.create({
    header: "You're Offline",
    message:
      messages[action] ||
      'You are offline. Please connect to the internet to continue.',
    buttons: [
      {
        text: 'OK',
        role: 'cancel',
      },
    ],
  });

  await alert.present();
}


  private getMenuMode():
    | 'none'
    | 'single-private'
    | 'multi-private'
    | 'single-group'
    | 'multi-group'
    | 'mixed' {
    const sel = this.selected;
    if (!sel || sel.length === 0) return 'none';

    const hasPriv = sel.some((s) => s.type !== 'group');
    const hasGroup = sel.some((s) => s.type == 'group');

    if (hasPriv && hasGroup) return 'mixed';
    if (hasPriv) return sel.length === 1 ? 'single-private' : 'multi-private';
    if (hasGroup) return sel.length === 1 ? 'single-group' : 'multi-group';
    return 'none';
  }

  async openArchiveMenu(ev: Event) {
    const pop = await this.popover.create({
      component: ArchieveMenuPopoverComponent,
      componentProps: {
        mode: this.getMenuMode(),
        allSelected:
          this.selected.length > 0 &&
          this.selected.length === this.items.length,
        canLock: true,
      },
      event: ev,
      translucent: true,
    });
    await pop.present();

    const { data } = await pop.onDidDismiss();
    if (!data?.action) return;

    switch (data.action) {
      case 'settings':
        /* open archive settings */ break;

      case 'viewContact':
        await this.openSelectedContactProfile();
        break;
      case 'addShortcut':
        /* WIP */ break;
      case 'block':
        /* WIP */ break;

      case 'markUnread':
        await this.markAsUnread();
      break;
      case 'markRead':
        /* mark selected read */ break;

      case 'selectAll':
        this.selected = [...this.items];
        break;

      case 'lockChat':
        /* lock one */ break;
      case 'lockChats':
        /* lock many */ break;

      case 'favorite':
        /* add to favorites */ break;
      case 'addToList':
        /* add to list */ break;

      case 'exitGroup':
        await this.confirmAndExitSingleSelectedGroup();
        break;
      case 'exitGroups':
        await this.confirmAndExitMultipleSelectedGroups();
        break;
      case 'groupInfo':
        this.openSelectedGroupInfo();
        break;
    }
  }

 private openSelectedContactProfile(): void {
    // //console.log("selectedChats",this.selectedChats);
    // const sel = this.selectedChats.filter((c) => c.type === 'private');
    //  console.log("selected contact",sel)
    const chat = this.selected[0];
    this.firebaseChatService.openChat(chat);
    console.log({ chat });
    if (!chat) return;

    const parts = chat.roomId.split('_');
    const receiverId =
      parts.find((p: string | null) => p !== this.userId) ??
      parts[parts.length - 1];

    // console.log({receiverId})

    const queryParams: any = {
      receiverId: receiverId,
    };

    this.router.navigate(['/profile-screen'], { queryParams });
    this.clearSelection();
  }

  async markAsUnread() {
    if (!(await this.checkNetworkBeforeAction('markUnread'))) {
    return;
  }
    const me = this.userId || this.authService.authData?.userId || '';
    if (!me) return;

    // Build roomIds for selected chats (ignore communities)
    const roomIds = (this.selected || [])
      .filter((c) => c.type !== "community")
      .map(
        (c) =>
          c.roomId
      );

    if (roomIds.length === 0) return;

    for (const roomId of roomIds) {
      await this.firebaseChatService.markUnreadChat(roomId, 1);
    }

    this.clearSelection();
  }

private openSelectedGroupInfo(): void {
    // console.log("this group info options is selected")
    // const sel = this.selectedChats.filter((c) => c.group && !c.isCommunity);
    const chat = this.selected[0];
    this.firebaseChatService.openChat(chat);
    console.log({ chat });
    if (!chat) return;

    const queryParams: any = {
      receiverId: chat.roomId,
      isGroup: chat.type === "group",
    };

    this.router.navigate(['/profile-screen'], { queryParams });
    this.clearSelection();
  }

  /** Exit ONE selected group (Archived screen) */
   private async confirmAndExitSingleSelectedGroup(): Promise<void> {
    const sel = this.selected.filter((c) => c.type == 'group');
    console.log({sel})
    const chat = sel[0];
    console.log({chat})
    if (!chat) return;

    const parts = chat.roomId.split('_');
    const receiverId =
      parts.find((p: string | null) => p !== this.userId) ??
      parts[parts.length - 1];

    const alert = await this.alertCtrl.create({
      header: 'Exit Group',
      message: `Are you sure you want to exit "${chat.title
        }"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Exit',
          handler: async () => {
            await this.exitGroup(chat.roomId);
            // remove row from UI
            this.chatList = this.chatList.filter(
              (c) =>
                !(
                  c.receiver_Id === receiverId &&
                  c.group &&
                  !c.isCommunity
                )
            );
            this.stopTypingListenerForChat(chat);
            // unsubscribe unread for this group
            this.unreadSubs = this.unreadSubs.filter((s) => {
              try {
                /* keep; we don’t track per-row ref here */ return true;
              } catch {
                return true;
              }
            });
            this.clearSelection();

            const t = await this.alertCtrl.create({
              header: 'Exited',
              message: 'You exited the group.',
              buttons: ['OK'],
            });
            await t.present();
          },
        },
      ],
    });
    await alert.present();
  }

  getRoomId(a: string, b: string): string {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  private stopTypingListenerForChat(chat: any) {
    try {
      const roomId = chat.group
        ? chat.receiver_Id
        : this.getRoomId(this.userId || '', chat.receiver_Id);
      if (!roomId) return;
      const unsub = this.typingUnsubs.get(roomId);
      if (unsub) {
        try {
          unsub();
        } catch (e) { }
        this.typingUnsubs.delete(roomId);
      }
    } catch (err) { }
  }


  /** Exit MANY selected groups (Archived screen) */
  private async confirmAndExitMultipleSelectedGroups(): Promise<void> {
    if (!(await this.checkNetworkBeforeAction('exitGroups'))) return;
    const groups = this.selected.filter((s) => s.type == 'group');
    if (groups.length === 0) return;

    const alert = await this.alertCtrl.create({
      header: 'Exit Groups',
      message: `Exit ${groups.length} selected groups?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Exit',
          handler: async () => {
            let success = 0,
              fail = 0;
            const db = getDatabase();

            for (const g of groups) {
              try {
                await this.exitGroup(g.roomId);

                // clean archive entry for each via socket proxy
                try {
                  await this.firebaseChatService.applySecuredBatchUpdates({
                    [`archivedChats/${this.userId}/${g.roomId}`]: null,
                  });
                } catch {
                  console.warn('❌ Failed to remove archived chat entry via proxy');
                }

                // remove from UI
                this.items = this.items.filter((x) => x.roomId !== g.roomId);
                success++;
              } catch (e) {
                console.warn('exit group failed:', g.roomId, e);
                fail++;
              }
            }

            this.clearSelection();

            const msg =
              fail === 0
                ? `Exited ${success} groups`
                : `Exited ${success} groups, ${fail} failed`;
            const done = await this.alertCtrl.create({
              header: 'Done',
              message: msg,
              buttons: ['OK'],
            });
            await done.present();
          },
        },
      ],
    });
    await alert.present();
  }

  /** Core: exit a group and reassign admin if needed — routed via backend */
  private async exitGroup(groupId: string): Promise<void> {
    if (!(await this.checkNetworkBeforeAction('exitGroup'))) return;
    const userId = this.userId;
    if (!groupId || !userId) throw new Error('Missing groupId/userId');

    // Backend handles member removal, pastmembers migration, and admin reassignment
    await this.chatBackendSocket.emitWithAck('removeGroupMember', { groupId, targetUserId: userId });

    // optional: clear my unread count node
    try {
      await (this.firebaseChat as any).resetUnreadCount?.(groupId, userId);
    } catch {}
  }

  /** live list of archived rooms */
  private startArchiveListener() {
    // const db = getDatabase();
    // const ref = rtdbRef(db, `archivedChats/${this.userId}`);
    // const cb = onValue(ref, async (snap) => {
    //   const map = snap.exists() ? snap.val() : {};
    //   const roomIds = Object.keys(map).filter(
    //     (k) => map[k]?.isArchived === true
    //   );
    //   const items = await Promise.all(
    //     roomIds.map((rid) => this.buildItem(rid))
    //   );
    //   this.items = items.sort((a, b) => {
    //     const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    //     const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    //     return tb - ta;
    //   });
    //   this.isLoading = false;
    // });
    // this.unsubArchive = () => off(ref, 'value', cb);
  }

  /** construct one row (name, avatar, preview, unread) */
  private async buildItem(roomId: string): Promise<ArchItem> {
    const isGroup = roomId.startsWith('group_');
    let name = 'Chat';
    let avatar: string | null = null;
    let otherUserId: string | undefined;

    if (isGroup) {
      const g = await this.firebaseChat.getGroupInfo(roomId);
      name = g?.name || 'Group';
      avatar = null;
      try {
        const res: any = await new Promise((resolve) =>
          this.api.getGroupDp(roomId).subscribe(resolve, () => resolve(null))
        );
        if (res?.group_dp_url) avatar = res.group_dp_url;
      } catch {}
    } else {
      // private: resolve "other" id from a_b
      const [a, b] = roomId.split('_');
      otherUserId = a === this.userId ? b : a;

      const user = await this.fetchUser(otherUserId);

      // ✅ device-name preference like Home
      const phoneKey = this.normalizePhone(user?.phone_number);
      const deviceName = phoneKey
        ? this.deviceNameMap.get(phoneKey)
        : undefined;
      const phoneDisplay = phoneKey ? phoneKey.slice(-10) : undefined;

      name = deviceName || phoneDisplay || user?.name || otherUserId || 'User';

      avatar = user?.profile_picture_url || null;
    }

    // last message preview
    const { preview, time, ts } = await this.fetchPreview(roomId);

    // unread count — use service if available else fallback
    let unread = 0;
    try {
      const fn = (this.firebaseChat as any).getUnreadCountOnce;
      unread = fn
        ? await fn.call(this.firebaseChat, roomId, this.userId)
        : await this.fetchUnreadCount(roomId);
    } catch {
      unread = 0;
    }

    return {
      roomId,
      isGroup,
      otherUserId,
      name,
      avatar,
      message: preview,
      time,
      timestamp: ts,
      unreadCount: unread || 0,
    };
  }

  private async fetchUser(userId: string): Promise<any | null> {
    // same as before; we just need phone_number included from API
    return await new Promise((resolve) => {
      this.api.getAllUsers().subscribe({
        next: (list: any[]) =>
          resolve(
            list?.find((u) => String(u.user_id) === String(userId)) || null
          ),
        error: () => resolve(null),
      });
    });
  }

  private normalizePhone(num?: string): string {
    if (!num) return '';
    return String(num).replace(/\D/g, '').slice(-10);
  }

  private async fetchUnreadCount(roomId: string): Promise<number> {
    try {
      const db = getDatabase();
      const snap = await get(
        rtdbRef(db, `unreadCounts/${roomId}/${this.userId}`)
      );
      return snap.exists() ? snap.val() || 0 : 0;
    } catch {
      return 0;
    }
  }

  private formatTimestamp(timestamp?: string): string {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const now = new Date();
    const yest = new Date();
    yest.setDate(now.getDate() - 1);

    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
    }
    return d.toLocaleDateString();
  }

  private async fetchPreview(
    roomId: string
  ): Promise<{ preview: string; time: string; ts?: string }> {
    try {
      const db = getDatabase();
      const chatsSnap = await get(rtdbRef(db, `chats/${roomId}`));
      const val = chatsSnap.val();
      if (!val) return { preview: '', time: '' };

      const msgs = Object.entries(val).map(([k, v]: any) => ({
        key: k,
        ...(v as any),
      }));
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m: any = msgs[i];
        if (m.isDeleted || m.deletedForEveryone) continue;
        if (m.deletedFor && this.userId && m.deletedFor[String(this.userId)])
          continue;

        if (m.attachment?.type && m.attachment.type !== 'text') {
          const map: Record<string, string> = {
            image: '📷 Photo',
            video: '🎥 Video',
            audio: '🎵 Audio',
            file: '📎 File',
          };
          const txt = map[m.attachment?.type as string] || '[Media]';
          return {
            preview: txt,
            time: this.formatTimestamp(m.timestamp),
            ts: m.timestamp,
          };
        } else {
          try {
            const dec = await this.enc.decrypt(m.text || '');
            const p = dec?.trim() ? dec : m.text || '';
            if (p)
              return {
                preview: p,
                time: this.formatTimestamp(m.timestamp),
                ts: m.timestamp,
              };
          } catch {
            return {
              preview: '[Encrypted]',
              time: this.formatTimestamp(m.timestamp),
              ts: m.timestamp,
            };
          }
        }
      }
      const last = msgs[msgs.length - 1];
      return {
        preview: 'This message was deleted',
        time: this.formatTimestamp(last?.timestamp),
        ts: last?.timestamp,
      };
    } catch {
      return { preview: '', time: '' };
    }
  }

  async open(item: IConversation) {
    console.log({ item });
    await this.firebaseChatService.openChat(item);
    try {
      if (item.type == 'private') {
      const parts = item.roomId.split('_');
      const receiverId =
        parts.find((p: string | null) => p !== this.userId) ??
        parts[parts.length - 1];
      console.log({ receiverId });
      this.router.navigate(['/chatting-screen'], {
        queryParams: { receiverId: receiverId, from: 'archive' },
      });
    } else if (item.type == 'community') {
      const receiverId = item.roomId;
      this.router.navigate(['/community-detail'], {
        queryParams: { receiverId: receiverId, from: 'archive' },
      });
    } else {
      const receiverId = item.roomId;
      this.router.navigate(['/chatting-screen'], {
        queryParams: { receiverId: receiverId, from: 'archive' },
      });
    }
    return;
    } catch (error) {
      console.error("chat not open", error)
    }
  }

  /* ---------- selection helpers ---------- */
  get selectionMeta() {
    const sel = this.selected || [];
    const hasPriv = sel.some((s) => s.type !== 'group');
    const hasGroup = sel.some((s) => s.type == 'group');
    return {
      count: sel.length,
      onlyPrivates: hasPriv && !hasGroup,
      onlyGroups: !hasPriv && hasGroup,
      mixed: hasPriv && hasGroup,
    };
  }

  isSelected(it: IConversation): boolean {
    return this.selected.some((s) => s.roomId === it.roomId);
  }

  toggleSelection(it: IConversation, ev?: Event) {
    if (ev) ev.stopPropagation();
    const i = this.selected.findIndex((s) => s.roomId === it.roomId);
    if (i > -1) this.selected.splice(i, 1);
    else this.selected.push(it);
    if (this.selected.length === 0) this.cancelLongPress();
  }

  clearSelection() {
    this.selected = [];
    this.cancelLongPress();
  }

  onRowClick(it: IConversation, ev: Event) {
    if (this.selected.length > 0) {
      this.toggleSelection(it, ev);
      return;
    }
    this.open(it);
  }

  startLongPress(it: IConversation) {
    this.cancelLongPress();
    this.longPressTimer = setTimeout(() => {
      if (!this.isSelected(it)) this.selected = [it];
    }, 500);
  }

  cancelLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /* ---------- header actions ---------- */

 // bulk unarchive from header
async unarchiveSelected() {
  if (!(await this.checkNetworkBeforeAction('unarchive'))) {
    return;
  }
  if (!this.userId) {
    this.clearSelection();
    return;
  }
 
  const roomIds = this.selected.map(c => c.roomId);
 
  // ✅ Unarchive
  await this.firebaseChat.setArchiveConversation(roomIds, false);
 
  // ✅ Unmute all unarchived chats
  await Promise.all(
    roomIds.map(roomId =>
      this.firebaseChat.unmuteChat(roomId, this.userId)
    )
  );
 
  // ✅ optimistic UI
  const selectedIds = new Set(roomIds);
  this.items = this.items.filter(i => !selectedIds.has(i.roomId));
 
  this.clearSelection();
}

  // delete for me — only privates
  // async deleteSelected() {
  //   const db = getDatabase();
  //   const privates = this.selected.filter((s) => s.type !== 'group');
  //   if (privates.length === 0) {
  //     this.clearSelection();
  //     return;
  //   }

  //   await Promise.all(
  //     privates.map(async (it) => {
  //       try {
  //         await this.firebaseChat.deleteChatForUser(it.roomId, this.userId);
  //       } catch {}
  //       // try {
  //       //   await remove(
  //       //     rtdbRef(db, `archivedChats/${this.userId}/${it.roomId}`)
  //       //   );
  //       // } catch {}
  //     })
  //   );

  //   const toRemove = new Set(privates.map((p) => p.roomId));
  //   this.items = this.items.filter((it) => !toRemove.has(it.roomId));
  //   this.clearSelection();
  // }

    async deleteMultipleChats() {
      if (!(await this.checkNetworkBeforeAction('deleteChats'))) {
    return;
  }
  if (!this.selected || this.selected.length === 0) {
    return;
  }

  const alert = await this.alertController.create({
    header: 'Delete Chats',
    message: 'Are you sure you want to delete selected chats?',
    buttons: [
      {
        text: 'Cancel',
        role: 'cancel',
        handler: () => {
          console.log('Delete cancelled');
        }
      },
      {
        text: 'Delete',
        role: 'destructive',
        handler: async () => {
          try {
            console.log('multiple delete confirmed');

            await this.firebaseChatService.deleteChats(
              this.selected.map(c => c.roomId)
            );

            this.clearSelection();
          } catch (error) {
            console.error('Error deleting chats:', error);
          }
        }
      }
    ]
  });

  await alert.present();
}
  async onBack() {
    // await this.chatService.closeChat();
    // this.router.navigate(['/home-screen']);
    // this.navCtrl.back();
  }
}
