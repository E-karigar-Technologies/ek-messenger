import { Injectable } from '@angular/core';
import PouchDB from 'pouchdb';
import { IConversation, IMessage, IAttachment } from './sqlite.service';

export interface CachedMessage extends IMessage {
  isPending?: boolean;
  syncStatus?: 'synced' | 'pending' | 'failed';
  localTimestamp?: number;
}

export interface NonPlatformUser {
  username: string;
  phoneNumber: string;
}

export interface CachedConversation extends IConversation {
  syncStatus?: 'synced' | 'pending';
  lastSyncedAt?: number;
}

export interface PendingChatAction {
  type: 'send_message' | 'delete_message' | 'edit_message' | 'mark_read' | 'mark_delivered';
  conversationId: string;
  messageId?: string;
  data: any;
  timestamp: number;
  retryCount?: number;
  userId: string;
}

export interface CachedCommunity {
  id: string;
  name: string;
  icon: string;
  groups: CommunityGroup[];
  displayGroups: CommunityGroup[];
  totalGroups: number;
  hasMore: boolean;
  syncStatus?: 'synced' | 'pending';
  lastSyncedAt?: number;
}

export interface CommunityGroup {
  id: string;
  name: string;
  type: string;
  createdAt?: number;
  isSystemGroup?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-platform contact interface (device contacts NOT on TellDemm)
// ─────────────────────────────────────────────────────────────────────────────
export interface NonPlatformUser {
  username: string;
  phoneNumber: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic conflict-safe put helper
// ─────────────────────────────────────────────────────────────────────────────
const MAX_RETRIES = 5;

async function safePut(
  db: PouchDB.Database,
  docId: string,
  buildPayload: (rev?: string) => Record<string, any>
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let rev: string | undefined;
      try {
        const existing = await db.get(docId);
        rev = existing._rev;
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }

      await db.put({
        _id: docId,
        ...(rev ? { _rev: rev } : {}),
        ...buildPayload(rev),
      });

      return;
    } catch (err: any) {
      if (err.status === 409 && attempt < MAX_RETRIES - 1) {
        const delay = 20 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`[PouchDB] safePut failed for "${docId}" after ${attempt + 1} attempts:`, err);
        throw err;
      }
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class ChatPouchDb {
  private db: PouchDB.Database;
  private saveTimers: Map<string, any> = new Map();
  private writeQueue: Map<string, Promise<void>> = new Map();

  constructor() {
    this.db = new PouchDB('chat_unified_db');
  }

  private enqueueWrite(docId: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.writeQueue.get(docId) ?? Promise.resolve();
    const next = prev.then(fn).catch(() => {});
    this.writeQueue.set(docId, next);
    return next;
  }

  /* =========================
     CONVERSATIONS - ENHANCED
     ========================= */

  async updateConversationField(
    userId: string,
    conversationId: string,
    updates: Partial<CachedConversation>
  ): Promise<void> {
    try {
      const conversations = await this.getConversations(userId);
      const index = conversations.findIndex(c => c.roomId === conversationId);

      if (index >= 0) {
        conversations[index] = {
          ...conversations[index],
          ...updates,
          lastSyncedAt: Date.now(),
          syncStatus: 'synced'
        };
      } else {
        const newConv: CachedConversation = {
          roomId: conversationId,
          ...updates,
          lastSyncedAt: Date.now(),
          syncStatus: 'synced'
        } as CachedConversation;
        conversations.push(newConv);
      }

      await this.saveConversations(userId, conversations, true);
    } catch (error) {
      console.error('❌ Failed to update conversation field:', error);
    }
  }

  async updateConversationUnreadCount(
    userId: string,
    conversationId: string,
    unreadCount: number
  ): Promise<void> {
    try {
      const conversations = await this.getConversations(userId);
      const index = conversations.findIndex(c => c.roomId === conversationId);
      if (index >= 0) {
        conversations[index].unreadCount = unreadCount;
        conversations[index].lastSyncedAt = Date.now();
        await this.saveConversations(userId, conversations, true);
      }
    } catch (error) {
      console.error('❌ Failed to update unread count:', error);
    }
  }

  async updateConversationLastMessage(
    userId: string,
    conversationId: string,
    lastMessage: string,
    lastMessageType: string,
    lastMessageAt: Date | number
  ): Promise<void> {
    try {
      const updates: Partial<CachedConversation> = {
        lastMessage,
        lastMessageType: lastMessageType as any,
        lastMessageAt: lastMessageAt instanceof Date ? lastMessageAt : new Date(lastMessageAt),
        updatedAt: new Date()
      };
      await this.updateConversationField(userId, conversationId, updates);
    } catch (error) {
      console.error('❌ Failed to update last message:', error);
    }
  }

  async updateConversationPinStatus(
    userId: string,
    conversationId: string,
    isPinned: boolean,
    pinnedAt?: number | null
  ): Promise<void> {
    try {
      await this.updateConversationField(userId, conversationId, {
        isPinned,
        pinnedAt: pinnedAt || null
      });
    } catch (error) {
      console.error('❌ Failed to update pin status:', error);
    }
  }

  async updateConversationArchiveStatus(
    userId: string,
    conversationId: string,
    isArchived: boolean
  ): Promise<void> {
    try {
      await this.updateConversationField(userId, conversationId, { isArchived });
    } catch (error) {
      console.error('❌ Failed to update archive status:', error);
    }
  }

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    try {
      const conversations = await this.getConversations(userId);
      const filtered = conversations.filter(c => c.roomId !== conversationId);
      await this.saveConversations(userId, filtered, true);
      await this.deleteAllMessages(conversationId);
    } catch (error) {
      console.error('❌ Failed to delete conversation:', error);
    }
  }

  async saveConversations(
    userId: string,
    conversations: CachedConversation[],
    immediate: boolean = false
  ): Promise<void> {
    const docId = `conversations_${userId}`;
    const timerKey = docId;

    if (!immediate) {
      if (this.saveTimers.has(timerKey)) {
        clearTimeout(this.saveTimers.get(timerKey));
      }
      await new Promise<void>(resolve => {
        const t = setTimeout(() => {
          this.saveTimers.delete(timerKey);
          resolve();
        }, 500);
        this.saveTimers.set(timerKey, t);
      });
    }

    return this.enqueueWrite(docId, () =>
      safePut(this.db, docId, () => ({
        conversations,
        userId,
        timestamp: Date.now(),
      }))
    );
  }

  async getConversations(userId: string): Promise<CachedConversation[]> {
    try {
      const doc: any = await this.db.get(`conversations_${userId}`);
      return doc.conversations || [];
    } catch (err: any) {
      if (err.status === 404) return [];
      console.error('❌ Failed to get conversations:', err);
      return [];
    }
  }

  async saveConversation(conversation: CachedConversation, immediate: boolean = false): Promise<void> {
    const docId = `conversation_${conversation.roomId}`;

    const doSave = () =>
      this.enqueueWrite(docId, () =>
        safePut(this.db, docId, () => ({
          ...conversation,
          timestamp: Date.now(),
        }))
      );

    if (immediate) {
      return doSave();
    }

    if (this.saveTimers.has(docId)) clearTimeout(this.saveTimers.get(docId));
    const t = setTimeout(() => {
      this.saveTimers.delete(docId);
      doSave();
    }, 300);
    this.saveTimers.set(docId, t);
  }

  async getConversation(conversationId: string): Promise<CachedConversation | null> {
    try {
      const doc: any = await this.db.get(`conversation_${conversationId}`);
      const { _id, _rev, timestamp, ...conversation } = doc;
      return conversation as CachedConversation;
    } catch (err: any) {
      if (err.status === 404) return null;
      console.error('❌ Failed to get conversation:', err);
      return null;
    }
  }

  /* =========================
     MESSAGES - ENHANCED
     ========================= */

  async saveMessages(
    roomId: string,
    messages: IMessage[],
    immediate = false
  ): Promise<void> {
    const docId = `messages_${roomId}`;
    return this.enqueueWrite(docId, () => this._doSaveMessages(docId, messages));
  }

  private async _doSaveMessages(docId: string, messages: IMessage[]): Promise<void> {
    return safePut(this.db, docId, () => ({ messages }));
  }

  async getMessages(conversationId: string): Promise<CachedMessage[]> {
    try {
      const doc: any = await this.db.get(`messages_${conversationId}`);
      const messages: CachedMessage[] = doc.messages || [];
      return messages.sort((a: any, b: any) => {
        return new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime();
      });
    } catch (err: any) {
      if (err.status === 404) return [];
      console.error('❌ Failed to get messages:', err);
      return [];
    }
  }

  async getMessagesPaginated(
    conversationId: string,
    options: { limit?: number; endBeforeTimestamp?: number; userId?: string } = {}
  ): Promise<{
    messages: CachedMessage[];
    hasMore: boolean;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  }> {
    const limit = options.limit ?? 20;
    const endBeforeTimestamp = options.endBeforeTimestamp;
    const userId = options.userId;

    try {
      const all = await this.getMessages(conversationId);

      const visibleMessages = userId
        ? all.filter(msg => {
            if (msg.deletedFor?.users && Array.isArray(msg.deletedFor.users)) {
              if (msg.deletedFor.users.includes(userId)) return false;
            }
            return true;
          })
        : all;

      const getTs = (m: any) => new Date(m.timestamp ?? 0).getTime();

      let slice: CachedMessage[];
      if (endBeforeTimestamp == null) {
        slice = visibleMessages.length <= limit ? visibleMessages : visibleMessages.slice(-limit);
      } else {
        const older = visibleMessages.filter(m => getTs(m) < endBeforeTimestamp);
        slice = older.length <= limit ? older : older.slice(-limit);
      }

      const hasMore =
        endBeforeTimestamp == null
          ? visibleMessages.length > limit
          : visibleMessages.filter(m => getTs(m) < endBeforeTimestamp).length > limit;

      return {
        messages: slice,
        hasMore,
        oldestTimestamp: slice.length > 0 ? getTs(slice[0]) : null,
        newestTimestamp: slice.length > 0 ? getTs(slice[slice.length - 1]) : null,
      };
    } catch (err: any) {
      if (err.status === 404) {
        return { messages: [], hasMore: false, oldestTimestamp: null, newestTimestamp: null };
      }
      console.error('❌ [PouchDB getMessagesPaginated] Failed:', err);
      return { messages: [], hasMore: false, oldestTimestamp: null, newestTimestamp: null };
    }
  }

  async addMessage(conversationId: string, message: CachedMessage): Promise<void> {
    try {
      const messages = await this.getMessages(conversationId);
      const existingIndex = messages.findIndex(m => m.msgId === message.msgId);
      if (existingIndex >= 0) {
        messages[existingIndex] = message;
      } else {
        messages.push(message);
      }
      messages.sort((a, b) => (a.timestamp as any) - (b.timestamp as any));
      await this.saveMessages(conversationId, messages, true);
    } catch (error) {
      console.error('❌ Failed to add message:', error);
    }
  }

  async updateMessage(conversationId: string, messageId: string, updates: Partial<CachedMessage>): Promise<void> {
    try {
      const messages = await this.getMessages(conversationId);
      const index = messages.findIndex(m => m.msgId === messageId);
      if (index >= 0) {
        messages[index] = { ...messages[index], ...updates };
        await this.saveMessages(conversationId, messages, true);
      }
    } catch (error) {
      console.error('❌ Failed to update message:', error);
    }
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    try {
      const messages = await this.getMessages(conversationId);
      await this.saveMessages(conversationId, messages.filter(m => m.msgId !== messageId), true);
    } catch (error) {
      console.error('❌ Failed to delete message:', error);
    }
  }

  async deleteAllMessages(conversationId: string): Promise<void> {
    try {
      await this.saveMessages(conversationId, [], true);
    } catch (error) {
      console.error('❌ Failed to delete all messages:', error);
    }
  }

  async getMessageById(conversationId: string, msgId: string): Promise<CachedMessage | null> {
    try {
      const messages = await this.getMessages(conversationId);
      return messages.find(m => m.msgId === msgId) ?? null;
    } catch (error) {
      console.error('❌ [PouchDB getMessageById] Failed:', error);
      return null;
    }
  }

  async getLastVisibleMessage(roomId: string, userId: string): Promise<IMessage | null> {
    const messages = await this.getMessages(roomId);
    const visible = messages
      .filter(msg => !msg.deletedFor?.users?.includes(userId))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return visible[0] || null;
  }

  /* =========================
     PENDING ACTIONS QUEUE
     ========================= */

  async enqueueAction(action: PendingChatAction): Promise<void> {
    try {
      const docId = 'chat_action_queue';
      await this.enqueueWrite(docId, async () => {
        const queueDoc = await this.getOrCreateQueue();
        queueDoc.actions.push(action);
        await safePut(this.db, docId, () => ({ actions: queueDoc.actions }));
      });
    } catch (error) {
      console.error('❌ Failed to enqueue action:', error);
    }
  }

  async getQueue(): Promise<PendingChatAction[]> {
    try {
      const doc: any = await this.db.get('chat_action_queue');
      return doc.actions || [];
    } catch (err: any) {
      if (err.status === 404) return [];
      console.error('❌ Failed to get queue:', err);
      return [];
    }
  }

  async removeFromQueue(actionIndex: number): Promise<void> {
    try {
      const doc: any = await this.db.get('chat_action_queue');
      doc.actions.splice(actionIndex, 1);
      await this.db.put(doc);
    } catch (error) {
      console.error('❌ Failed to remove from queue:', error);
    }
  }

  async clearQueue(): Promise<void> {
    try {
      await safePut(this.db, 'chat_action_queue', () => ({ actions: [] }));
    } catch (err: any) {
      if (err.status !== 404) {
        console.error('❌ Failed to clear queue:', err);
      }
    }
  }

  private async getOrCreateQueue(): Promise<any> {
    try {
      return await this.db.get('chat_action_queue');
    } catch (err: any) {
      if (err.status === 404) {
        const newQueue = { _id: 'chat_action_queue', actions: [] };
        await this.db.put(newQueue);
        return { ...newQueue, _rev: undefined };
      }
      throw err;
    }
  }

  /* =========================
     ATTACHMENTS
     ========================= */

  async cacheAttachment(messageId: string, attachment: IAttachment): Promise<void> {
    try {
      await safePut(this.db, `attachment_${messageId}`, () => ({
        attachment,
        messageId,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('❌ Failed to cache attachment:', error);
    }
  }

  async getAttachment(messageId: string): Promise<IAttachment | null> {
    try {
      const doc: any = await this.db.get(`attachment_${messageId}`);
      return doc.attachment || null;
    } catch (err: any) {
      if (err.status === 404) return null;
      console.error('❌ Failed to get attachment:', err);
      return null;
    }
  }

  async updateAttachment(messageId: string, updates: Partial<IAttachment>): Promise<void> {
    try {
      const docId = `attachment_${messageId}`;
      await this.enqueueWrite(docId, async () => {
        let existing: any = {};
        try {
          existing = await this.db.get(docId);
        } catch (e: any) {
          if (e.status !== 404) throw e;
        }
        await safePut(this.db, docId, () => ({
          attachment: { ...(existing.attachment || {}), ...updates },
          messageId,
          timestamp: Date.now(),
        }));
      });
    } catch (err: any) {
      if (err.status === 404) {
        console.warn(`⚠️ [PouchDB] Attachment not found for ${messageId}`);
      } else {
        console.error('❌ [PouchDB] Failed to update attachment:', err);
      }
    }
  }

  /* =========================
     PRESENCE & TYPING
     ========================= */

  async cachePresence(userId: string, presence: { isOnline: boolean; lastSeen: number | null }): Promise<void> {
    try {
      await safePut(this.db, `presence_${userId}`, () => ({
        presence,
        userId,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('❌ Failed to cache presence:', error);
    }
  }

  async getPresence(userId: string): Promise<{ isOnline: boolean; lastSeen: number | null } | null> {
    try {
      const doc: any = await this.db.get(`presence_${userId}`);
      return doc.presence || null;
    } catch {
      return null;
    }
  }

  async getTypingUsers(roomId: string): Promise<string[]> {
    try {
      const doc: any = await this.db.get(`typing_${roomId}`);
      const now = Date.now();
      return Object.entries(doc.typingUsers || {})
        .filter(([, ts]) => now - (ts as number) < 5000)
        .map(([uid]) => uid);
    } catch {
      return [];
    }
  }

  /* =========================
     PLATFORM USERS
     ========================= */

  async savePlatformUsers(users: any[]): Promise<void> {
    try {
      await safePut(this.db, 'platform_users', () => ({
        users,
        timestamp: Date.now(),
      }));
      console.log(`✅ [PouchDB] Saved ${users.length} platform users`);
    } catch (error) {
      console.error('❌ Failed to save platform users:', error);
    }
  }

  async getPlatformUsers(): Promise<any[]> {
    try {
      const doc: any = await this.db.get('platform_users');
      return doc.users || [];
    } catch (err: any) {
      if (err.status === 404) return [];
      return [];
    }
  }

  /* =========================
     NON-PLATFORM USERS  ← NEW
     Device contacts NOT on TellDemm — saved separately so they
     survive app restart and work offline (just like platform users).
     Doc key: 'non_platform_users'
     ========================= */

  /**
   * Save device contacts that are NOT on TellDemm.
   * Overwrites the entire list (same pattern as savePlatformUsers).
   */
  async saveNonPlatformUsers(users: NonPlatformUser[]): Promise<void> {
    try {
      await safePut(this.db, 'non_platform_users', () => ({
        users,
        timestamp: Date.now(),
      }));
      console.log(`✅ [PouchDB] Saved ${users.length} non-platform users`);
    } catch (error) {
      console.error('❌ Failed to save non-platform users:', error);
    }
  }

  /**
   * Read cached non-platform users.
   * Returns [] if never saved (first launch / cleared).
   */
  async getNonPlatformUsers(): Promise<NonPlatformUser[]> {
    try {
      const doc: any = await this.db.get('non_platform_users');
      return doc.users || [];
    } catch (err: any) {
      if (err.status === 404) return [];
      console.error('❌ Failed to get non-platform users:', err);
      return [];
    }
  }

  /**
   * Clear cached non-platform users (e.g. on logout).
   */
  async clearNonPlatformUsers(): Promise<void> {
    try {
      const doc = await this.db.get('non_platform_users');
      await this.db.remove(doc);
      console.log('✅ [PouchDB] Cleared non-platform users');
    } catch (err: any) {
      if (err.status !== 404) console.error('❌ Failed to clear non-platform users:', err);
    }
  }

  /* =========================
     COMMUNITIES
     ========================= */

  async saveCommunities(userId: string, communities: CachedCommunity[], immediate: boolean = false): Promise<void> {
    const docId = `communities_${userId}`;

    const doSave = () =>
      this.enqueueWrite(docId, () =>
        safePut(this.db, docId, () => ({
          communities,
          userId,
          timestamp: Date.now(),
        }))
      );

    if (immediate) return doSave();

    if (this.saveTimers.has(docId)) clearTimeout(this.saveTimers.get(docId));
    const t = setTimeout(() => {
      this.saveTimers.delete(docId);
      doSave();
    }, 500);
    this.saveTimers.set(docId, t);
  }

  async getCommunities(userId: string): Promise<CachedCommunity[]> {
    try {
      const doc: any = await this.db.get(`communities_${userId}`);
      return doc.communities || [];
    } catch (err: any) {
      if (err.status === 404) return [];
      console.error('❌ Failed to get communities:', err);
      return [];
    }
  }

  async updateCommunity(userId: string, communityId: string, updates: Partial<CachedCommunity>): Promise<void> {
    try {
      const communities = await this.getCommunities(userId);
      const index = communities.findIndex(c => c.id === communityId);
      if (index >= 0) {
        communities[index] = { ...communities[index], ...updates, lastSyncedAt: Date.now(), syncStatus: 'synced' };
        await this.saveCommunities(userId, communities, true);
      }
    } catch (error) {
      console.error('❌ Failed to update community:', error);
    }
  }

  async deleteCommunity(userId: string, communityId: string): Promise<void> {
    try {
      const communities = await this.getCommunities(userId);
      await this.saveCommunities(userId, communities.filter(c => c.id !== communityId), true);
    } catch (error) {
      console.error('❌ Failed to delete community:', error);
    }
  }

  async saveCommunityGroups(communityId: string, groups: CommunityGroup[], immediate: boolean = false): Promise<void> {
    const docId = `community_groups_${communityId}`;

    const doSave = () =>
      this.enqueueWrite(docId, () =>
        safePut(this.db, docId, () => ({
          groups,
          communityId,
          timestamp: Date.now(),
        }))
      );

    if (immediate) return doSave();

    if (this.saveTimers.has(docId)) clearTimeout(this.saveTimers.get(docId));
    const t = setTimeout(() => {
      this.saveTimers.delete(docId);
      doSave();
    }, 500);
    this.saveTimers.set(docId, t);
  }

  async getCommunityGroups(communityId: string): Promise<CommunityGroup[]> {
    try {
      const doc: any = await this.db.get(`community_groups_${communityId}`);
      return doc.groups || [];
    } catch (err: any) {
      if (err.status === 404) return [];
      console.error('❌ Failed to get community groups:', err);
      return [];
    }
  }

  /* =========================
     GROUP MANAGEMENT
     ========================= */

  async saveGroup(groupId: string, groupData: any, immediate: boolean = false): Promise<void> {
    const docId = `group_${groupId}`;

    const doSave = () =>
      this.enqueueWrite(docId, () =>
        safePut(this.db, docId, () => ({
          ...groupData,
          timestamp: Date.now(),
        }))
      );

    if (immediate) return doSave();

    if (this.saveTimers.has(docId)) clearTimeout(this.saveTimers.get(docId));
    const t = setTimeout(() => {
      this.saveTimers.delete(docId);
      doSave();
    }, 300);
    this.saveTimers.set(docId, t);
  }

  async getGroup(groupId: string): Promise<any | null> {
    try {
      const doc: any = await this.db.get(`group_${groupId}`);
      const { _id, _rev, timestamp, ...groupData } = doc;
      return groupData;
    } catch (err: any) {
      if (err.status === 404) return null;
      console.error('❌ Failed to get group:', err);
      return null;
    }
  }

  async updateGroupMembers(groupId: string, members: any): Promise<void> {
    try {
      const group = await this.getGroup(groupId);
      if (group) {
        group.members = members;
        await this.saveGroup(groupId, group, true);
      }
    } catch (error) {
      console.error('❌ Failed to update group members:', error);
    }
  }

  async updateGroupAdmins(groupId: string, adminIds: string[]): Promise<void> {
    try {
      const group = await this.getGroup(groupId);
      if (group) {
        group.adminIds = adminIds;
        await this.saveGroup(groupId, group, true);
      }
    } catch (error) {
      console.error('❌ Failed to update group admins:', error);
    }
  }

  /* =========================
     PINNED MESSAGES
     ========================= */

  async cachePinnedMessage(roomId: string, pinnedMessage: any): Promise<void> {
    try {
      await safePut(this.db, `pinned_${roomId}`, () => ({
        pinnedMessage,
        roomId,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('❌ Failed to cache pinned message:', error);
    }
  }

  async getPinnedMessage(roomId: string): Promise<any | null> {
    try {
      const doc: any = await this.db.get(`pinned_${roomId}`);
      return doc.pinnedMessage || null;
    } catch {
      return null;
    }
  }

  async removePinnedMessage(roomId: string): Promise<void> {
    try {
      const doc = await this.db.get(`pinned_${roomId}`);
      await this.db.remove(doc);
    } catch (err: any) {
      if (err.status !== 404) console.error('❌ Failed to remove pinned message:', err);
    }
  }

  /* =========================
     UNREAD COUNTS
     ========================= */

  // Debounce timers per doc key: rapid calls for the same room/user collapse
  // into a single write (latest value always wins — older values are irrelevant).
  private _unreadDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private _unreadPendingValues = new Map<string, number>();

  async updateUnreadCount(roomId: string, userId: string, count: number): Promise<void> {
    const docId = `unread_${roomId}_${userId}`;

    // Always store the latest value; any pending timer will use it.
    this._unreadPendingValues.set(docId, count);

    // If a write is already scheduled for this key, let it pick up the latest value.
    if (this._unreadDebounceTimers.has(docId)) return;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this._unreadDebounceTimers.delete(docId);
        const latestCount = this._unreadPendingValues.get(docId) ?? count;
        this._unreadPendingValues.delete(docId);

        // Use enqueueWrite so concurrent calls to the same doc never race.
        this.enqueueWrite(docId, () =>
          safePut(this.db, docId, () => ({
            count: latestCount,
            roomId,
            userId,
            timestamp: Date.now(),
          }))
        ).catch((err) => {
          console.error('❌ Failed to update unread count:', err);
        }).finally(resolve);
      }, 80); // 80 ms debounce — collapses N rapid calls into 1 write

      this._unreadDebounceTimers.set(docId, timer);
    });
  }

  async getUnreadCount(roomId: string, userId: string): Promise<number> {
    try {
      const doc: any = await this.db.get(`unread_${roomId}_${userId}`);
      return doc.count || 0;
    } catch {
      return 0;
    }
  }

  /* =========================
     MUTED CHATS
     ========================= */

  async updateMutedChats(userId: string, mutedChats: string[]): Promise<void> {
    try {
      await safePut(this.db, `muted_chats_${userId}`, () => ({
        mutedChats,
        userId,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('❌ Failed to update muted chats:', error);
    }
  }

  async getMutedChats(userId: string): Promise<string[]> {
    try {
      const doc: any = await this.db.get(`muted_chats_${userId}`);
      return doc.mutedChats || [];
    } catch {
      return [];
    }
  }

  /* =========================
     MESSAGE RECEIPTS
     ========================= */

  async updateMessageReceipts(conversationId: string, messageId: string, receipts: any): Promise<void> {
    try {
      const messages = await this.getMessages(conversationId);
      const index = messages.findIndex(m => m.msgId === messageId);
      if (index >= 0) {
        messages[index].receipts = receipts;
        await this.saveMessages(conversationId, messages, true);
      }
    } catch (error) {
      console.error('❌ Failed to update message receipts:', error);
    }
  }

  /* =========================
     BACKGROUND DELETION SYNC
     ========================= */

  async updateMessageDeletionStatus(
    conversationId: string,
    messageId: string,
    deletedForEveryone: boolean = true,
    deletedForUsers: string[] = []
  ): Promise<void> {
    try {
      const messages = await this.getMessages(conversationId);
      const index = messages.findIndex(m => m.msgId === messageId);
      if (index >= 0) {
        messages[index].deletedFor = { everyone: deletedForEveryone, users: deletedForUsers };
        await this.saveMessages(conversationId, messages, true);
      }
    } catch (error) {
      console.error('❌ [PouchDB] Failed to update message deletion status:', error);
      throw error;
    }
  }

  async removeMessageFromCache(conversationId: string, messageId: string): Promise<void> {
    try {
      const messages = await this.getMessages(conversationId);
      await this.saveMessages(conversationId, messages.filter(m => m.msgId !== messageId), true);
    } catch (error) {
      console.error('❌ [PouchDB] Failed to remove message from cache:', error);
      throw error;
    }
  }

  async getCachedConversation(conversationId: string): Promise<CachedConversation | null> {
    try {
      const singleConv = await this.getConversation(conversationId);
      if (singleConv) return singleConv;

      const allDocs = await this.db.allDocs({
        include_docs: true,
        startkey: 'conversations_',
        endkey: 'conversations_\uffff'
      });

      for (const row of allDocs.rows) {
        const doc: any = row.doc;
        if (doc.conversations && Array.isArray(doc.conversations)) {
          const conv = doc.conversations.find((c: any) => c.roomId === conversationId);
          if (conv) return conv as CachedConversation;
        }
      }
      return null;
    } catch (error) {
      console.error('❌ [PouchDB] Failed to get cached conversation:', error);
      return null;
    }
  }

  async updateConversationAfterDeletion(
    userId: string,
    conversationId: string,
    newLastMessage?: { text: string; type: string; timestamp: number; msgId?: string; }
  ): Promise<void> {
    try {
      if (newLastMessage) {
        await this.updateConversationLastMessage(userId, conversationId, newLastMessage.text, newLastMessage.type, newLastMessage.timestamp);
      } else {
        await this.updateConversationField(userId, conversationId, {
          lastMessage: '',
          lastMessageType: 'text' as any,
          lastMessageAt: new Date(),
          updatedAt: new Date()
        });
      }
    } catch (error) {
      console.error('❌ [PouchDB] Failed to update conversation after deletion:', error);
      throw error;
    }
  }

  async cacheConversation(conversation: CachedConversation): Promise<void> {
    try {
      await this.saveConversation(conversation, true);
    } catch (error) {
      console.error('❌ [PouchDB] Failed to cache conversation:', error);
      throw error;
    }
  }

  async getDeletedMessages(conversationId: string, userId: string): Promise<string[]> {
    try {
      const messages = await this.getMessages(conversationId);
      return messages
        .filter(msg =>
          msg.deletedFor?.everyone === true ||
          (msg.deletedFor?.users && msg.deletedFor.users.includes(userId))
        )
        .map(msg => msg.msgId);
    } catch (error) {
      console.error('❌ [PouchDB] Failed to get deleted messages:', error);
      return [];
    }
  }

  async getMessageDeletionStatus(conversationId: string, messageId: string): Promise<{
    exists: boolean;
    deletedForEveryone: boolean;
    deletedForUsers: string[];
  } | null> {
    try {
      const messages = await this.getMessages(conversationId);
      const message = messages.find(m => m.msgId === messageId);
      if (!message) return { exists: false, deletedForEveryone: false, deletedForUsers: [] };
      return {
        exists: true,
        deletedForEveryone: message.deletedFor?.everyone === true,
        deletedForUsers: message.deletedFor?.users || []
      };
    } catch (error) {
      console.error('❌ [PouchDB] Failed to get message deletion status:', error);
      return null;
    }
  }

  async getAllConversations(): Promise<CachedConversation[]> {
    try {
      const allConversations: CachedConversation[] = [];

      const listDocs = await this.db.allDocs({
        include_docs: true,
        startkey: 'conversations_',
        endkey: 'conversations_\uffff'
      });
      for (const row of listDocs.rows) {
        const doc: any = row.doc;
        if (doc.conversations && Array.isArray(doc.conversations)) {
          allConversations.push(...doc.conversations);
        }
      }

      const singleDocs = await this.db.allDocs({
        include_docs: true,
        startkey: 'conversation_',
        endkey: 'conversation_\uffff'
      });
      for (const row of singleDocs.rows) {
        const doc: any = row.doc;
        const { _id, _rev, timestamp, ...conv } = doc;
        allConversations.push(conv as CachedConversation);
      }

      return allConversations;
    } catch (error) {
      console.error('❌ [PouchDB] Failed to get all conversations:', error);
      return [];
    }
  }

  /* =========================
     BATCH OPERATIONS
     ========================= */

  async batchUpdateConversations(userId: string, updates: Array<{ roomId: string; updates: Partial<CachedConversation> }>): Promise<void> {
    try {
      const conversations = await this.getConversations(userId);
      for (const { roomId, updates: convUpdates } of updates) {
        const index = conversations.findIndex(c => c.roomId === roomId);
        if (index >= 0) {
          conversations[index] = { ...conversations[index], ...convUpdates, lastSyncedAt: Date.now() };
        }
      }
      await this.saveConversations(userId, conversations, true);
    } catch (error) {
      console.error('❌ Failed to batch update conversations:', error);
    }
  }

  /* =========================
     USER PROFILES CACHE
     ========================= */

  async cacheUserProfile(userId: string, profile: any): Promise<void> {
    try {
      const docId = `user_profile_${userId}`;
      await this.enqueueWrite(docId, async () => {
        let existingProfile = {};
        try {
          const existing: any = await this.db.get(docId);
          existingProfile = existing.profile || {};
        } catch (e: any) {
          if (e.status !== 404) throw e;
        }
        await safePut(this.db, docId, () => ({
          profile: { ...existingProfile, ...profile },
          userId,
          timestamp: Date.now(),
        }));
      });
    } catch (error) {
      console.error('❌ Failed to cache user profile:', error);
    }
  }

  async getCachedUserProfile(userId: string): Promise<any | null> {
    try {
      const doc: any = await this.db.get(`user_profile_${userId}`);
      return doc.profile || null;
    } catch (err: any) {
      if (err.status === 404) return null;
      console.error('❌ Failed to get user profile:', err);
      return null;
    }
  }

  /* =========================
     GROUP DETAILS CACHE
     ========================= */

  async cacheGroupDetails(groupId: string, groupDetails: { meta: any; members: any[]; adminIds: string[]; }): Promise<void> {
    try {
      await safePut(this.db, `group_details_${groupId}`, () => ({
        ...groupDetails,
        groupId,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('❌ Failed to cache group details:', error);
    }
  }

  async getCachedGroupDetails(groupId: string): Promise<{ meta: any; members: any[]; adminIds: string[]; } | null> {
    try {
      const doc: any = await this.db.get(`group_details_${groupId}`);
      return { meta: doc.meta || null, members: doc.members || [], adminIds: doc.adminIds || [] };
    } catch (err: any) {
      if (err.status === 404) return null;
      console.error('❌ Failed to get group details:', err);
      return null;
    }
  }

  async cacheCommonGroups(userId1: string, userId2: string, groups: any[]): Promise<void> {
    try {
      await safePut(this.db, `common_groups_${userId1}_${userId2}`, () => ({
        groups, userId1, userId2, timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('❌ Failed to cache common groups:', error);
    }
  }

  async getCachedCommonGroups(userId1: string, userId2: string): Promise<any[] | null> {
    try {
      const doc: any = await this.db.get(`common_groups_${userId1}_${userId2}`);
      return doc.groups || [];
    } catch {
      return null;
    }
  }

  async cacheSocialMediaLinks(userId: string, links: any[]): Promise<void> {
    try {
      await safePut(this.db, `social_media_${userId}`, () => ({
        links, userId, timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('❌ Failed to cache social media:', error);
    }
  }

  async getCachedSocialMediaLinks(userId: string): Promise<any[]> {
    try {
      const doc: any = await this.db.get(`social_media_${userId}`);
      return doc.links || [];
    } catch {
      return [];
    }
  }

  /* =========================
     PAST MEMBERS CACHE
     ========================= */

  async cachePastMembers(groupId: string, pastMembers: any[]): Promise<void> {
    try {
      await safePut(this.db, `past_members_${groupId}`, () => ({
        pastMembers, groupId, timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('❌ Failed to cache past members:', error);
    }
  }

  async getCachedPastMembers(groupId: string): Promise<any[]> {
    try {
      const doc: any = await this.db.get(`past_members_${groupId}`);
      return doc.pastMembers || [];
    } catch (err: any) {
      if (err.status === 404) return [];
      console.error('❌ Failed to get cached past members:', err);
      return [];
    }
  }

  async clearCachedPastMembers(groupId: string): Promise<void> {
    try {
      const doc = await this.db.get(`past_members_${groupId}`);
      await this.db.remove(doc);
    } catch (err: any) {
      if (err.status !== 404) console.error('❌ Failed to clear cached past members:', err);
    }
  }

  async cacheContactName(userId: string, contactName: string): Promise<void> {
    try {
      await safePut(this.db, `contact_name_${userId}`, () => ({
        contactName, userId, timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('❌ Failed to cache contact name:', error);
    }
  }

  async getCachedContactName(userId: string): Promise<string | null> {
    try {
      const doc: any = await this.db.get(`contact_name_${userId}`);
      return doc.contactName || null;
    } catch {
      return null;
    }
  }

  async updateGroupMemberContactNames(groupId: string, updates: Map<string, string>): Promise<void> {
    try {
      const groupDetails = await this.getCachedGroupDetails(groupId);
      if (groupDetails?.members) {
        groupDetails.members.forEach(member => {
          const newName = updates.get(member.user_id);
          if (newName) member.contactName = newName;
        });
        await this.cacheGroupDetails(groupId, groupDetails);
      }
    } catch (error) {
      console.error('❌ Failed to update contact names:', error);
    }
  }

  /* =========================
     MESSAGE INFO CACHE
     ========================= */

  async getCachedMessageInfo(conversationId: string, messageId: string): Promise<CachedMessage | null> {
    try {
      const messages = await this.getMessages(conversationId);
      return messages.find(m => m.msgId === messageId) ?? null;
    } catch (error) {
      console.error('❌ Failed to get cached message info:', error);
      return null;
    }
  }

  async getCachedMessageReceipts(conversationId: string, messageId: string): Promise<{
    readBy: any[]; deliveredTo: any[];
  } | null> {
    try {
      const message = await this.getCachedMessageInfo(conversationId, messageId);
      if (!message?.receipts) return null;
      return {
        readBy: message.receipts.read?.readBy || [],
        deliveredTo: message.receipts.delivered?.deliveredTo || []
      };
    } catch (error) {
      console.error('❌ Failed to get cached receipts:', error);
      return null;
    }
  }

  /* =========================
     CLEAR DATA FUNCTIONS
     ========================= */

  async clearAll(): Promise<void> {
    try {
      await this.flushPendingSaves();
      await this.db.destroy();
      this.db = new PouchDB('chat_unified_db');
      this.writeQueue.clear();
    } catch (error) {
      console.error('❌ Failed to clear database:', error);
      throw error;
    }
  }

  async clearUserConversations(userId: string): Promise<void> {
    try {
      const docId = `conversations_${userId}`;
      try {
        const doc = await this.db.get(docId);
        await this.db.remove(doc);
      } catch (err: any) {
        if (err.status !== 404) throw err;
      }
    } catch (error) {
      console.error('❌ Failed to clear user conversations:', error);
      throw error;
    }
  }

  async clearConversationMessages(conversationId: string): Promise<void> {
    try {
      const docId = `messages_${conversationId}`;
      try {
        const doc = await this.db.get(docId);
        await this.db.remove(doc);
      } catch (err: any) {
        if (err.status !== 404) throw err;
      }
    } catch (error) {
      console.error('❌ Failed to clear conversation messages:', error);
      throw error;
    }
  }

  async clearUserCommunities(userId: string): Promise<void> {
    try {
      const docId = `communities_${userId}`;
      try {
        const doc = await this.db.get(docId);
        await this.db.remove(doc);
      } catch (err: any) {
        if (err.status !== 404) throw err;
      }
    } catch (error) {
      console.error('❌ Failed to clear user communities:', error);
      throw error;
    }
  }

  private async bulkDeleteByPrefix(prefix: string): Promise<void> {
    const allDocs = await this.db.allDocs({ include_docs: true });
    const toDelete = allDocs.rows
      .filter((row: any) => row.id.startsWith(prefix))
      .map((row: any) => ({ _id: row.doc._id, _rev: row.doc._rev, _deleted: true }));
    if (toDelete.length > 0) {
      await this.db.bulkDocs(toDelete);
    }
  }

  async clearAllUserProfiles(): Promise<void> { await this.bulkDeleteByPrefix('user_profile_'); }
  async clearAllGroupDetails(): Promise<void> {
    await this.bulkDeleteByPrefix('group_details_');
    await this.bulkDeleteByPrefix('group_');
    await this.bulkDeleteByPrefix('community_groups_');
  }
  async clearPresenceData(): Promise<void> {
    await this.bulkDeleteByPrefix('presence_');
    await this.bulkDeleteByPrefix('typing_');
  }
  async clearAllAttachments(): Promise<void> { await this.bulkDeleteByPrefix('attachment_'); }
  async clearAllPinnedMessages(): Promise<void> { await this.bulkDeleteByPrefix('pinned_'); }
  async clearAllUnreadCounts(): Promise<void> { await this.bulkDeleteByPrefix('unread_'); }
  async clearAllMutedChats(): Promise<void> { await this.bulkDeleteByPrefix('muted_chats_'); }
  async clearAllContactNames(): Promise<void> { await this.bulkDeleteByPrefix('contact_name_'); }
  async clearAllSocialMedia(): Promise<void> { await this.bulkDeleteByPrefix('social_media_'); }
  async clearAllPastMembers(): Promise<void> { await this.bulkDeleteByPrefix('past_members_'); }
  async clearAllCommunityInfo(): Promise<void> { await this.bulkDeleteByPrefix('community_info_'); }
  async clearAllCommonGroups(): Promise<void> { await this.bulkDeleteByPrefix('common_groups_'); }
  async clearActionQueue(): Promise<void> { await this.clearQueue(); }

  async clearPlatformUsers(): Promise<void> {
    try {
      const doc = await this.db.get('platform_users');
      await this.db.remove(doc);
    } catch (err: any) {
      if (err.status !== 404) throw err;
    }
  }

  async clearUserData(userId: string): Promise<void> {
    try {
      await this.flushPendingSaves();
      await this.clearUserConversations(userId);
      await this.clearUserCommunities(userId);
      await this.clearAllUserProfiles();
      await this.clearAllGroupDetails();
      await this.clearPresenceData();
      await this.clearAllAttachments();
      await this.clearAllPinnedMessages();
      await this.clearAllUnreadCounts();
      await this.clearAllMutedChats();
      await this.clearAllContactNames();
      await this.clearAllSocialMedia();
      await this.clearAllPastMembers();
      await this.clearAllCommunityInfo();
      await this.clearAllCommonGroups();
      await this.clearActionQueue();
      await this.clearPlatformUsers();
      await this.clearNonPlatformUsers(); // ← logout pe non-platform bhi clear
      await this.compact();
    } catch (error) {
      console.error('❌ Failed to clear user data:', error);
      throw error;
    }
  }

  async clearDataByCategory(categories: {
    conversations?: boolean; messages?: boolean; communities?: boolean;
    groups?: boolean; userProfiles?: boolean; presence?: boolean;
    attachments?: boolean; pinnedMessages?: boolean; unreadCounts?: boolean;
    mutedChats?: boolean; contactNames?: boolean; socialMedia?: boolean;
    pastMembers?: boolean; communityInfo?: boolean; commonGroups?: boolean;
    actionQueue?: boolean; platformUsers?: boolean; nonPlatformUsers?: boolean;
  }, userId?: string): Promise<void> {
    await this.flushPendingSaves();
    if (categories.conversations && userId) await this.clearUserConversations(userId);
    if (categories.communities && userId) await this.clearUserCommunities(userId);
    if (categories.groups) await this.clearAllGroupDetails();
    if (categories.userProfiles) await this.clearAllUserProfiles();
    if (categories.presence) await this.clearPresenceData();
    if (categories.attachments) await this.clearAllAttachments();
    if (categories.pinnedMessages) await this.clearAllPinnedMessages();
    if (categories.unreadCounts) await this.clearAllUnreadCounts();
    if (categories.mutedChats) await this.clearAllMutedChats();
    if (categories.contactNames) await this.clearAllContactNames();
    if (categories.socialMedia) await this.clearAllSocialMedia();
    if (categories.pastMembers) await this.clearAllPastMembers();
    if (categories.communityInfo) await this.clearAllCommunityInfo();
    if (categories.commonGroups) await this.clearAllCommonGroups();
    if (categories.actionQueue) await this.clearActionQueue();
    if (categories.platformUsers) await this.clearPlatformUsers();
    if (categories.nonPlatformUsers) await this.clearNonPlatformUsers();
    await this.compact();
  }

  async flushPendingSaves(): Promise<void> {
    for (const [key, timer] of this.saveTimers.entries()) {
      clearTimeout(timer);
      this.saveTimers.delete(key);
    }
  }

  async clearConversation(conversationId: string): Promise<void> {
    try {
      const messagesDoc = await this.db.get(`messages_${conversationId}`);
      await this.db.remove(messagesDoc);
    } catch (err: any) { if (err.status !== 404) console.error(err); }
    try {
      const convDoc = await this.db.get(`conversation_${conversationId}`);
      await this.db.remove(convDoc);
    } catch (err: any) { if (err.status !== 404) console.error(err); }
  }

  async clearOldData(daysOld: number = 30): Promise<void> {
    try {
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      const result = await this.db.allDocs({ include_docs: true });
      const toDelete = result.rows
        .filter((row: any) => row.doc.timestamp && row.doc.timestamp < cutoffTime)
        .map((row: any) => ({ _id: row.doc._id, _rev: row.doc._rev, _deleted: true }));
      if (toDelete.length > 0) {
        await this.db.bulkDocs(toDelete);
      }
    } catch (error) {
      console.error('❌ Failed to clear old data:', error);
    }
  }

  async getStats(): Promise<any> {
    try {
      const info = await this.db.info();
      const queue = await this.getQueue();
      return {
        docCount: info.doc_count,
        updateSeq: info.update_seq,
        queuedActions: queue.length,
        pendingActions: queue.filter(a => a.retryCount && a.retryCount > 0).length
      };
    } catch (error) {
      console.error('❌ Failed to get stats:', error);
      return null;
    }
  }

  async debugDump(): Promise<void> {
    try {
      const allDocs = await this.db.allDocs({ include_docs: true });
      console.group('📊 Chat PouchDB Debug Dump');
      console.log('Total documents:', allDocs.total_rows);
      const cats: Record<string, number> = {
        conversations: 0, messages: 0, attachments: 0, presence: 0,
        typing: 0, groups: 0, communities: 0, pinned: 0, unread: 0,
        muted: 0, platformUsers: 0, nonPlatformUsers: 0, queue: 0, other: 0
      };
      allDocs.rows.forEach((row: any) => {
        const id: string = row.id;
        if (id.startsWith('conversations_') || id.startsWith('conversation_')) cats['conversations']++;
        else if (id.startsWith('messages_')) cats['messages']++;
        else if (id.startsWith('attachment_')) cats['attachments']++;
        else if (id.startsWith('presence_')) cats['presence']++;
        else if (id.startsWith('typing_')) cats['typing']++;
        else if (id.startsWith('group_') || id.startsWith('community_groups_')) cats['groups']++;
        else if (id.startsWith('communities_')) cats['communities']++;
        else if (id.startsWith('pinned_')) cats['pinned']++;
        else if (id.startsWith('unread_')) cats['unread']++;
        else if (id.startsWith('muted_chats_')) cats['muted']++;
        else if (id === 'platform_users') cats['platformUsers']++;
        else if (id === 'non_platform_users') cats['nonPlatformUsers']++;
        else if (id === 'chat_action_queue') cats['queue']++;
        else cats['other']++;
      });
      console.table(cats);
      console.groupEnd();
    } catch (error) {
      console.error('❌ Debug dump failed:', error);
    }
  }

  async compact(): Promise<void> {
    try {
      await this.db.compact();
    } catch (error) {
      console.error('❌ Failed to compact database:', error);
    }
  }

  /* =========================
     COMMUNITY INFO CACHE
     ========================= */

  async cacheCommunityInfo(communityId: string, data: {
    community: any; members: any[]; memberCount: number; groupCount: number; adminIds: string[];
  }): Promise<void> {
    try {
      await safePut(this.db, `community_info_${communityId}`, () => ({
        ...data, communityId, timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('❌ Failed to cache community info:', error);
    }
  }

  async getCachedCommunityInfo(communityId: string): Promise<{
    community: any; members: any[]; memberCount: number; groupCount: number; adminIds: string[];
  } | null> {
    try {
      const doc: any = await this.db.get(`community_info_${communityId}`);
      return {
        community: doc.community || null,
        members: doc.members || [],
        memberCount: doc.memberCount || 0,
        groupCount: doc.groupCount || 0,
        adminIds: doc.adminIds || []
      };
    } catch (err: any) {
      if (err.status === 404) return null;
      return null;
    }
  }

  async clearCachedCommunityInfo(communityId: string): Promise<void> {
    try {
      const doc = await this.db.get(`community_info_${communityId}`);
      await this.db.remove(doc);
    } catch (err: any) {
      if (err.status !== 404) console.error('❌ Failed to clear cached community info:', err);
    }
  }
}