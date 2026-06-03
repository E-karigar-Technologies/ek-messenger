import { Injectable, isDevMode } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiService } from './api/api.service';
import { AuthService } from '../auth/auth.service';
import { NetworkService } from './network-connection/network.service';

export type ChatBackendSendMessagePayload = {
  roomId: string;
  content: string;
  type: string;
  replyToMsgId?: string;
  msgId?: string;
  timestamp?: number | string | Date;
  attachment?: any;
  translations?: any;
  blockedSend?: boolean;
  receiverId?: string;
  isForwarded?: boolean;
  channel_invite?: any;
};

export type GlobalSettingsSectionKey =
  | 'accessibility'
  | 'chats'
  | 'notifications'
  | 'storageData'
  | 'appUpdates'
  | 'appLanguage'
  | 'chatTheme'
  | 'avatarOptions';

@Injectable({ providedIn: 'root' })
export class ChatBackendSocketService {
  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;
  private offlineQueue: { event: string; payload: any }[] = [];

  private flushOfflineQueue() {
    if (!this.socket?.connected) return;
    while (this.offlineQueue.length > 0) {
      const item = this.offlineQueue.shift();
      if (item) {
        // Send queued task, no ack handling for offline replays yet
        this.socket.emit(item.event, item.payload);
      }
    }
  }

  // private get chatBackendUrl(): string {
    // NOTE: Configure this in `environment*.ts` for production.
    // return (environment as any).chatBackendSocketUrl || 'http://localhost:5001';
     private getSocketConnectionConfig(): { url: string; path: string } {
    const configuredUrl =
      (environment as any).chatBackendSocketUrl || 'http://localhost:7001';
    const explicitPath = (environment as any).chatBackendSocketPath;

    try {
      const parsed = new URL(configuredUrl);
      const url = `${parsed.protocol}//${parsed.host}`;
      const basePath = explicitPath || parsed.pathname || '/';
      const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
      const path = `${normalizedBase}/socket.io/`;
      return { url, path: path.startsWith('/') ? path : `/${path}` };
    } catch {
      return {
        url: configuredUrl,
        path: explicitPath || '/socket.io/',
      };
    }
  }

  constructor(
    private api: ApiService,
    private authService: AuthService,
    private networkService: NetworkService
  ) {
    if (isDevMode()) {
      (window as any).chatSocketTest = this;
    }
  }

  async connect(): Promise<void> {
    if (this.socket?.connected) return;
    if (this.connecting) return this.connecting;

    // Use NetworkService (Capacitor Network plugin) instead of navigator.onLine
    // because navigator.onLine is unreliable on Android WebView — it can return
    // true even when the device has no internet connectivity.
    if (!this.networkService.isOnline.value) {
      throw new Error('[ChatBackendSocketService] Device is offline');
    }

    this.connecting = (async () => {
      const token = this.authService.authData?.app_token;

      if (!token) {
        throw new Error(
          '[ChatBackendSocketService] Missing app_token for socket auth'
        );
      }

      const socketConfig = this.getSocketConnectionConfig();
      const s = io(socketConfig.url, {
        path: socketConfig.path,
        auth: { token },
        transports: ['websocket', 'polling'],
        autoConnect: false,
        // Disable Socket.IO's built-in reconnection — we manage reconnection
        // ourselves via the NetworkService online/offline events so we never
        // accumulate orphaned sockets that spam retries when offline.
        reconnection: false,
      });

      // Connect and wait for successful handshake.
      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          cleanup();
          this.flushOfflineQueue();
          resolve();
        };
        const onConnectError = (err: any) => {
          cleanup();
          // Disconnect immediately so the socket doesn't linger and retry.
          s.disconnect();
          reject(
            new Error(
              `[ChatBackendSocketService] connect_error: ${err?.message || err}`
            )
          );
        };

        const cleanup = () => {
          s.off('connect', onConnect);
          s.off('connect_error', onConnectError);
        };

        s.once('connect', onConnect);
        s.once('connect_error', onConnectError);
        s.connect();
      });

      this.socket = s;
    })();

    return this.connecting.finally(() => {
      this.connecting = null;
    });
  }

  /** Generic emit helper: emits any event with an ack callback, resolves or rejects. */
  async emitWithAck(event: string, payload: any, timeoutMs = 10000): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Socket timeout: ${event}`)), timeoutMs);
      this.socket!.emit(event, payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || `${event} failed`));
      });
    });
  }

  async sendMessage(
    payload: ChatBackendSendMessagePayload
  ): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('[ChatBackendSocketService] sendMessage timeout'));
      }, 8000);

      const cleanup = () => {
        clearTimeout(timeout);
        s.off('error', onError);
      };

      const onError = (err: any) => {
        cleanup();
        reject(new Error(err?.message || '[ChatBackendSocketService] Socket error'));
      };

      s.once('error', onError);

      // Socket.IO ack callback (server must call `ack(...)`).
      s.emit('sendMessage', payload, (ackRes: any) => {
        cleanup();
        if (ackRes?.status === 'ok') resolve(ackRes);
        else
          reject(
            new Error(
              ackRes?.message || '[ChatBackendSocketService] sendMessage failed'
            )
          );
      });
    });
  }

  async updateReceipt(payload: {
    roomId: string;
    msgId: string;
    receiptType: 'read' | 'delivered';
    userId?: string;
  }): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('[ChatBackendSocketService] updateReceipt timeout'));
      }, 5000);

      const cleanup = () => {
        clearTimeout(timeout);
        s.off('error', onError);
      };

      const onError = (err: any) => {
        cleanup();
        reject(new Error(err?.message || '[ChatBackendSocketService] Socket error'));
      };

      s.once('error', onError);

      s.emit('updateReceipt', payload, (ackRes: any) => {
        cleanup();
        if (ackRes?.status === 'ok') resolve(ackRes);
        else reject(new Error(ackRes?.message || '[ChatBackendSocketService] updateReceipt failed'));
      });
    });
  }

  async editMessage(payload: {
  roomId: string;
  msgId: string;
  newText: string;   // encrypted ciphertext
}): Promise<{ status: 'ok'; editedAt?: number; message?: any }> {
  await this.connect();
  if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

  return new Promise((resolve, reject) => {
    const s = this.socket!;
    const timeout = setTimeout(() => {
      reject(new Error('[ChatBackendSocketService] editMessage timeout'));
    }, 5000);

    s.emit('editMessage', payload, (ackRes: any) => {
      clearTimeout(timeout);
      if (ackRes?.status === 'ok') resolve(ackRes);
      else reject(new Error(ackRes?.message || '[ChatBackendSocketService] editMessage failed'));
    });
  });
}

/**
 * Register a callback for the real-time `messageEdited` socket event.
 * Call this once during room setup (inside listenRoomStream) so the receiver
 * sees edits immediately without waiting for Firebase RTDB onChildChanged.
 * Returns an unsubscribe function — call it when leaving the room.
 */
onMessageEdited(
  callback: (data: {
    roomId: string;
    msgId: string;
    text: string;       // encrypted — caller must decrypt
    isEdit: boolean;
    editedAt: number;
  }) => void
): () => void {
  const handler = (data: any) => callback(data);
  this.socket?.on('messageEdited', handler);
  return () => {
    this.socket?.off('messageEdited', handler);
  };
}

  onStatusNew(
    callback: (data: { statusId: string; ownerUid: string; createdAt: number }) => void
  ): () => void {
    const handler = (data: any) => callback(data);
    this.socket?.on('status:new', handler);
    return () => {
      this.socket?.off('status:new', handler);
    };
  }

  async deleteMessage(payload: {
    roomId: string;
    msgId: string;
    forEveryone?: boolean;
  }): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => {
        reject(new Error('[ChatBackendSocketService] deleteMessage timeout'));
      }, 5000);

      s.emit('deleteMessage', payload, (ackRes: any) => {
        clearTimeout(timeout);
        if (ackRes?.status === 'ok') resolve(ackRes);
        else reject(new Error(ackRes?.message || '[ChatBackendSocketService] deleteMessage failed'));
      });
    });
  }

  async deleteChannelPosts(payload: { channelId: string | number }): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('deleteChannelPosts timeout')), 5000);
      s.emit('deleteChannelPosts', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'deleteChannelPosts failed'));
      });
    });
  }

  async setQuickReaction(payload: {
    roomId: string;
    msgId: string;
    emoji: string | null;
  }): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => {
        reject(new Error('[ChatBackendSocketService] setQuickReaction timeout'));
      }, 5000);

      s.emit('setQuickReaction', payload, (ackRes: any) => {
        clearTimeout(timeout);
        if (ackRes?.status === 'ok') resolve(ackRes);
        else reject(new Error(ackRes?.message || '[ChatBackendSocketService] setQuickReaction failed'));
      });
    });
  }

  async pinMessage(payload: {
    roomId: string;
    msgId: string;
  }): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => {
        reject(new Error('[ChatBackendSocketService] pinMessage timeout'));
      }, 5000);

      s.emit('pinMessage', payload, (ackRes: any) => {
        clearTimeout(timeout);
        if (ackRes?.status === 'ok') resolve(ackRes);
        else reject(new Error(ackRes?.message || '[ChatBackendSocketService] pinMessage failed'));
      });
    });
  }

  async unpinMessage(payload: {
    roomId: string;
    msgId: string;
  }): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => {
        reject(new Error('[ChatBackendSocketService] unpinMessage timeout'));
      }, 5000);

      s.emit('unpinMessage', payload, (ackRes: any) => {
        clearTimeout(timeout);
        if (ackRes?.status === 'ok') resolve(ackRes);
        else reject(new Error(ackRes?.message || '[ChatBackendSocketService] unpinMessage failed'));
      });
    });
  }

 async createGroup(payload: {
  groupId: string;
  name: string;
  description?: string;
  members?: string[];
  adminIds?: string[];
  createdBy?: string;
  createdByName?: string;
  createdAt?: number;
  type?: string;
  isArchived?: boolean;
  isPinned?: boolean;
  isLocked?: boolean;
}): Promise<{ status: 'ok'; group?: any; message?: any }> {
  await this.connect();
  if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

  return new Promise((resolve, reject) => {
    const s = this.socket!;
    const timeout = setTimeout(() => reject(new Error('createGroup timeout')), 5000);
    s.emit('createGroup', payload, (res: any) => {
      clearTimeout(timeout);
      if (res?.status === 'ok') resolve(res);
      else reject(new Error(res?.message || 'createGroup failed'));
    });
  });
}
  async deleteChatPermanently(roomId: string): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('deleteChatPermanently timeout')), 5000);
      s.emit('deleteChatPermanently', { roomId }, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'deleteChatPermanently failed'));
      });
    });
  }

  async clearChatForMe(roomId: string): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('clearChatForMe timeout')), 5000);
      s.emit('clearChatForMe', { roomId }, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'clearChatForMe failed'));
      });
    });
  }

  async deleteChatsForMe(payload: { roomIds: string[] }): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('deleteChatsForMe timeout')), 10000);
      s.emit('deleteChatsForMe', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'deleteChatsForMe failed'));
      });
    });
  }

  async addGroupMember(payload: {
    groupId: string;
    newUserId: string;
  }): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('addGroupMember timeout')), 5000);
      s.emit('addGroupMember', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'addGroupMember failed'));
      });
    });
  }

  async joinRoom(roomId: string): Promise<void> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');
    // Fire-and-forget: backend may not send ack for joinRoom
    this.socket.emit('joinRoom', roomId);
  }

  async removeGroupMember(payload: {
    groupId: string;
    targetUserId: string;
  }): Promise<{ status: 'ok'; message?: any }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('removeGroupMember timeout')), 5000);
      s.emit('removeGroupMember', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'removeGroupMember failed'));
      });
    });
  }

  async blockUser(targetUserId: string): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('blockUser timeout')), 5000);
      s.emit('blockUser', { targetUserId }, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'blockUser failed'));
      });
    });
  }

  async unblockUser(targetUserId: string): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('unblockUser timeout')), 5000);
      s.emit('unblockUser', { targetUserId }, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'unblockUser failed'));
      });
    });
  }

  // async updateGroupMetadata(payload: {
  //   groupId: string;
  //   title?: string;
  //   description?: string;
  //   backendGroupId?: string;
  // }): Promise<{ status: 'ok'; message?: any }> {
  //   await this.connect();
  //   if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');

  //   return new Promise((resolve, reject) => {
  //     const s = this.socket!;
  //     const timeout = setTimeout(() => reject(new Error('updateGroupMetadata timeout')), 5000);
  //     s.emit('updateGroupMetadata', payload, (res: any) => {
  //       clearTimeout(timeout);
  //       if (res?.status === 'ok') resolve(res);
  //       else reject(new Error(res?.message || 'updateGroupMetadata failed'));
  //     });
  //   });
  // }

  async updateGroupMetadata(payload: {
  groupId: string;
  title?: string;
  description?: string;
  backendGroupId?: string;
}): Promise<{ status: 'ok'; message?: any }> {

  console.log('[updateGroupMetadata] Called with payload:', payload);

  await this.connect();

  if (!this.socket) {
    console.error('[updateGroupMetadata] Socket not ready');
    throw new Error('[ChatBackendSocketService] Socket not ready');
  }

  return new Promise((resolve, reject) => {
    const s = this.socket!;

    console.log('[updateGroupMetadata] Emitting event...');

    const timeout = setTimeout(() => {
      console.error('[updateGroupMetadata] Timeout after 5 seconds');
      reject(new Error('updateGroupMetadata timeout'));
    }, 5000);

    s.emit('updateGroupMetadata', payload, (res: any) => {
      clearTimeout(timeout);

      console.log('[updateGroupMetadata] Response received:', res);

      if (res?.status === 'ok') {
        console.log('✅ [updateGroupMetadata] SUCCESS');
        resolve(res);
      } else {
        console.error('❌ [updateGroupMetadata] FAILED:', res);
        reject(new Error(res?.message || 'updateGroupMetadata failed'));
      }
    });
  });
}

  async clearChat(roomId: string): Promise<any> {
    // Delegates to clearChatForMe as per current backend logic
    return this.clearChatForMe(roomId);
  }

  setTypingStatus(roomId: string, isTyping: boolean): void {
    if (!this.socket?.connected) return;
    this.socket.emit(isTyping ? 'typing' : 'stopTyping', roomId);
  }

  async setArchived(payload: { roomId: string; isArchived: boolean }): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('setArchived timeout')), 5000);
      s.emit('setArchived', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'setArchived failed'));
      });
    });
  }

  async setLocked(payload: { roomId: string; isLocked: boolean }): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('setLocked timeout')), 5000);
      s.emit('setLocked', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'setLocked failed'));
      });
    });
  }

  async setPinned(payload: { roomId: string; isPinned: boolean; pinnedAt?: number | string }): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('setPinned timeout')), 5000);
      s.emit('setPinned', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'setPinned failed'));
      });
    });
  }

  async setGroupVisibility(payload: { groupId: string; visibility: string }): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('setGroupVisibility timeout')), 5000);
      s.emit('setGroupVisibility', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'setGroupVisibility failed'));
      });
    });
  }

  async resetUnreadCount(roomId: string): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('resetUnreadCount timeout')), 5000);
      s.emit('resetUnreadCount', { roomId }, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'resetUnreadCount failed'));
      });
    });
  }

  async setUnreadCount(roomId: string, count: number): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('setUnreadCount timeout')), 5000);
      s.emit('setUnreadCount', { roomId, count }, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'setUnreadCount failed'));
      });
    });
  }

  async applySecuredBatchUpdates(payload: { updates: Record<string, any> }): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('applySecuredBatchUpdates timeout')), 10000);
      s.emit('applySecuredBatchUpdates', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'applySecuredBatchUpdates failed'));
      });
    });
  }

  async checkBlockStatuses(payload: { receiverIds: string[] }): Promise<{ status: 'ok', blockMap: Record<string, boolean> }> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('checkBlockStatuses timeout')), 8000);
      s.emit('checkBlockStatuses', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'checkBlockStatuses failed'));
      });
    });
  }

  async syncCommunityMembers(payload: {
    communityId: string;
    memberIds: string[];
    announcementGroupId?: string;
    generalGroupId?: string;
  }): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('syncCommunityMembers timeout')), 10000);
      s.emit('syncCommunityMembers', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'syncCommunityMembers failed'));
      });
    });
  }

  async addGroupsToCommunity(payload: {
    communityId: string;
    groupIds: string[];
  }): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('addGroupsToCommunity timeout')), 5000);
      s.emit('addGroupsToCommunity', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'addGroupsToCommunity failed'));
      });
    });
  }

  async setActiveChat(roomId: string | null): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('setActiveChat timeout')), 5000);
      s.emit('setActiveChat', { roomId }, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'setActiveChat failed'));
      });
    });
  }

  setDisappearingSettings(payload: { roomId: string; enabled: boolean; duration: string }): void {
    if (!this.socket?.connected) return;
    this.socket.emit('setDisappearingSettings', payload);
  }

  async createBroadcast(payload: { broadcastData: any }): Promise<void> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('createBroadcast timeout')), 5000);
      s.emit('createBroadcast', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve();
        else reject(new Error(res?.message || 'createBroadcast failed'));
      });
    });
  }

  async updateBroadcast(payload: { broadcastId: string, updates: any }): Promise<void> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('updateBroadcast timeout')), 5000);
      s.emit('updateBroadcast', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve();
        else reject(new Error(res?.message || 'updateBroadcast failed'));
      });
    });
  }

  async getGlobalSettings(): Promise<Record<string, any>> {
    const res = await this.emitWithAck('getGlobalSettings', {}, 10000);
    return res?.settings || {};
  }

  async saveGlobalSettings(payload: {
    section: GlobalSettingsSectionKey;
    settings: any;
  }): Promise<any> {
    return this.emitWithAck('saveGlobalSettings', payload, 10000);
  }

  // --- CQRS Handlers (Offline Resilient) ---

  async muteChannel(payload: { channelId: string; action: 'muted' | 'unmuted'; duration?: string }): Promise<void> {
    try {
      await this.connect();
      return new Promise((resolve) => {
        this.socket!.emit('muteChannel', payload, () => resolve());
      });
    } catch (err) {
      console.warn('[ChatSocket] muteChannel offline fallback triggered', err);
      this.offlineQueue.push({ event: 'muteChannel', payload });
    }
  }

  async createChannelPost(payload: { channelId: string; postData: any; postId?: string }): Promise<void> {
    try {
      await this.connect();
      return new Promise((resolve, reject) => {
        this.socket!.emit('createChannelPost', payload, (res: any) => {
          if (res?.status === 'ok') resolve();
          else reject(new Error(res?.message || 'createChannelPost failed'));
        });
      });
    } catch (err) {
      console.warn('[ChatSocket] createChannelPost offline fallback triggered', err);
      this.offlineQueue.push({ event: 'createChannelPost', payload });
    }
  }

  async sendChannelInvite(payload: {
    roomId: string;
    msgId: string;
    receiverId: string;
    content: string;
    channelInviteData: any;
    timestamp?: number;
  }): Promise<{ status: 'ok'; msgId?: string }> {
    await this.connect();
    if (!this.socket) throw new Error('[ChatBackendSocketService] Socket not ready');
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('sendChannelInvite timeout')), 8000);
      s.emit('sendChannelInvite', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'sendChannelInvite failed'));
      });
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Call this when the device comes back online to re-establish the socket. */
  async reconnect(): Promise<void> {
    this.disconnect();
    await this.connect();
  }

    /** Add a single member to channel in Firebase RTDB */
  async addChannelMember(payload: {
    channelId: string | number;
    memberId: string | number;
    roleId?: number;
  }): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('addChannelMember timeout')), 5000);
      s.emit('addChannelMember', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'addChannelMember failed'));
      });
    });
  }

  /** Remove a single member from channel in Firebase RTDB */
  async removeChannelMember(payload: {
    channelId: string | number;
    memberId: string | number;
  }): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('removeChannelMember timeout')), 5000);
      s.emit('removeChannelMember', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'removeChannelMember failed'));
      });
    });
  }

  /** Bulk sync API members to Firebase RTDB (use for mismatch repair) */
  async syncChannelMembers(payload: {
    channelId: string | number;
    members: Array<{ user_id: number | string; role_id?: number }>;
  }): Promise<any> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const s = this.socket!;
      const timeout = setTimeout(() => reject(new Error('syncChannelMembers timeout')), 10000);
      s.emit('syncChannelMembers', payload, (res: any) => {
        clearTimeout(timeout);
        if (res?.status === 'ok') resolve(res);
        else reject(new Error(res?.message || 'syncChannelMembers failed'));
      });
    });
  }
}

