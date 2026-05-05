import { Injectable } from '@angular/core';
import {
  Database,
} from '@angular/fire/database';
import {
  ref as rtdbRef,
  update as rtdbUpdate,
  set as rtdbSet,
  get as rtdbGet,
  onChildAdded,
  onChildChanged,
  query,
  orderByChild,
  limitToLast,
} from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { EncryptionService } from '../../services/encryption.service';
import { NetworkService } from '../../services/network-connection/network.service';
import { IChatMeta } from 'src/types';
import { IMessage } from 'src/app/services/sqlite.service';
import { ChatBackendSocketService } from '../../services/chat-backend-socket.service';
// import { IMessage } from 'src/types';

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface BroadcastMember {
  userId: string | null;
  username: string;
  phoneNumber: string;
}

export interface BroadcastList {
  broadcastId: string;
  broadcastName: string;
  createdBy: string;
  createdAt: number;
  members: BroadcastMember[];
  lastMessage?: string;
  lastMessageTime?: number;
  lastMessageType?: string;
  unreadCount?: number;
  deleted?: boolean;
  deletedAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root',
})
export class BroadcastService {

  // ── Observables for UI ──────────────────────────────────────────────────
  private _broadcasts$ = new BehaviorSubject<BroadcastList[]>([]);
  broadcasts$ = this._broadcasts$.asObservable();

  private _isLoading$ = new BehaviorSubject<boolean>(false);
  isLoading$ = this._isLoading$.asObservable();

  // ── Realtime listener cleanup refs ─────────────────────────────────────
  private _listenerUnsub: (() => void) | null = null;

  constructor(
    private db: Database,
    private authService: AuthService,
    private encryptionService: EncryptionService,
    private networkService: NetworkService,
    private chatBackendSocket: ChatBackendSocketService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CREATE BROADCAST
  //
  //    Firebase path: broadcasts/{currentUserId}/{broadcastId}
  //    Pattern: same as createGroup() in FirebaseChatService
  // ─────────────────────────────────────────────────────────────────────────
  async createBroadcast(
    broadcastId: string,
    broadcastName: string,
    members: BroadcastMember[]
  ): Promise<void> {
    const currentUserId = this.authService.authData?.userId ?? '';

    if (!currentUserId) throw new Error('User not authenticated');
    if (!broadcastName?.trim()) throw new Error('Broadcast name is required');
    if (members.length === 0) throw new Error('Select at least one contact');
    if (members.length > 256) throw new Error('Maximum 256 members allowed');

    const now = Date.now();

    const broadcastData: BroadcastList = {
      broadcastId,
      broadcastName: broadcastName.trim(),
      createdBy: currentUserId,
      createdAt: now,
      members,
      lastMessage: '',
      lastMessageTime: now,
      lastMessageType: 'text',
      unreadCount: 0,
    };

    // Save broadcast document via backend socket
    await this.chatBackendSocket.createBroadcast({ broadcastData });

    // Update local BehaviorSubject immediately (optimistic UI)
    const current = this._broadcasts$.value;
    this._broadcasts$.next([broadcastData, ...current]);

    console.log(
      `✅ Broadcast "${broadcastName}" created with ${members.length} members`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. SEND BROADCAST MESSAGE
  //
  //    WhatsApp style: har member ke saath individual private chat mein
  //    message jaata hai. Receiver ko pata nahi hota ke yeh broadcast hai.
  //    Pattern: sendMessage() in FirebaseChatService
  // ─────────────────────────────────────────────────────────────────────────
  async sendBroadcastMessage(
    broadcastId: string,
    messageText: string,
    members: BroadcastMember[],
    messageType: IMessage['type'] = 'text',
    attachment?: any
  ): Promise<void> {
    const currentUserId = this.authService.authData?.userId ?? '';
    const currentUserName = this.authService.authData?.name ?? '';
    const currentUserPhone = this.authService.authData?.phone_number ?? '';

    if (!currentUserId) throw new Error('User not authenticated');
    if (!messageText.trim() && !attachment) throw new Error('Message is empty');
    if (!this.networkService.isOnline.value) {
      throw new Error('No internet connection');
    }

    const messageId = uuidv4();
    const timestamp = Date.now();

    // Encrypt text — same as sendMessage() in FirebaseChatService
    let encryptedText = '';
    if (messageText.trim()) {
      encryptedText = await this.encryptionService.encrypt(messageText);
    }

    // Send to each member individually (broadcast = individual messages)
    const sendPromises = members
      .filter((m) => !!m.userId)
      .map(async (member) => {
        // Same roomId pattern as getRoomIdFor1To1() in FirebaseChatService
        const roomId = this._getRoomIdFor1To1(
          currentUserId,
          member.userId as string
        );

        // Send message using robust backend socket helper
        await this.chatBackendSocket.sendMessage({
          roomId,
          content: messageText || '',
          type: messageType,
          receiverId: member.userId as string,
          attachment,
          msgId: messageId,
          timestamp,
          // Extra identifiers for tracking
          isBroadcast: true,
          broadcastId
        } as any);
      });

    await Promise.all(sendPromises);

    // Update broadcast last message
    await this._updateBroadcastLastMessage(
      broadcastId,
      currentUserId,
      messageText,
      messageType,
      timestamp
    );

    console.log(`📤 Broadcast message sent to ${members.length} members`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. GET ALL BROADCASTS (current user ke saare broadcasts)
  //    Firebase path: broadcasts/{userId}
  // ─────────────────────────────────────────────────────────────────────────
  async getMyBroadcasts(): Promise<BroadcastList[]> {
    const currentUserId = this.authService.authData?.userId ?? '';
    if (!currentUserId) return [];

    this._isLoading$.next(true);

    try {
      const broadcastsRef = rtdbRef(
        this.db,
        `broadcasts/${currentUserId}`
      );
      const q = query(
        broadcastsRef,
        orderByChild('createdAt'),
        limitToLast(50)
      );
      const snapshot = await rtdbGet(q);

      if (!snapshot.exists()) {
        this._broadcasts$.next([]);
        return [];
      }

      const data = snapshot.val() || {};
      // Filter out soft-deleted broadcasts
      const broadcasts: BroadcastList[] = (Object.values(data) as BroadcastList[])
        .filter((b) => !b.deleted);

      // Sort newest first
      broadcasts.sort(
        (a, b) => (b.lastMessageTime || b.createdAt) - (a.lastMessageTime || a.createdAt)
      );

      this._broadcasts$.next(broadcasts);
      return broadcasts;
    } catch (error) {
      console.error('❌ Error getting broadcasts:', error);
      return [];
    } finally {
      this._isLoading$.next(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. GET SINGLE BROADCAST
  // ─────────────────────────────────────────────────────────────────────────
  async getBroadcast(broadcastId: string): Promise<BroadcastList | null> {
    const currentUserId = this.authService.authData?.userId ?? '';
    const broadcastRef = rtdbRef(
      this.db,
      `broadcasts/${currentUserId}/${broadcastId}`
    );
    const snapshot = await rtdbGet(broadcastRef);

    if (!snapshot.exists()) return null;
    return snapshot.val() as BroadcastList;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. LISTEN TO BROADCASTS (realtime)
  //    Pattern: setupConversationListener() in FirebaseChatService
  //    Call this from home-screen ya app init mein
  //    Returns unsub function — component destroy pe call karo
  // ─────────────────────────────────────────────────────────────────────────
  listenToMyBroadcasts(): () => void {
    const currentUserId = this.authService.authData?.userId ?? '';
    if (!currentUserId) return () => {};

    // Cleanup previous listener agar exist karta hai
    if (this._listenerUnsub) {
      this._listenerUnsub();
      this._listenerUnsub = null;
    }

    const broadcastsRef = rtdbRef(this.db, `broadcasts/${currentUserId}`);

    // Naya broadcast add hone par
    const addedUnsub = onChildAdded(broadcastsRef, (snap) => {
      const broadcast = snap.val() as BroadcastList;
      if (!broadcast || broadcast.deleted) return;

      const current = this._broadcasts$.value;
      const exists = current.some((b) => b.broadcastId === broadcast.broadcastId);
      if (!exists) {
        this._broadcasts$.next([broadcast, ...current]);
      }
    });

    // Existing broadcast update hone par (last message, member change, etc.)
    const changedUnsub = onChildChanged(broadcastsRef, (snap) => {
      const broadcast = snap.val() as BroadcastList;
      if (!broadcast) return;

      const current = this._broadcasts$.value;

      // Agar deleted mark ho gaya toh list se hata do
      if (broadcast.deleted) {
        this._broadcasts$.next(
          current.filter((b) => b.broadcastId !== broadcast.broadcastId)
        );
        return;
      }

      const idx = current.findIndex(
        (b) => b.broadcastId === broadcast.broadcastId
      );
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = broadcast;
        // Re-sort after update
        updated.sort(
          (a, b) => (b.lastMessageTime || b.createdAt) - (a.lastMessageTime || a.createdAt)
        );
        this._broadcasts$.next(updated);
      }
    });

    this._listenerUnsub = () => {
      addedUnsub();
      changedUnsub();
    };

    return this._listenerUnsub;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. ADD MEMBERS TO EXISTING BROADCAST
  // ─────────────────────────────────────────────────────────────────────────
  async addMembersToBroadcast(
    broadcastId: string,
    newMembers: BroadcastMember[]
  ): Promise<void> {
    const currentUserId = this.authService.authData?.userId ?? '';
    const broadcastRef = rtdbRef(
      this.db,
      `broadcasts/${currentUserId}/${broadcastId}`
    );
    const snapshot = await rtdbGet(broadcastRef);

    if (!snapshot.exists()) throw new Error('Broadcast not found');

    const current = snapshot.val() as BroadcastList;
    const existingIds = new Set(current.members.map((m) => m.userId));

    // Duplicate filter
    const toAdd = newMembers.filter((m) => !existingIds.has(m.userId));
    const totalAfterAdd = current.members.length + toAdd.length;

    if (totalAfterAdd > 256) {
      throw new Error(
        `Cannot add: would exceed 256 member limit (current: ${current.members.length})`
      );
    }

    const updatedMembers = [...current.members, ...toAdd];
    await this.chatBackendSocket.updateBroadcast({ broadcastId, updates: { members: updatedMembers } });

    // Update local state
    const broadcasts = this._broadcasts$.value;
    const idx = broadcasts.findIndex((b) => b.broadcastId === broadcastId);
    if (idx >= 0) {
      const updated = [...broadcasts];
      updated[idx] = { ...updated[idx], members: updatedMembers };
      this._broadcasts$.next(updated);
    }

    console.log(`➕ Added ${toAdd.length} new members to broadcast`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. REMOVE MEMBER FROM BROADCAST
  // ─────────────────────────────────────────────────────────────────────────
  async removeMemberFromBroadcast(
    broadcastId: string,
    memberUserId: string
  ): Promise<void> {
    const currentUserId = this.authService.authData?.userId ?? '';
    const broadcastRef = rtdbRef(
      this.db,
      `broadcasts/${currentUserId}/${broadcastId}`
    );
    const snapshot = await rtdbGet(broadcastRef);

    if (!snapshot.exists()) throw new Error('Broadcast not found');

    const current = snapshot.val() as BroadcastList;
    const updatedMembers = current.members.filter(
      (m) => m.userId !== memberUserId
    );

    await this.chatBackendSocket.updateBroadcast({ broadcastId, updates: { members: updatedMembers } });

    // Update local state
    const broadcasts = this._broadcasts$.value;
    const idx = broadcasts.findIndex((b) => b.broadcastId === broadcastId);
    if (idx >= 0) {
      const updated = [...broadcasts];
      updated[idx] = { ...updated[idx], members: updatedMembers };
      this._broadcasts$.next(updated);
    }

    console.log(`➖ Removed member ${memberUserId} from broadcast`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. RENAME BROADCAST
  // ─────────────────────────────────────────────────────────────────────────
  async renameBroadcast(broadcastId: string, newName: string): Promise<void> {
    if (!newName?.trim()) throw new Error('Name cannot be empty');

    const currentUserId = this.authService.authData?.userId ?? '';
    const broadcastRef = rtdbRef(
      this.db,
      `broadcasts/${currentUserId}/${broadcastId}`
    );

    await this.chatBackendSocket.updateBroadcast({ broadcastId, updates: { broadcastName: newName.trim() } });

    // Update local state
    const broadcasts = this._broadcasts$.value;
    const idx = broadcasts.findIndex((b) => b.broadcastId === broadcastId);
    if (idx >= 0) {
      const updated = [...broadcasts];
      updated[idx] = { ...updated[idx], broadcastName: newName.trim() };
      this._broadcasts$.next(updated);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. DELETE BROADCAST (soft delete)
  // ─────────────────────────────────────────────────────────────────────────
  async deleteBroadcast(broadcastId: string): Promise<void> {
    const currentUserId = this.authService.authData?.userId ?? '';
    const broadcastRef = rtdbRef(
      this.db,
      `broadcasts/${currentUserId}/${broadcastId}`
    );
    const snapshot = await rtdbGet(broadcastRef);

    if (!snapshot.exists()) throw new Error('Broadcast not found');

    // Soft delete — data rehta hai Firebase mein (audit ke liye)
    await this.chatBackendSocket.updateBroadcast({
      broadcastId,
      updates: {
        deleted: true,
        deletedAt: Date.now(),
      }
    });

    // Remove from local state immediately
    const broadcasts = this._broadcasts$.value.filter(
      (b) => b.broadcastId !== broadcastId
    );
    this._broadcasts$.next(broadcasts);

    console.log(`🗑️ Broadcast ${broadcastId} deleted`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GETTERS / HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  get currentBroadcasts(): BroadcastList[] {
    return this._broadcasts$.value;
  }

  getMemberCount(broadcast: BroadcastList): number {
    return broadcast.members?.length ?? 0;
  }

  /**
   * Cleanup all realtime listeners
   * Call this on app destroy / logout
   */
  cleanupListeners(): void {
    if (this._listenerUnsub) {
      try { this._listenerUnsub(); } catch {}
      this._listenerUnsub = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Same logic as getRoomIdFor1To1() in FirebaseChatService
   * Sort karo taaki sender-receiver aur receiver-sender same ID de
   */
  private _getRoomIdFor1To1(userId1: string, userId2: string): string {
    return userId1 < userId2
      ? `${userId1}_${userId2}`
      : `${userId2}_${userId1}`;
  }

  /**
   * Broadcast document mein lastMessage update karo
   */
  private async _updateBroadcastLastMessage(
    broadcastId: string,
    userId: string,
    messageText: string,
    messageType: string,
    timestamp: number
  ): Promise<void> {
    try {
      const broadcastRef = rtdbRef(
        this.db,
        `broadcasts/${userId}/${broadcastId}`
      );
      await this.chatBackendSocket.updateBroadcast({
        broadcastId,
        updates: {
          lastMessage: messageText,
          lastMessageTime: timestamp,
          lastMessageType: messageType,
        }
      });

      // Update local BehaviorSubject
      const broadcasts = this._broadcasts$.value;
      const idx = broadcasts.findIndex((b) => b.broadcastId === broadcastId);
      if (idx >= 0) {
        const updated = [...broadcasts];
        updated[idx] = {
          ...updated[idx],
          lastMessage: messageText,
          lastMessageTime: timestamp,
          lastMessageType: messageType,
        };
        this._broadcasts$.next(updated);
      }
    } catch (err) {
      console.warn('⚠️ Failed to update broadcast last message:', err);
    }
  }
}