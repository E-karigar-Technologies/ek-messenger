import { ChangeDetectorRef, Injectable, NgZone } from '@angular/core';
import {
  Database,
  ref,
  push,
  onValue,
  set,
  get,
  child,
  runTransaction,
} from '@angular/fire/database';
import {
  ref as rtdbRef,
  update as rtdbUpdate,
  set as rtdbSet,
  get as rtdbGet,
  DataSnapshot,
  onValue as rtdbOnValue,
  query,
  orderByKey,
  startAt,
  limitToLast,
  onChildAdded,
  onChildRemoved,
  onChildChanged,
  off,
  orderByChild,
  onDisconnect,
  startAfter,
  endAt,
  serverTimestamp,
} from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { runTransaction as rtdbRunTransaction } from 'firebase/database';
import {
  BehaviorSubject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  map,
  Observable,
  of,
  retry,
  skip,
  Subject,
  take,
} from 'rxjs';
import { getDatabase, goOffline, goOnline, remove, update } from 'firebase/database';
import { IChat, IChatMeta, Message, PinnedMessage } from 'src/types';
import { ApiService } from './api/api.service';
import {
  IAttachment,
  ICommunity,
  ICommunityChatMeta,
  ICommunityMember,
  IConversation,
  IGroup,
  IGroupMember,
  IMessage,
  IUser,
} from './sqlite.service';
import { ContactSyncService } from './contact-sync.service';
import { IonCard, Platform } from '@ionic/angular';
import { NetworkService } from './network-connection/network.service';
import { EncryptionService } from './encryption.service';
import { AuthService } from '../auth/auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CacheService } from './cache.service';
import { environment } from 'src/environments/environment';
import { FileSystemService } from './file-system.service';
import { ChatPouchDb, NonPlatformUser, PendingChatAction } from './chat-pouch-db';
import { ChatBackendSocketService } from './chat-backend-socket.service';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { GroupPermissions } from '../pages/group-permissions/group-permissions.page';
// import isEqual from 'lodash.isequal';

// ✅ Plugin interface for clearing notifications
interface ChatNotificationPlugin {
  clearRoom(options: {
    roomId: string;
  }): Promise<{ success: boolean; roomId: string }>;
  clearAllRooms(): Promise<{ success: boolean }>;
}

// ✅ Register the native plugin
const ChatNotification =
  registerPlugin<ChatNotificationPlugin>('ChatNotification');

interface MemberPresence {
  isOnline: boolean;
  lastSeen: number | null;
  isTyping?: boolean;
}

/** Per-room pagination state (preserve on reopen) */
export interface RoomPaginationState {
  messages: IMessage[];
  oldestLoadedTimestamp: number | null;
  newestLoadedTimestamp: number | null;
  hasMoreOlder: boolean;
}

type TypingEventType = 'added' | 'updated';

interface ITypingEvent {
  roomId: string;
  userId: string;
  isTyping: boolean;
  type: TypingEventType;
}

@Injectable({ providedIn: 'root' })
export class FirebaseChatService {
  private normalizeDeletionFlags<T extends any>(obj: T): T {
    const copy: any = { ...(obj as any) };
    if (copy.deletedForEveryone === true) {
      copy.deletedFor = copy.deletedFor || {};
      copy.deletedFor.everyone = true;
    }
    return copy as T;
  }
  // =====================
  // ======= DATA ========
  // =====================
  isAppInitialized: boolean = false;
  private senderId: string | null = null;
  private forwardMessages: any[] = [];
  private _selectedMessageInfo: any = null;
  private _selectedAttachment: any = null;
  private _conversations$ = new BehaviorSubject<IConversation[]>([]);
  private _conversationsTypingStatus$ = new BehaviorSubject<
    Record<string, any[]>
  >({});
  private _platformUsers$ = new BehaviorSubject<Partial<IUser>[]>([]);
  platformUsers$ = this._platformUsers$.asObservable();
  private _deviceContacts$ = new BehaviorSubject<
    { username: string; phoneNumber: string }[]
  >([]);
  deviceContacts$ = this._deviceContacts$.asObservable();
  private _isSyncing$ = new BehaviorSubject<boolean>(false);
  isSyncing$ = this._isSyncing$.asObservable();
  private _offsets$ = new BehaviorSubject<Map<string, number>>(new Map());
  private _messages$ = new BehaviorSubject<Map<string, IMessage[]>>(new Map());
  private _totalMessages: number = 0;

  /** Service-based pagination: in-memory store per room (preserve on reopen) */
  /** Initial load: 10 messages for fast open; then background 20-20 up to 200 */
  private readonly INITIAL_PAGE_SIZE = 10;
  private readonly BACKGROUND_BATCH_SIZE = 20;
  private readonly MAX_INITIAL_TOTAL_MESSAGES = 200;
  private readonly MESSAGES_PAGE_SIZE = 20; // scroll-up batch size
  private _roomPaginationState = new Map<string, RoomPaginationState>();
  private _isInitialLoading = false;
  private _isLoadingOlder = false;
  private _backgroundPreloadAbort = new Map<string, boolean>();
  private _allBatchesComplete$ = new BehaviorSubject<boolean>(false);
  readonly allBatchesComplete$ = this._allBatchesComplete$.asObservable();

  public _userChatsListener: (() => void) | null = null;
  private _recentEveryoneDeletes = new Set<string>();
  private _animationCompletedDeletes = new Set<string>(); // ← ADD THIS
  // 🟢 Map of userId → { isOnline, lastSeen }
  private membersPresence: Map<string, MemberPresence> = new Map();

  // 🟢 Map of userId → unsubscribe function for presence listener
  private _memberUnsubs: Map<string, () => void> = new Map();
  private _roomMessageListner: any = null;

  currentChat: IConversation | null = null;

  private _presenceSubject$ = new BehaviorSubject<Map<string, MemberPresence>>(
    new Map()
  );
  presenceChanges$ = this._presenceSubject$.asObservable();

  private _typingStatus$ = new BehaviorSubject<Map<string, boolean>>(new Map());
  typingStatus$ = this._typingStatus$.asObservable();
  private _typingListeners = new Map<string, () => void>();

  private lastSavedSnapshots = {
    conversations: null as any | null,
    platformUsers: null as any | null,
    deviceContacts: null as any | null,
    offsets: null as any | null,
    presence: null as any | null,
    typing: null as any | null,
  };
  senderName = '';
  selectedMembersForGroup: any[] = [];
  selectedGroupMembers: any[] = [];
  private _syncStatus$ = new BehaviorSubject<{
    isOnline: boolean;
    isSyncing: boolean;
    lastSyncTime: number | null;
    pendingActions: number;
  }>({
    isOnline: false,
    isSyncing: false,
    lastSyncTime: null,
    pendingActions: 0,
  });

  syncStatus$ = this._syncStatus$.asObservable();
  private backgroundDeletionListeners: Map<string, () => void> = new Map();
  private pendingOfflineDeletes: Map<string, any[]> = new Map();
  private _disappearingTimers = new Map<
    string,
    ReturnType<typeof setInterval>
  >();

  // ── Conversation Pagination (NEW) ───────────────────────────
  private readonly CONV_BATCH_SIZE = 10;
  private _convOldestTimestamp: number | null = null;
  private _convHasMore = true;
  private _convSyncing = false;
  private _convRetryCount = 0;
  private readonly CONV_MAX_RETRIES = 3;

  // Home-screen ko signal dene ke liye (chatting screen ke
  // allBatchesComplete$ jaisi hi pattern)
  public readonly conversationBatchesComplete$ = new Subject<boolean>();

  private _groupPermissionsCache = new Map<string, GroupPermissions>();
 private _nonPlatformUsers$ = new BehaviorSubject<NonPlatformUser[]>([]);
  nonPlatformUsers$ = this._nonPlatformUsers$.asObservable();

  constructor(
    private cache: CacheService,
    private db: Database,
    private service: ApiService,
    private contactsyncService: ContactSyncService,
    private platform: Platform,
    private apiService: ApiService,
    public networkService: NetworkService,
    // private networkService: NetworkService,
    private encryptionService: EncryptionService,
    private authService: AuthService,
    private http: HttpClient,
    private fileSystemService: FileSystemService,
    private chatPouchDb: ChatPouchDb,
    private chatBackendSocket: ChatBackendSocketService,
    private zone: NgZone
  ) {
    // this.init();
  }

  private isWeb(): boolean {
    return !(
      this.platform.is('android') ||
      this.platform.is('ios') ||
      this.platform.is('ipad') ||
      this.platform.is('iphone')
    );
  }

  private baseUrl = `${environment.backendApiUrl}/users`;

  get conversations() {
    return this._conversations$
      .asObservable()
      .pipe(
        map((convs) =>
          convs.sort(
            (b, a) =>
              Number(a.lastMessageAt || 0) - Number(b.lastMessageAt || 0)
          )
        )
      );
  }

  get currentConversations(): IConversation[] {
    return this._conversations$.value;
  }

  get currentUsers(): Partial<IUser>[] {
    return this._platformUsers$.value;
  }

  get currentDeviceContacts(): any[] {
    return this._deviceContacts$.value;
  }

 get currentNonPlatformUsers(): NonPlatformUser[] {
    return this._nonPlatformUsers$.value;
  }

  /**
   * PouchDB-first platform users.
   * Returns in-memory BehaviorSubject value if populated;
   * falls back to PouchDB if empty (cold start before initApp populates it).
   */
  async getResolvedPlatformUsers(): Promise<Partial<IUser>[]> {
    const inMemory = this._platformUsers$.value;
    if (inMemory.length > 0) return inMemory;
    try {
      const cached = await this.chatPouchDb.getPlatformUsers();
      return cached.length > 0 ? cached : inMemory;
    } catch {
      return inMemory;
    }
  }

  /**
   * PouchDB-first non-platform users.
   * Returns in-memory BehaviorSubject value if populated;
   * falls back to PouchDB if empty.
   */
  async getResolvedNonPlatformUsers(): Promise<NonPlatformUser[]> {
    const inMemory = this._nonPlatformUsers$.value;
    if (inMemory.length > 0) return inMemory;
    try {
      const cached = await this.chatPouchDb.getNonPlatformUsers();
      return cached.length > 0 ? cached : inMemory;
    } catch {
      return inMemory;
    }
  }


  pushMsgToChat(msg: any) {
    try {
      console.log('message attachment this is from pushmsgtochat', msg);

      // 🔥 CRITICAL: Only add messages for the current chat room
      const targetRoomId = msg.roomId || this.currentChat?.roomId;
      if (!targetRoomId || !this.currentChat?.roomId) {
        console.warn('⚠️ No valid roomId found, skipping message');
        return;
      }

      // 🔥 CRITICAL: Verify message belongs to current room
      if (targetRoomId !== this.currentChat.roomId) {
        console.warn(
          `⚠️ Message roomId (${targetRoomId}) doesn't match current chat (${this.currentChat.roomId}), skipping`
        );
        return;
      }

      const existing = new Map(this._messages$?.value || []);
      const currentMessages =
        existing.get(this.currentChat.roomId as string) || [];
      const messageIdSet = new Set(currentMessages.map((m) => m.msgId));
      if (messageIdSet.has(msg.msgId)) return;
      const messageToAdd = {
        ...msg,
        roomId: this.currentChat.roomId,
        attachment: msg.attachment
          ? {
              ...msg.attachment,
              cdnUrl:
                msg.attachment.cdnUrl?.replace?.(/[?#].*$/, '') ??
                msg.attachment.cdnUrl,
            }
          : null,
        isMe: msg.sender === this.senderId,
      };
      currentMessages.push(messageToAdd as IMessage);
      existing.set(
        this.currentChat.roomId as string,
        currentMessages as IMessage[]
      );

      const roomId = this.currentChat.roomId as string;
      const paginationState = this._roomPaginationState.get(roomId);
      if (paginationState) {
        const ts = Number(new Date(messageToAdd.timestamp).getTime());
        this._roomPaginationState.set(roomId, {
          messages: [...paginationState.messages, messageToAdd as IMessage],
          oldestLoadedTimestamp: paginationState.oldestLoadedTimestamp,
          newestLoadedTimestamp:
            paginationState.newestLoadedTimestamp != null
              ? Math.max(paginationState.newestLoadedTimestamp, ts)
              : ts,
          hasMoreOlder: paginationState.hasMoreOlder,
        });
      }

      this._messages$.next(existing);
    } catch (error) {
      console.error('not loads pushmsgTochat', error);
    }
  }

  /** Emit current room messages from in-memory state */
  private emitRoomMessages(roomId: string, messages: IMessage[]): void {
    const sorted = [...messages].sort(
      (a, b) => Number(a.timestamp) - Number(b.timestamp)
    );
    const map = new Map(this._messages$.value);
    map.set(roomId, sorted);
    this._messages$.next(map);
  }

  /**
   * 🔥 FIX Issue 4: Remove messages from a room optimistically
   * Used for smooth deletion without full reload
   */
  removeMessagesFromRoom(roomId: string, messageIds: string[]): void {
    const existing = this._messages$.value;
    const currentMessages = existing.get(roomId) || [];
    const filteredMessages = currentMessages.filter(
      (msg) => !messageIds.includes(msg.msgId as string)
    );
    existing.set(roomId, filteredMessages);
    this._messages$.next(existing);
  }

  /**
   * Reset pagination for a room (e.g. pull-to-refresh). Clears in-memory messages for that room.
   */
  resetPagination(roomId: string): void {
    this._roomPaginationState.delete(roomId);
    const map = new Map(this._messages$.value);
    map.set(roomId, []);
    this._messages$.next(map);
  }

  get isInitialLoading(): boolean {
    return this._isInitialLoading;
  }

  get isLoadingOlder(): boolean {
    return this._isLoadingOlder;
  }

  /**
   * Initial load: latest 10 messages for fast open. Uses in-memory if already loaded (preserve on reopen).
   * Otherwise loads from PouchDB (timestamp-based pagination), or Firebase if cache empty.
   * After first 10 are emitted, triggers background preload of older messages in 20-message batches up to 200 total.
   */
  async initialLoad(roomId: string): Promise<void> {
    this._allBatchesComplete$.next(false);
    const state = this._roomPaginationState.get(roomId);
    if (state && state.messages.length > 0) {
      this.emitRoomMessages(roomId, state.messages);
      return;
    }

    this._isInitialLoading = true;
    const initialPageSize = this.INITIAL_PAGE_SIZE;
    // 🔥 FIX Issue 2: Pass userId to filter deleted messages
    const pouchResult = await this.chatPouchDb.getMessagesPaginated(roomId, {
      limit: initialPageSize,
      userId: this.senderId || undefined,
    });

    if (pouchResult.messages.length > 0) {
      const withRoomId = pouchResult.messages.map((m) => ({ ...m, roomId }));
      const enriched = await this.enrichMessagesWithSenderNames(
        withRoomId,
        roomId
      );
      const decrypted = await Promise.all(
        enriched.map(async (msg) => {
          const t = (msg as any).text;
          if (typeof t === 'string' && t) {
            try {
              const dec = await this.encryptionService.decrypt(t);
              return { ...msg, text: dec };
            } catch {
              return msg;
            }
          }
          return msg;
        })
      );
      // 🔥 FIX Issue 2: Additional filter using isMessageVisible for safety
      const asIMessage: IMessage[] = decrypted
        .filter((m) =>
          this.senderId ? this.isMessageVisible(m, this.senderId) : true
        )
        .map((m) => ({
          ...m,
          isMe: m.sender === this.senderId,
          roomId,
        }));

      this._roomPaginationState.set(roomId, {
        messages: asIMessage,
        oldestLoadedTimestamp: pouchResult.oldestTimestamp,
        newestLoadedTimestamp: pouchResult.newestTimestamp,
        hasMoreOlder: pouchResult.hasMore,
      });
      this.emitRoomMessages(roomId, asIMessage);
      this._isInitialLoading = false;

      if (this.currentChat?.type === 'private') {
        await this.cacheReceiverLastSeen(roomId);
      }
      this.scheduleBackgroundPreload(roomId);
      return;
    }

    if (!this.networkService.isOnline.value) {
      this.emitRoomMessages(roomId, []);
      this._isInitialLoading = false;
      return;
    }

    let removedOrLeftAt: string | null = null;
    try {
      const userChatRef = rtdbRef(
        this.db,
        `userchats/${this.senderId}/${roomId}`
      );
      const userChatSnap = await rtdbGet(userChatRef);
      if (userChatSnap.exists()) {
        const d = userChatSnap.val();
        removedOrLeftAt = d?.removedOrLeftAt?.toString() || null;
      }
    } catch {
      removedOrLeftAt = null;
    }

    const baseRef = rtdbRef(this.db, `chats/${roomId}`);
    const q = removedOrLeftAt
      ? query(
          baseRef,
          orderByChild('timestamp'),
          endAt(Number(removedOrLeftAt)),
          limitToLast(initialPageSize)
        )
      : query(baseRef, orderByChild('timestamp'), limitToLast(initialPageSize));

    const snap = await rtdbGet(q);
    const children: DataSnapshot[] = [];
    snap.forEach((c: any) => {
      children.push(c);
    });

    // Legacy fallback: do not merge separate private_messages stream by default.
    // This app now uses /chats as single source-of-truth and blockedSend filtering.
    const mergePrivateMessageFallback = false;
    if (mergePrivateMessageFallback) {
      const myId = this.senderId || this.authService.authData?.userId;
      const privateRef = rtdbRef(this.db, `private_messages/${myId}/${roomId}`);
      const privateSnap = await rtdbGet(privateRef);
      if (privateSnap.exists()) {
        privateSnap.forEach((c: any) => {
          if (!children.some((child) => child.key === c.key)) {
            children.push(c);
          }
        });
      }
    }

    const fetched: IMessage[] = [];
    for (const s of children) {
      const m = await this.snapToMsgFromSnapshot(roomId, s, removedOrLeftAt);
      if (m && this.senderId && this.isMessageVisible(m, this.senderId)) {
        fetched.push(m);
      } else if (m && !this.senderId) {
        fetched.push(m); // Fallback if senderId not available
      }
    }

    const enriched = await this.enrichMessagesWithSenderNames(fetched, roomId);
    // 🔥 FIX Issue 2: Filter deleted messages before saving to cache
    const asIMessage: IMessage[] = enriched
      .filter((m) =>
        this.senderId ? this.isMessageVisible(m, this.senderId) : true
      )
      .map((m) => ({
        ...m,
        isMe: m.sender === this.senderId,
        roomId,
      }))
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

    await this.chatPouchDb.saveMessages(
      roomId,
      asIMessage.map(
        (m) =>
          ({ ...m, syncStatus: 'synced', localTimestamp: Date.now() } as any)
      ),
      true
    );

    const oldest =
      asIMessage.length > 0
        ? Math.min(
            ...asIMessage.map((m) => Number(new Date(m.timestamp).getTime()))
          )
        : null;
    const newest =
      asIMessage.length > 0
        ? Math.max(
            ...asIMessage.map((m) => Number(new Date(m.timestamp).getTime()))
          )
        : null;

    this._roomPaginationState.set(roomId, {
      messages: asIMessage,
      oldestLoadedTimestamp: oldest,
      newestLoadedTimestamp: newest,
      hasMoreOlder: children.length === initialPageSize,
    });
    this.emitRoomMessages(roomId, asIMessage);
    this._isInitialLoading = false;

    if (this.currentChat?.type === 'private') {
      await this.cacheReceiverLastSeen(roomId);
    }
    this.scheduleBackgroundPreload(roomId);
  }

  async applySecuredBatchUpdates(updates: Record<string, any>): Promise<any> {
    return this.chatBackendSocket.applySecuredBatchUpdates({ updates });
  }

  /**
   * After initial 10 messages are shown, load older in background in 20-message batches until 200 total or no more.
   */
  private scheduleBackgroundPreload(roomId: string): void {
    this._backgroundPreloadAbort.set(roomId, false);
    Promise.resolve().then(() => this.runBackgroundPreload(roomId));
  }

  private async runBackgroundPreload(roomId: string): Promise<void> {
    const maxTotal = this.MAX_INITIAL_TOTAL_MESSAGES;
    const maxBatches = 15;

    for (let i = 0; i < maxBatches; i++) {
      if (this._backgroundPreloadAbort.get(roomId)) break;

      const state = this._roomPaginationState.get(roomId);
      if (!state?.hasMoreOlder || state.oldestLoadedTimestamp == null) break;
      if (state.messages.length >= maxTotal) break;

      await this.loadOlderMessages(roomId);
    }
    this._allBatchesComplete$.next(true);
  }

  /** Decode Firebase snapshot to IMessage (with decrypt). */
  private async snapToMsgFromSnapshot(
    roomId: string,
    s: DataSnapshot,
    removedOrLeftAt: string | null
  ): Promise<IMessage | null> {
    const payload = s.val() ?? {};
    const msgKey = s.key!;
    if (
      removedOrLeftAt &&
      payload.timestamp &&
      Number(payload.timestamp) > Number(removedOrLeftAt)
    ) {
      return null;
    }
    let text = '';
    try {
      text = await this.encryptionService.decrypt(payload.text as string);
    } catch {
      text = payload.text ?? '';
    }

    // Also decrypt translations.original.text (may be encrypted in RTDB after edit or on send)
    let decryptedTranslations = payload.translations;
    if (payload.translations?.original?.text) {
      try {
        const decOrigText = await this.encryptionService.decrypt(payload.translations.original.text as string);
        decryptedTranslations = {
          ...payload.translations,
          original: { ...payload.translations.original, text: decOrigText },
        };
      } catch {
        // leave as-is
      }
    }

    return {
      msgId: msgKey,
      roomId,
      isMe: payload.sender === this.senderId,
      ...payload,
      text,
      translations: decryptedTranslations,
      ...(payload.attachment && { attachment: { ...payload.attachment } }),
    } as IMessage;
  }

  /**
   * Load older 20 messages (scroll up). Timestamp-based: from PouchDB then Firebase if needed.
   */
  async loadOlderMessages(roomId: string): Promise<void> {
    const state = this._roomPaginationState.get(roomId);
    if (!state?.hasMoreOlder || state.oldestLoadedTimestamp == null) {
      return;
    }

    this._isLoadingOlder = true;
    try {
      const pageSize = this.MESSAGES_PAGE_SIZE;
      // 🔥 FIX Issue 2: Pass userId to filter deleted messages
      const pouchResult = await this.chatPouchDb.getMessagesPaginated(roomId, {
        limit: pageSize,
        endBeforeTimestamp: state.oldestLoadedTimestamp,
        userId: this.senderId || undefined,
      });

      let older: IMessage[] = [];
      let hasMoreOlder: boolean = state.hasMoreOlder;

      if (pouchResult.messages.length > 0) {
        const withRoomId = pouchResult.messages.map((m) => ({ ...m, roomId }));
        const enriched = await this.enrichMessagesWithSenderNames(
          withRoomId,
          roomId
        );
        // 🔥 FIX Issue 2: Filter deleted messages
        older = enriched
          .filter((m) =>
            this.senderId ? this.isMessageVisible(m, this.senderId) : true
          )
          .map((m) => ({
            ...m,
            isMe: m.sender === this.senderId,
            roomId,
          }));
        hasMoreOlder = pouchResult.hasMore;
      }

      if (older.length === 0 && this.networkService.isOnline.value) {
        let removedOrLeftAt: string | null = null;
        try {
          const userChatRef = rtdbRef(
            this.db,
            `userchats/${this.senderId}/${roomId}`
          );
          const userChatSnap = await rtdbGet(userChatRef);
          if (userChatSnap.exists()) {
            const d = userChatSnap.val();
            removedOrLeftAt = d?.removedOrLeftAt?.toString() || null;
          }
        } catch {
          removedOrLeftAt = null;
        }

        const baseRef = rtdbRef(this.db, `chats/${roomId}`);
        const q = query(
          baseRef,
          orderByChild('timestamp'),
          endAt(state.oldestLoadedTimestamp - 1),
          limitToLast(pageSize)
        );
        const snap = await rtdbGet(q);
        const children: DataSnapshot[] = [];
        snap.forEach((c: any) => {
          children.push(c);
        });

        // Legacy fallback: do not merge private_messages unless explicitly enabled.
        const mergePrivateMessageFallback = false;
        if (mergePrivateMessageFallback) {
          const myId = this.senderId || this.authService.authData?.userId;
          const privateRef = rtdbRef(
            this.db,
            `private_messages/${myId}/${roomId}`
          );
          const qPrivate = query(
            privateRef,
            orderByChild('timestamp'),
            endAt(state.oldestLoadedTimestamp - 1),
            limitToLast(pageSize)
          );
          const privateSnap = await rtdbGet(qPrivate);
          if (privateSnap.exists()) {
            privateSnap.forEach((c: any) => {
              if (!children.some((child) => child.key === c.key)) {
                children.push(c);
              }
            });
          }
        }

        for (const s of children) {
          const m = await this.snapToMsgFromSnapshot(
            roomId,
            s,
            removedOrLeftAt
          );
          // 🔥 FIX Issue 2: Filter deleted messages when loading from Firebase
          if (m && this.senderId && this.isMessageVisible(m, this.senderId)) {
            older.push(m);
          } else if (m && !this.senderId) {
            older.push(m); // Fallback if senderId not available
          }
        }
        if (older.length > 0) {
          const enriched = await this.enrichMessagesWithSenderNames(
            older,
            roomId
          );
          // 🔥 FIX Issue 2: Additional filter for safety
          older = enriched
            .filter((m) =>
              this.senderId ? this.isMessageVisible(m, this.senderId) : true
            )
            .map((m) => ({
              ...m,
              isMe: m.sender === this.senderId,
              roomId,
            }));
          const existingCached = await this.chatPouchDb.getMessages(roomId);
          const merged = [...existingCached];
          for (const msg of older) {
            if (!merged.some((x) => x.msgId === msg.msgId)) {
              merged.push(msg as any);
            }
          }
          merged.sort(
            (a: any, b: any) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          await this.chatPouchDb.saveMessages(roomId, merged, true);
        }
        hasMoreOlder = (older.length === pageSize) as boolean;
      }

      if (older.length === 0) {
        this._roomPaginationState.set(roomId, {
          ...state,
          hasMoreOlder: false,
        });
        return;
      }

      const newOldest = Math.min(
        ...older.map((m) => Number(new Date(m.timestamp).getTime()))
      );
      const combined = [...older, ...state.messages];
      this._roomPaginationState.set(roomId, {
        messages: combined,
        oldestLoadedTimestamp: newOldest,
        newestLoadedTimestamp: state.newestLoadedTimestamp,
        hasMoreOlder,
      });
      this.emitRoomMessages(roomId, combined);
    } finally {
      this._isLoadingOlder = false;
    }
  }

  /**
   * Fetch a single message by id for reply preview. Tries PouchDB first, then Firebase.
   * Returns message with text and sender_phone (and other fields) or null.
   */
  async getMessageByIdForReply(
    roomId: string,
    msgId: string
  ): Promise<IMessage | null> {
    const fromPouch = await this.chatPouchDb.getMessageById(roomId, msgId);
    if (fromPouch) {
      // Ensure text is decrypted before using it for reply preview
      let decryptedText: string | undefined =
        (fromPouch as any).text ?? undefined;
      if (decryptedText) {
        try {
          decryptedText = await this.encryptionService.decrypt(
            decryptedText as string
          );
        } catch {
          // Fall back to stored text if decrypt fails
        }
      }

      const withRoomId = {
        ...fromPouch,
        roomId,
        ...(decryptedText ? { text: decryptedText } : {}),
      };

      const enriched = await this.enrichMessagesWithSenderNames(
        [withRoomId],
        roomId
      );
      const msg = enriched[0] ?? withRoomId;

      return {
        ...msg,
        isMe: msg.sender === this.senderId,
        roomId,
      } as IMessage;
    }

    if (!this.networkService.isOnline.value) return null;

    try {
      const msgRef = rtdbRef(this.db, `chats/${roomId}/${msgId}`);
      let snap = await rtdbGet(msgRef);

      if (!snap.exists()) {
        const myId = this.senderId || this.authService.authData?.userId;
        const privateRef = rtdbRef(
          this.db,
          `private_messages/${myId}/${roomId}/${msgId}`
        );
        snap = await rtdbGet(privateRef);
      }
      if (!snap.exists()) return null;

      let removedOrLeftAt: string | null = null;
      try {
        const userChatRef = rtdbRef(
          this.db,
          `userchats/${this.senderId}/${roomId}`
        );
        const userChatSnap = await rtdbGet(userChatRef);
        if (userChatSnap.exists()) {
          const d = userChatSnap.val();
          removedOrLeftAt = d?.removedOrLeftAt?.toString() || null;
        }
      } catch {
        removedOrLeftAt = null;
      }

      const m = await this.snapToMsgFromSnapshot(roomId, snap, removedOrLeftAt);
      if (!m) return null;

      const enriched = await this.enrichMessagesWithSenderNames([m], roomId);
      const out = enriched[0];
      return out
        ? ({ ...out, isMe: out.sender === this.senderId, roomId } as IMessage)
        : m;
    } catch (err) {
      console.warn('getMessageByIdForReply Firebase failed', err);
      return null;
    }
  }

  // ============================================================
  // ✅ UTILITY: Canonical roomId generator (SINGLE SOURCE OF TRUTH)
  // ============================================================

  /**
   * ALWAYS use this method to generate private chat roomIds.
   * Numeric comparison ensures "4_17" is always used, never "17_4".
   */
  private getCanonicalRoomId(idA: string, idB: string): string {
    const a = Number(idA);
    const b = Number(idB);

    if (!isNaN(a) && !isNaN(b) && a > 0 && b > 0) {
      return a < b ? `${a}_${b}` : `${b}_${a}`;
    }

    // Non-numeric fallback
    return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
  }

  /**
   * Validate that a roomId is in canonical form.
   * Returns canonical version if not, for safety.
   */
  private ensureCanonicalRoomId(roomId: string): string {
    if (!roomId || !roomId.includes('_')) return roomId;

    // Skip group/community roomIds
    if (roomId.startsWith('group_') || roomId.startsWith('community_')) {
      return roomId;
    }

    const parts = roomId.split('_');
    if (parts.length !== 2) return roomId;

    return this.getCanonicalRoomId(parts[0], parts[1]);
  }

  getRoomIdFor1To1(senderId: string, receiverId: string): string {
    return this.getCanonicalRoomId(senderId, receiverId);
  }

  private presenceCleanUp: any = null;

  listenToTypingStatus(roomId: string, userId: string): () => void {
    const typingRef = ref(this.db, `typing/${roomId}/${userId}`);

    const unsubscribe = onValue(typingRef, (snap) => {
      const isTyping = snap.val() || false;

      // Update the membersPresence map with typing status
      const currentPresence = this.membersPresence.get(userId);
      if (currentPresence) {
        this.membersPresence.set(userId, {
          ...currentPresence,
          isTyping,
        });
      } else {
        this.membersPresence.set(userId, {
          isOnline: false,
          lastSeen: null,
          isTyping,
        });
      }

      // Also update the typing status map
      const current = new Map(this._typingStatus$.value);
      current.set(userId, isTyping);
      this._typingStatus$.next(current);

      // Emit presence update
      this._presenceSubject$.next(new Map(this.membersPresence));
    });

    return unsubscribe;
  }

  private typingDebounceTimer: any = null;

  setTypingStatus(isTyping: boolean, roomId?: string) {
    const targetRoomId = roomId || this.currentChat?.roomId;
    if (!targetRoomId || !this.senderId) return;

    this.chatBackendSocket.setTypingStatus(targetRoomId, isTyping);
  }

  // async openChat(chat: any, isNew: boolean = false) {
  //   try {
  //     this._allBatchesComplete$.next(false);
  //     console.log('📂 Opening chat:', chat.roomId);

  //     // 🔥 Always reset pagination for this room so we don't reuse
  //     // stale in-memory message lists when reopening a chat.
  //     if (chat.roomId) {
  //       this.resetPagination(chat.roomId);
  //     }

  //     // ✅ CRITICAL: Clear native stored messages to prevent old notifications in badge
  //     if (chat.roomId) {
  //       await this.clearNativeStoredMessages(chat.roomId);
  //     }

  //     let conv: any = null;

  //     // ✅ STEP 1: Check in-memory cache first
  //     if (!isNew) {
  //       conv = this.currentConversations.find((c) => c.roomId === chat.roomId);

  //       if (conv) {
  //         console.log('✅ Using in-memory conversation');
  //         this.currentChat = { ...conv };

  //         await this.initialLoad(conv.roomId);
  //         await this.setupBackgroundDeletionListener(
  //           conv.roomId,
  //           this.authService.authData?.userId as string
  //         );

  //         // ✅ Setup listeners (non-blocking)
  //         this.setupChatListeners(conv);

  //         // ✅ Background sync (only if online)
  //         if (this.networkService.isOnline.value) {
  //           this.syncChatInBackground(conv).catch((err) =>
  //             console.warn('Background sync failed:', err)
  //           );
  //         }

  //         return;
  //       }
  //     }

  //     // ✅ STEP 2: Try PouchDB cache
  //     if (!conv && !isNew) {
  //       try {
  //         conv = await this.chatPouchDb.getConversation(chat.roomId);
  //         if (conv) {
  //           console.log('✅ Loaded conversation from PouchDB');
  //           this.currentChat = { ...conv };

  //           await this.initialLoad(conv.roomId);
  //           // Setup listeners
  //           this.setupChatListeners(conv);

  //           // Background sync
  //           if (this.networkService.isOnline.value) {
  //             this.syncChatInBackground(conv).catch((err) =>
  //               console.warn('Background sync failed:', err)
  //             );
  //           }

  //           return;
  //         }
  //       } catch (cacheErr) {
  //         console.warn('PouchDB cache load failed:', cacheErr);
  //       }
  //     }

  //     // ✅ STEP 3: Build minimal conversation (no API calls)
  //     conv = this.buildMinimalConversation(chat, isNew);
  //     this.currentChat = { ...conv };

  //     await this.initialLoad(conv.roomId);
  //     // ✅ STEP 5: Setup listeners
  //     this.setupChatListeners(conv);

  //     // ✅ STEP 6: Background sync (only if online)
  //     if (this.networkService.isOnline.value) {
  //       this.syncChatInBackground(conv).catch((err) =>
  //         console.warn('Background sync failed:', err)
  //       );
  //     }

  //     console.log('✅ Chat opened instantly');
  //   } catch (error) {
  //     console.error('❌ Error in openChat:', error);
  //   }
  // }

  async openChat(chat: any, isNew: boolean = false) {
    try {
      if (
        chat?.roomId &&
        !chat.roomId.startsWith('group_') &&
        !chat.roomId.startsWith('community_')
      ) {
        const canonical = this.ensureCanonicalRoomId(chat.roomId);
        if (canonical !== chat.roomId) {
          console.warn(
            `⚠️ openChat: fixing non-canonical roomId ${chat.roomId} → ${canonical}`
          );
          chat = { ...chat, roomId: canonical };
        }
      }
      this._allBatchesComplete$.next(false);
      console.log('📂 Opening chat:', chat.roomId);

      if (chat.roomId) {
        this.resetPagination(chat.roomId);
      }

      if (chat.roomId) {
        await this.clearNativeStoredMessages(chat.roomId);
      }

      let conv: any = null;

      // ✅ STEP 1: Check in-memory cache first
      if (!isNew) {
        conv = this.currentConversations.find((c) => c.roomId === chat.roomId);

        if (conv) {
          console.log('✅ Using in-memory conversation');
          this.currentChat = { ...conv };

          await this.initialLoad(conv.roomId);

          // ✅ START DISAPPEARING TIMER
          this.startDisappearingTimer(conv.roomId);

          await this.setupBackgroundDeletionListener(
            conv.roomId,
            this.authService.authData?.userId as string
          );

          this.setupChatListeners(conv);

          if (this.networkService.isOnline.value) {
            this.syncChatInBackground(conv).catch((err) =>
              console.warn('Background sync failed:', err)
            );
          }

          return;
        }
      }

      // ✅ STEP 2: Try PouchDB cache
      if (!conv && !isNew) {
        try {
          conv = await this.chatPouchDb.getConversation(chat.roomId);
          if (conv) {
            console.log('✅ Loaded conversation from PouchDB');
            this.currentChat = { ...conv };

            await this.initialLoad(conv.roomId);

            // ✅ START DISAPPEARING TIMER
            this.startDisappearingTimer(conv.roomId);

            this.setupChatListeners(conv);

            if (this.networkService.isOnline.value) {
              this.syncChatInBackground(conv).catch((err) =>
                console.warn('Background sync failed:', err)
              );
            }

            return;
          }
        } catch (cacheErr) {
          console.warn('PouchDB cache load failed:', cacheErr);
        }
      }

      // ✅ STEP 3: Build minimal conversation
      conv = this.buildMinimalConversation(chat, isNew);
      this.currentChat = { ...conv };

      await this.initialLoad(conv.roomId);

      // ✅ START DISAPPEARING TIMER
      this.startDisappearingTimer(conv.roomId);

      this.setupChatListeners(conv);

      if (this.networkService.isOnline.value) {
        this.syncChatInBackground(conv).catch((err) =>
          console.warn('Background sync failed:', err)
        );
      }

      console.log('✅ Chat opened instantly');
    } catch (error) {
      console.error('❌ Error in openChat:', error);
    }
  }

  /**
   * 🔥 Build minimal conversation object (no API calls)
   */
  private buildMinimalConversation(chat: any, isNew: boolean): IConversation {
    if (isNew) {
      const { receiver }: { receiver: IUser } = chat;
      // const roomId = this.getRoomIdFor1To1(
      //   this.senderId as string,
      //   receiver.userId
      // );

      const roomId = this.getCanonicalRoomId(
        this.senderId as string,
        receiver.userId
      );

      return {
        title: receiver.username,
        type: 'private',
        roomId: roomId,
        members: [this.senderId, receiver.userId],
      } as unknown as IConversation;
    }

    // const roomIdToFind = chat.roomId || chat;

    const rawRoomId = chat.roomId || chat;
    const roomIdToFind =
      typeof rawRoomId === 'string' &&
      rawRoomId.includes('_') &&
      !rawRoomId.startsWith('group_') &&
      !rawRoomId.startsWith('community_')
        ? this.ensureCanonicalRoomId(rawRoomId)
        : rawRoomId;

    // Use existing data from chat object
    return {
      roomId: roomIdToFind,
      type: chat.type || 'private',
      title: chat.title || chat.name || roomIdToFind,
      phoneNumber: chat.phoneNumber || '',
      members: chat.members || [],
      unreadCount: chat.unreadCount || 0,
    } as IConversation;
  }

  getResolvedChatTitle(chat: any): string | null {
    if (!chat) {
      console.warn('No chat provided to getResolvedChatTitle');
      return 'Chat';
    }

    // For groups and communities, use title directly
    if (chat.type !== 'private') {
      console.log('Group/Community chat, using title:', chat.title);
      return chat.title || 'Chat';
    }

    if (chat.roomId) {
      const parts = chat.roomId.split('_');
      const receiverId =
        parts.find((p: string) => p !== this.senderId) ??
        parts[parts.length - 1];

      const platformUser = this._platformUsers$.value.find(
        (u) => String(u.userId) === String(receiverId)
      );

      // Prefer device_contact_name from matched contacts
      if ((platformUser as any)?.device_contact_name) {
        return (platformUser as any).device_contact_name;
      }
    }

    // For private chats, try to match with device contacts (phone-based fallback)
    const title = chat.title;
    const phoneNumber = chat.phoneNumber;

    console.log('📞 Private chat - Title:', title, 'Phone:', phoneNumber);

    // We do not fall back to platform username. Prefer device contact name by phone, else phone number, else title.

    // Get device contacts
    const deviceContacts = this.currentDeviceContacts;

    if (!deviceContacts || deviceContacts.length === 0) {
      // No device contacts available; use phone if present, else title
      return phoneNumber || title || 'Chat';
    }

    console.log('📱 Device contacts available:', deviceContacts.length);

    // Normalize phone number (remove non-digits)
    const normalizedPhone = String(phoneNumber || title || '').replace(
      /\D/g,
      ''
    );

    if (!normalizedPhone || normalizedPhone.length < 10) {
      return phoneNumber || title || 'Chat';
    }

    // Get last 10 digits for matching
    const last10 = normalizedPhone.slice(-10);
    console.log('🔍 Matching last 10 digits:', last10);

    // Find matching device contact
    const deviceContact = deviceContacts.find((dc: any) => {
      const dcPhone = dc.phoneNumber?.replace(/\D/g, '');
      const dcLast10 = dcPhone?.slice(-10);

      if (dcLast10 === last10) {
        console.log('✅ Match found:', dc.username, '→', dc.phoneNumber);
        return true;
      }
      return false;
    });

    // Return device contact name if found, otherwise original title
    if (deviceContact && deviceContact.username) {
      console.log(
        '✅✅ Device contact matched! Using name:',
        deviceContact.username
      );
      return deviceContact.username;
    }

    // Fallback to phone number, then title
    return phoneNumber || title || 'Chat';
  }

  /**
   * 🔥 UPDATED: Load messages with group member names and last seen
   */
  private async loadMessagesFromCache(roomId: string): Promise<void> {
    try {
      const cachedMessages = await this.chatPouchDb.getMessages(roomId);
      console.log('cached messages are : ', cachedMessages);

      if (cachedMessages.length > 0) {
        // 🔥 CRITICAL: Ensure all messages have correct roomId
        const messagesWithRoomId = cachedMessages.map((msg) => ({
          ...msg,
          roomId: roomId, // Explicitly set roomId to prevent mixing
        }));
        // 🔥 Sort by timestamp before displaying
        const sortedMessages = messagesWithRoomId.sort(
          (a, b) => (a.timestamp as any) - (b.timestamp as any)
        );

        // 🔥 NEW: Enrich messages with sender names for groups
        const enrichedMessages = await this.enrichMessagesWithSenderNames(
          sortedMessages,
          roomId
        );

        // 🔐 Decrypt cached texts so previews (incl. pinned banner) show plaintext after reopen
        const decryptedMessages = await Promise.all(
          enrichedMessages.map(async (msg) => {
            const t = (msg as any).text;
            // let result: any = msg;
            if (typeof t === 'string' && t) {
              try {
              } catch {
                return msg;
                // leave as-is
              }
            }
            return msg;
            // return result;
          })
        );

        decryptedMessages.forEach((msg) => this.pushMsgToChat(msg));

        console.log(
          `✅ Loaded ${cachedMessages.length} messages from cache for room ${roomId} (with sender names)`
        );

        // 🔥 Update receipts-based status for each message in background
        decryptedMessages.forEach(async (msg) => {
          if (msg.sender === this.senderId && msg.receipts) {
            await this.updateMessageStatusFromReceipts(msg);
          }
        });

        // 🔥 Update messages in UI with cached sender names
        this.markPendingMessagesInUI(roomId, decryptedMessages);
      }

      // 🔥 NEW: Cache last seen for private chats
      if (this.currentChat?.type === 'private') {
        await this.cacheReceiverLastSeen(roomId);
      }
    } catch (error) {
      console.warn('Cache load failed:', error);
    }
  }

  /**
   * 🔥 NEW: Cache receiver's last seen (for private chats)
   */
  private async cacheReceiverLastSeen(roomId: string): Promise<void> {
    try {
      const parts = roomId.split('_');
      const receiverId =
        parts.find((p) => p !== this.senderId) ?? parts[parts.length - 1];

      const presence = this.membersPresence.get(receiverId);

      if (presence) {
        await this.chatPouchDb.cachePresence(receiverId, {
          isOnline: presence.isOnline,
          lastSeen: presence.lastSeen,
        });
      }
    } catch (error) {
      console.warn('Failed to cache last seen:', error);
    }
  }

  /**
   * 🔥 Setup chat listeners (non-blocking)
   */
  private setupChatListeners(conv: any) {
    // Setup presence listeners
    let memberIds: string[] = [];
    if (conv.type === 'private') {
      const parts = conv.roomId.split('_');
      const receiverId =
        parts.find((p: string) => p !== this.senderId) ??
        parts[parts.length - 1];
      memberIds.push(receiverId);
    } else {
      memberIds = conv.members || [];
    }

    this.presenceCleanUp = this.isReceiverOnline(memberIds);

    // Setup typing listeners
    const typingUnsubscribers: (() => void)[] = [];
    for (const memberId of memberIds) {
      if (memberId !== this.senderId) {
        const unsub = this.listenToTypingStatus(conv.roomId, memberId);
        typingUnsubscribers.push(unsub);
      }
    }

    const originalCleanup = this.presenceCleanUp;
    this.presenceCleanUp = () => {
      originalCleanup?.();
      typingUnsubscribers.forEach((unsub) => {
        try {
          unsub();
        } catch (e) {}
      });
    };
  }

  private async syncMessageStatuses(roomId: string): Promise<void> {
    try {
      console.log('🔄 Syncing message statuses for room:', roomId);

      // Get messages from Firebase
      const messagesRef = rtdbRef(this.db, `chats/${roomId}`);
      const snapshot = await rtdbGet(messagesRef);

      if (!snapshot.exists()) {
        console.log('No messages to sync statuses for');
        return;
      }

      const messages = snapshot.val();
      const statusUpdates: Array<{
        msgId: string;
        receipts: any;
        status: any;
      }> = [];

      // Collect all status updates
      Object.keys(messages).forEach((msgId) => {
        const msg = messages[msgId];

        if (msg.receipts) {
          statusUpdates.push({
            msgId,
            receipts: msg.receipts,
            status: msg.status,
          });
        }
      });

      console.log(
        `📊 Found ${statusUpdates.length} messages with status updates`
      );

      // Update PouchDB in batch
      const cachedMessages = await this.chatPouchDb.getMessages(roomId);

      for (const update of statusUpdates) {
        const msgIndex = cachedMessages.findIndex(
          (m) => m.msgId === update.msgId
        );

        if (msgIndex >= 0) {
          cachedMessages[msgIndex].receipts = update.receipts;
          cachedMessages[msgIndex].status = update.status;
          cachedMessages[msgIndex].roomId = roomId; // 🔥 Ensure roomId is set
        }
      }

      // 🔥 Ensure all messages have roomId before saving
      const messagesWithRoomId = cachedMessages.map((msg) => ({
        ...msg,
        roomId: roomId,
      }));

      // Save updated messages
      await this.chatPouchDb.saveMessages(roomId, messagesWithRoomId, true);

      // Update UI
      const currentMessages = this._messages$.value.get(roomId) || [];
      const updatedMessages = currentMessages.map((msg) => {
        const update = statusUpdates.find((u) => u.msgId === msg.msgId);
        if (update) {
          return {
            ...msg,
            receipts: update.receipts,
            status: update.status,
          };
        }
        return msg;
      });

      const messageMap = new Map(this._messages$.value);
      messageMap.set(roomId, updatedMessages);
      this._messages$.next(messageMap);

      console.log('✅ Message statuses synced successfully');
    } catch (error) {
      console.error('❌ Error syncing message statuses:', error);
    }
  }

  /**
   * 🔥 NEW: Real-time status sync - updates UI immediately
   */
  async syncMessageStatusesRealtime(roomId: string): Promise<void> {
    try {
      console.log('🔄 Real-time status sync for room:', roomId);

      const messagesRef = rtdbRef(this.db, `chats/${roomId}`);
      const snapshot = await rtdbGet(messagesRef);

      if (!snapshot.exists()) {
        console.log('No messages to sync');
        return;
      }

      const firebaseMessages = snapshot.val();
      const messageMap = new Map(this._messages$.value);
      const currentMessages = messageMap.get(roomId) || [];

      // Track which messages need updates
      const updatesToApply: Array<{
        index: number;
        msgId: string;
        receipts: any;
        status: any;
      }> = [];

      // 🔥 OPTIMIZATION: Batch process status updates
      currentMessages.forEach((msg, index) => {
        const fbMsg = firebaseMessages[msg.msgId as string];

        if (fbMsg && (fbMsg.receipts || fbMsg.status)) {
          // Check if status needs update
          const needsUpdate =
            JSON.stringify(msg.receipts) !== JSON.stringify(fbMsg.receipts) ||
            msg.status !== fbMsg.status;

          if (needsUpdate) {
            updatesToApply.push({
              index,
              msgId: msg.msgId as string,
              receipts: fbMsg.receipts,
              status: fbMsg.status,
            });
          }
        }
      });

      if (updatesToApply.length === 0) {
        console.log('✅ All statuses are up to date');
        return;
      }

      console.log(`📊 Updating ${updatesToApply.length} message statuses`);

      // 🔥 CRITICAL: Update UI in Angular zone
      this.zone.run(() => {
        const updatedMessages = [...currentMessages];

        updatesToApply.forEach(({ index, receipts, status }) => {
          updatedMessages[index] = {
            ...updatedMessages[index],
            receipts,
            status,
            // Removed isPending - not part of IMessage interface
          };
        });

        messageMap.set(roomId, updatedMessages);
        this._messages$.next(messageMap);
      });

      // 🔥 Background: Update PouchDB cache
      this.updateStatusesInCache(roomId, updatesToApply).catch((err) =>
        console.warn('Cache update failed:', err)
      );

      console.log('✅ Real-time status sync completed');
    } catch (error) {
      console.error('❌ Real-time status sync error:', error);
    }
  }

  /**
   * 🔥 Helper: Update statuses in PouchDB cache (background)
   */
  private async updateStatusesInCache(
    roomId: string,
    updates: Array<{ msgId: string; receipts: any; status: any }>
  ): Promise<void> {
    try {
      const cachedMessages = await this.chatPouchDb.getMessages(roomId);

      updates.forEach(({ msgId, receipts, status }) => {
        const index = cachedMessages.findIndex((m) => m.msgId === msgId);
        if (index >= 0) {
          cachedMessages[index].receipts = receipts;
          cachedMessages[index].status = status;
          cachedMessages[index].syncStatus = 'synced';
          cachedMessages[index].roomId = roomId; // 🔥 Ensure roomId is set
        }
      });

      // 🔥 Ensure all messages have roomId before saving
      const messagesWithRoomId = cachedMessages.map((msg) => ({
        ...msg,
        roomId: roomId,
      }));

      await this.chatPouchDb.saveMessages(roomId, messagesWithRoomId, true);
      console.log(
        `✅ Updated ${updates.length} statuses in cache for room ${roomId}`
      );
    } catch (error) {
      console.warn('Cache status update failed:', error);
    }
  }

  /**
   * 🔥 NEW: Enrich messages with sender names (for groups)
   */
  private async enrichMessagesWithSenderNames(
    messages: any[],
    roomId: string
  ): Promise<any[]> {
    if (this.currentChat?.type === 'private') {
      return messages;
    }

    try {
      // ── 1. Try group_details_ cache ──────────────────────────────────
      const groupDetails = await this.chatPouchDb.getCachedGroupDetails(roomId);
      const cachedMembers = groupDetails?.members;

      if (cachedMembers && cachedMembers.length > 0) {
        return this.mapSenderNamesToMessages(messages, cachedMembers);
      }

      // ── 2. Try group_ doc ────────────────────────────────────────────
      const groupDoc = await this.chatPouchDb.getGroup(roomId);
      if (groupDoc?.members) {
        const membersArray = Object.entries(groupDoc.members).map(
          ([userId, memberData]: [string, any]) => ({
            user_id: userId,
            username: memberData.username || memberData.contactName || userId,
            phoneNumber: memberData.phoneNumber || '',
            contactName: memberData.contactName,
          })
        );
        if (membersArray.length > 0) {
          return this.mapSenderNamesToMessages(messages, membersArray);
        }
      }

      // ── 3. Try cached conversation (has members array) ───────────────
      // ✅ FIX 2: Extra PouchDB fallback before hitting Firebase
      try {
        const cachedConv = await this.chatPouchDb.getCachedConversation(roomId);
        if (cachedConv?.members && cachedConv.members.length > 0) {
          const membersArray = cachedConv.members.map((userId: string) => ({
            user_id: userId,
            username: userId,
            phoneNumber: '',
          }));
          return this.mapSenderNamesToMessages(messages, membersArray);
        }
      } catch (convErr) {
        console.warn('[enrichMessages] conv fallback failed:', convErr);
      }

      // ── 4. Only hit Firebase if online ────────────────────────────────
      if (!this.networkService.isOnline.value) {
        console.warn(
          `[enrichMessages] Offline and no cached members for ${roomId} — showing messages without sender names`
        );
        // ✅ FIX 2: Return original messages, never empty array
        return messages;
      }

      const { groupMembers } = await this.fetchGroupWithProfiles(roomId);

      await this.chatPouchDb.cacheGroupDetails(roomId, {
        meta: {},
        members: groupMembers,
        adminIds: [],
      });

      return this.mapSenderNamesToMessages(messages, groupMembers);
    } catch (error) {
      console.warn('Failed to enrich messages:', error);
      // ✅ FIX 2: Always return original messages on any error
      return messages;
    }
  }

  /**
   * 🔥 Helper: Map sender names to messages
   */
  private mapSenderNamesToMessages(messages: any[], members: any[]): any[] {
    const senderNameMap = new Map<string, string>();

    members.forEach((member: any) => {
      // Priority: device contact name > username > phone number
      const displayName =
        member.contactName ||
        member.username ||
        member.phoneNumber ||
        member.user_id;

      senderNameMap.set(member.user_id, displayName);
    });

    // Enrich messages with sender names
    return messages.map((msg) => ({
      ...msg,
      sender_name:
        msg.sender === this.senderId
          ? 'You'
          : senderNameMap.get(msg.sender) || msg.sender_name || msg.sender,
    }));
  }

  /**
   * 🔥 Helper: Mark pending messages in UI
   */
  private markPendingMessagesInUI(roomId: string, messages: any[]): void {
    const messageMap = new Map(this._messages$.value);
    const currentMessages = messageMap.get(roomId) || [];

    const updatedMessages = currentMessages.map((msg) => {
      const cachedMsg = messages.find((m) => m.msgId === msg.msgId);

      // Create updated message object
      const updatedMsg: any = { ...msg };

      // Update sender_name if available from cache
      if (cachedMsg?.sender_name && cachedMsg.sender_name !== msg.sender_name) {
        updatedMsg.sender_name = cachedMsg.sender_name;
      }

      return updatedMsg;
    });

    messageMap.set(roomId, updatedMessages);
    this._messages$.next(messageMap);
  }

  private async syncChatInBackground(conv: any) {
    try {
      // Set active chat
      await this.setActiveChat(conv.roomId);

      // Get removedOrLeftAt timestamp
      let removedOrLeftAt: string | null = null;

      // ✅ Check membership for groups
      if (conv.type === 'group') {
        const userChatRef = rtdbRef(
          this.db,
          `userchats/${this.senderId}/${conv.roomId}`
        );
        const userChatSnap = await rtdbGet(userChatRef);

        if (userChatSnap.exists()) {
          const userChatData = userChatSnap.val();
          removedOrLeftAt = userChatData.removedOrLeftAt?.toString() || null;
        }

        // ✅ NEW: Check if still a member before proceeding
        const groupMemberRef = rtdbRef(
          this.db,
          `groups/${conv.roomId}/members/${this.senderId}`
        );
        const memberSnap = await rtdbGet(groupMemberRef);

        if (!memberSnap.exists()) {
          console.log('⚠️ User is not a member - stopping background sync');
          return; // Exit early, don't set up listener
        }
      }

      // Sync messages with server
      await this.syncMessagesWithServer(removedOrLeftAt);

      // Sync message statuses
      await this.syncMessageStatuses(conv.roomId);

      // ✅ Only setup listener if user is still a member (checked above)
      this._roomMessageListner = await this.listenRoomStream(conv.roomId, {
        onAdd: async (msgKey, data, isNew) => {
          if (!this.currentChat || this.currentChat.roomId !== conv.roomId) {
            return;
          }

          if (isNew && data.sender !== this.senderId) {
            try {
              const normalized = this.normalizeDeletionFlags({
                ...data,
                msgId: msgKey,
              });
              const decryptedText = await this.encryptionService.decrypt(
                normalized.text as string
              );

              const { attachment, ...msg } = normalized as any;

              this.pushMsgToChat({
                msgId: msgKey,
                ...msg,
                text: decryptedText,
                attachment: attachment ? { ...attachment } : undefined,
              });

              if (this.currentChat?.roomId === conv.roomId) {
                await this.markAsDelivered(msgKey, null, conv.roomId);
              }
            } catch (err) {
              console.error('Error processing new message:', err);
            }
          }
        },

        onChange: async (msgKey, data) => {
          if (!this.currentChat || this.currentChat.roomId !== conv.roomId) {
            return;
          }

          const normalized = this.normalizeDeletionFlags({
            ...data,
            msgId: msgKey,
          });
          await this.updateMessageLocally(normalized as any);
          await this.updateMessageStatusFromReceipts({
            ...normalized,
            msgId: msgKey,
          });

          // ℹ️ PouchDB is already updated (with decrypted text + translations) inside updateMessageLocally above.
          // Do NOT write raw (encrypted) data to PouchDB here — it would overwrite the decrypted values.
        },

        onRemove(msgKey) {
          console.log(`Message removed: ${msgKey}`);
        },
      });

      // Set unread count
      await this.setUnreadCount();

      console.log('✅ Background sync completed');
    } catch (error) {
      console.warn('Background sync error:', error);
    }
  }

  async stopRoomListener() {
    try {
      console.log('this is stop room listener');
      await this._roomMessageListner();
    } catch (error) {
      console.error('#911', error);
    }
  }

  async setUnreadCount(roomId: string | null = null, count: number = 0) {
    try {
      if (!this.networkService.isOnline.value) {
        console.log('📴 Skipping setUnreadCount - offline');
        return;
      }

      const targetRoomId = roomId || this.currentChat?.roomId;
      if (!targetRoomId || !this.senderId) return;

      const isActiveChat = await this.hasUserOpenedChat(
        this.senderId,
        targetRoomId
      );
      if (!isActiveChat && count !== 0) {
        console.log('⚠️ Skipping unread count update - chat not active');
        return;
      }

      if (count === 0) {
        await this.chatBackendSocket.resetUnreadCount(targetRoomId);
      } else {
        // Increment logic is usually handled by backend on message send.
        // If frontend still needs to set arbitrary counts, we might need a backend listener for it.
        // For now, only 0 is supported as it's the most common case (reset).
        console.warn('⚠️ setUnreadCount with non-zero value called from frontend. Skipping RTDB write.');
      }

      // 🔥 NEW: Update PouchDB cache
      try {
        await this.chatPouchDb.updateConversationUnreadCount(
          this.senderId as string,
          targetRoomId,
          count
        );

        await this.chatPouchDb.updateUnreadCount(
          targetRoomId,
          this.senderId as string,
          count
        );
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB update failed:', cacheErr);
      }

      // 🔥 NEW: Update local BehaviorSubject
      const convs = this._conversations$.value;
      const idx = convs.findIndex((c) => c.roomId === targetRoomId);
      if (idx > -1) {
        convs[idx].unreadCount = count;
        this._conversations$.next([...convs]);
      }

      console.log(`✅ Unread count set to ${count} for ${targetRoomId}`);
    } catch (error) {
      console.error('❌ setUnreadCount error:', error);
    }
  }

  async resetUnreadCount(roomId?: string, count: number = 0) {
    const targetRoomId = roomId || this.currentChat?.roomId;
    if (!targetRoomId || !this.senderId) return;

    try {
      await this.chatBackendSocket.resetUnreadCount(targetRoomId);
      console.log(`✅ Unread count reset for ${targetRoomId}`);
    } catch (err) {
      console.warn('⚠️ Backend resetUnreadCount failed:', err);
    }
  }

  async markUnreadChat(roomId: string | null = null, count: number = 0) {
    const targetRoomId = roomId || this.currentChat?.roomId;
    if (!targetRoomId || !this.senderId) return;

    try {
      // 1. Write via backend socket using applySecuredBatchUpdates (already whitelisted)
      await this.chatBackendSocket.applySecuredBatchUpdates({
        updates: {
          [`userchats/${this.senderId}/${targetRoomId}/unreadCount`]: count,
          [`unreadCounts/${this.senderId}/${targetRoomId}`]: count,
        },
      });

      // 2. Update PouchDB cache
      try {
        await this.chatPouchDb.updateConversationUnreadCount(
          this.senderId as string,
          targetRoomId,
          count
        );
        await this.chatPouchDb.updateUnreadCount(
          targetRoomId,
          this.senderId as string,
          count
        );
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB update failed in markUnreadChat:', cacheErr);
      }

      // 3. Update local BehaviorSubject for immediate UI update
      const convs = this._conversations$.value;
      const idx = convs.findIndex((c) => c.roomId === targetRoomId);
      if (idx > -1) {
        convs[idx].unreadCount = count;
        this._conversations$.next([...convs]);
      }

      console.log(`✅ Unread count set to ${count} for ${targetRoomId}`);
    } catch (error) {
      console.error('❌ markUnreadChat error:', error);
    }
  }

  async closeChat() {
    try {
      console.log('🔴 Closing chat:', this.currentChat?.roomId);
      console.log('🔴 Closing chat sender id is:', this.senderId);
      console.log(
        '📡 Network status:',
        this.networkService.isOnline.value ? 'ONLINE' : 'OFFLINE'
      );

      if (this.currentChat?.roomId) {
        this.stopDisappearingTimer(this.currentChat.roomId);
      }

      // 🔥 FIX: Only clear active chat when online
      if (
        this.senderId &&
        this.currentChat?.roomId &&
        this.networkService.isOnline.value
      ) {
        try {
          await this.clearActiveChat();
          console.log('✅ Active chat cleared');
        } catch (error) {
          console.warn('⚠️ Failed to clear active chat:', error);
        }
      } else if (!this.networkService.isOnline.value) {
        console.log('📴 Skipping clearActiveChat - offline');
      }

      // 🔥 FIX: Only clear typing status when online
      if (
        this.currentChat?.roomId &&
        this.senderId &&
        this.networkService.isOnline.value
      ) {
        try {
          // ✅ SECURE UPDATE: Use backend socket to clear typing status
          this.chatBackendSocket.setTypingStatus(this.currentChat.roomId, false);

          console.log('✅ Typing status cleared');
        } catch (error) {
          console.warn('⚠️ Failed to clear typing status:', error);
        }
      } else if (!this.networkService.isOnline.value) {
        console.log('📴 Skipping typing status clear - offline');
      }

      // ✅ Always remove message listener (works offline)
      if (this._roomMessageListner) {
        try {
          this._roomMessageListner();
          console.log('✅ Message listener removed');
        } catch (error) {
          console.warn('⚠️ Failed to remove message listener:', error);
        }
        this._roomMessageListner = null;
      }

      // ✅ Always remove presence listeners (works offline)
      if (this.presenceCleanUp) {
        try {
          this.presenceCleanUp();
          console.log('✅ Presence listeners removed');
        } catch (error) {
          console.warn('⚠️ Failed to remove presence listeners:', error);
        }
        this.presenceCleanUp = null;
      }

      // ✅ Always clear local typing status (works offline)
      if (this.currentChat?.roomId) {
        const typingMap = new Map(this._typingStatus$.value);
        const memberIds = this.currentChat.members || [];

        memberIds.forEach((memberId) => {
          if (memberId !== this.senderId) {
            typingMap.delete(memberId);
          }
        });

        this._typingStatus$.next(typingMap);
        console.log('✅ Local typing status cleared');
      }

      // ✅ Always clear local presence data (works offline)
      if (this.currentChat?.members) {
        this.currentChat.members.forEach((memberId) => {
          if (memberId !== this.senderId) {
            this.membersPresence.delete(memberId);
          }
        });
        this._presenceSubject$.next(new Map(this.membersPresence));
        console.log('✅ Local presence data cleared');
      }

      const closedChatId = this.currentChat?.roomId;
      this.currentChat = null;

      console.log(
        `✅ Chat closed successfully: ${closedChatId} (${
          this.networkService.isOnline.value ? 'online' : 'offline'
        })`
      );
    } catch (error) {
      console.error('❌ Error closing chat:', error);
      // Even if error occurs, ensure chat is marked as closed
      this.currentChat = null;
      this._roomMessageListner = null;
      this.presenceCleanUp = null;
    }
  }

  /**
   * ✅ Close chat and cleanup all listeners
   */
  async forceCloseChat(): Promise<void> {
    try {
      console.log('🔴 Force closing chat due to group removal');
      console.log(
        '📡 Network status:',
        this.networkService.isOnline.value ? 'ONLINE' : 'OFFLINE'
      );

      if (this.currentChat?.roomId) {
        this.stopDisappearingTimer(this.currentChat.roomId);
      }

      // 🔥 FIX: Only clear typing status when online
      if (
        this.senderId &&
        this.currentChat?.roomId &&
        this.networkService.isOnline.value
      ) {
        try {
          const typingRef = ref(
            this.db,
            `typing/${this.currentChat.roomId}/${this.senderId}`
          );
          await set(typingRef, false);
          console.log('✅ Typing status cleared');
        } catch (error) {
          console.warn('⚠️ Failed to clear typing status:', error);
        }
      } else if (!this.networkService.isOnline.value) {
        console.log('📴 Skipping typing status clear - offline');
      }

      // ✅ Remove message listener (works offline)
      if (this._roomMessageListner) {
        try {
          this._roomMessageListner();
          console.log('✅ Message listener removed');
        } catch (error) {
          console.warn('⚠️ Failed to remove message listener:', error);
        }
        this._roomMessageListner = null;
      }

      // ✅ Remove presence listeners (works offline)
      if (this.presenceCleanUp) {
        try {
          this.presenceCleanUp();
          console.log('✅ Presence listeners removed');
        } catch (error) {
          console.warn('⚠️ Failed to remove presence listeners:', error);
        }
        this.presenceCleanUp = null;
      }

      // ✅ Clear typing status map (works offline)
      if (this.currentChat?.roomId) {
        const typingMap = new Map(this._typingStatus$.value);
        const memberIds = this.currentChat.members || [];

        memberIds.forEach((memberId) => {
          if (memberId !== this.senderId) {
            typingMap.delete(memberId);
          }
        });

        this._typingStatus$.next(typingMap);
      }

      // ✅ Clear presence data (works offline)
      if (this.currentChat?.members) {
        this.currentChat.members.forEach((memberId) => {
          if (memberId !== this.senderId) {
            this.membersPresence.delete(memberId);
          }
        });
        this._presenceSubject$.next(new Map(this.membersPresence));
      }

      // 🔥 FIX: Only clear active chat when online
      if (this.senderId && this.networkService.isOnline.value) {
        try {
          await this.clearActiveChat();
        } catch (error) {
          console.warn('⚠️ Failed to clear active chat:', error);
        }
      }

      const closedChatId = this.currentChat?.roomId;
      this.currentChat = null;

      console.log(`✅ Chat force closed successfully: ${closedChatId}`);
    } catch (error) {
      console.error('❌ Error force closing chat:', error);
      this.currentChat = null;
      this._roomMessageListner = null;
      this.presenceCleanUp = null;
    }
  }

  async initApp(rootUserId?: string) {
    try {
      this.senderId = rootUserId || '';

      if (this.isAppInitialized) {
        console.warn('App already initialized!');
        return;
      }

      if (this.networkService.isOnline.value) {
        await this.migrateNonCanonicalRoomIds();
      }

      // Load from PouchDB FIRST (instant - works offline)
      console.log('📦 Loading from PouchDB cache...');

      const [cachedUsers, cachedConversations, cachedNonPlatform] = await Promise.all([
        this.chatPouchDb.getPlatformUsers(),
        this.chatPouchDb.getConversations(this.senderId as string),
        this.chatPouchDb.getNonPlatformUsers(),
      ]);

      // ✅ Emit cached data immediately
      if (cachedUsers.length > 0) {
        this._platformUsers$.next(cachedUsers);
        console.log(
          `✅ Loaded ${cachedUsers.length} platform users from cache`
        );
      }

      if (cachedConversations.length > 0) {
        this._conversations$.next(cachedConversations);
        console.log(
          `✅ Loaded ${cachedConversations.length} conversations from cache`,
          cachedConversations
        );
      }

      if (cachedNonPlatform.length > 0) {
        this._nonPlatformUsers$.next(cachedNonPlatform);
        console.log(`✅ Loaded ${cachedNonPlatform.length} non-platform users from cache`);
      }

      // 🔥 STEP 2: Setup network monitoring
      // Wait for Capacitor to report the REAL initial network status.
      // NetworkService.isOnline starts as `true` by default; `ready` resolves
      // only after Network.getStatus() completes, giving us the actual value.
      await this.networkService.ready;

      if (this.networkService.isOnline.value) {
        console.log('🟢 Online - syncing with Firebase');
        goOnline(getDatabase());
        await this.processPendingActions();
        await this.syncConversationWithServer();
        await this.syncPlatformUsersInBackground();
      } else {
        console.log('🔴 Offline - using cache only');
        goOffline(getDatabase());
      }

      // Subscribe to FUTURE status changes only.
      // skip(1) prevents the BehaviorSubject's immediate replay emission from
      // triggering a second sync right after the explicit check above.
      this.networkService.isOnline$.pipe(skip(1)).subscribe(async (isOnline) => {
        if (isOnline) {
          console.log('🟢 Online - syncing with Firebase');
          goOnline(getDatabase());
          await this.processPendingActions();
          await this.syncConversationWithServer();
          await this.syncPlatformUsersInBackground();
        } else {
          console.log('🔴 Offline - using cache only');
          goOffline(getDatabase());
        }
      });

      // 🔥 STEP 3: Setup presence (only if online)
      if (this.networkService.isOnline.value) {
        this.setupPresence();
      }

      this.isAppInitialized = true;
    } catch (err) {
      console.error('initApp failed', err);

      // 🔥 Fallback to cache
      try {
        const cachedUsers = await this.chatPouchDb.getPlatformUsers();
        if (cachedUsers.length > 0) {
          this._platformUsers$.next(cachedUsers);
        }

        await this.loadConversations();
      } catch (fallbackErr) {
        console.error('initApp fallback failed', fallbackErr);
        this._deviceContacts$.next([]);
        this._platformUsers$.next([]);
      }
    } finally {
      this.conversations.subscribe((convs) => {
        convs.forEach((conv) => this.attachTypingListener(conv.roomId));
      });
    }
  }

  // private async syncPlatformUsersInBackground(): Promise<void> {
  //   try {
  //     if (!this.networkService.isOnline.value) {
  //       console.log('📴 Skipping platform users sync - offline');
  //       return;
  //     }

  //     console.log('🔄 Syncing platform users in background...');

  //     // ✅ OPTIMIZED: Load device contacts with timeout (don't block if slow)
  //     let normalizedContacts: any[] = [];
  //     if (this.isWeb()) {
  //       try {
  //         // ✅ Use Promise.race with timeout to prevent hanging on permission request
  //         normalizedContacts = await Promise.race([
  //           this.contactsyncService.getDevicePhoneNumbers?.() ||
  //             Promise.resolve([]),
  //           new Promise<any[]>((resolve) =>
  //             setTimeout(() => resolve([]), 3000)
  //           ), // 3s timeout
  //         ]);
  //       } catch (e) {
  //         console.warn('Failed to get device contacts', e);
  //       }
  //     }

  //     const pfUsers = await this.contactsyncService.getMatchedUsers();

  //     // Save to PouchDB cache
  //     await this.chatPouchDb.savePlatformUsers(pfUsers);

  //     this._deviceContacts$.next([...normalizedContacts]);
  //     this._platformUsers$.next([...pfUsers]);

  //     console.log('✅ Platform users synced');
  //   } catch (error) {
  //     console.error('❌ Background sync failed:', error);
  //   }
  // }

  /**
   * Public entry-point for a manual contact refresh (e.g. from the contacts
   * screen 3-dot menu).  Re-runs the full device-contact sync, updates both
   * platform users and non-platform users in PouchDB and all BehaviorSubjects.
   */
  async refreshContactsSync(): Promise<void> {
    return this.syncPlatformUsersInBackground();
  }

  private async syncPlatformUsersInBackground(): Promise<void> {
  try {
    if (!this.networkService.isOnline.value) {
      console.log('📴 Skipping platform users sync - offline');
      return;
    }
 
    console.log('🔄 Syncing platform users in background...');
 
    // ── Device contacts ───────────────────────────────────────────────────
    let normalizedContacts: { username: string; phoneNumber: string }[] = [];
    try {
      normalizedContacts = await this.contactsyncService.getDevicePhoneNumbers?.() || [];
    } catch (e) {
      console.warn('Failed to get device contacts', e);
    }
 
    // ── Platform users (matched contacts on TellDemm) ─────────────────────
    const pfUsers = await this.contactsyncService.getMatchedUsers();
 
    // Save platform users to PouchDB (existing behaviour)
    await this.chatPouchDb.savePlatformUsers(pfUsers);
 
    this._deviceContacts$.next([...normalizedContacts]);
    this._platformUsers$.next([...pfUsers]);
 
    // ── Non-platform users (device contacts NOT on TellDemm) ─────────────
    // Build a set of phones that are already on the platform
    const pfUserPhoneLast10 = new Set<string>();
 
    pfUsers.forEach((pu: any) => {
      const phone = String(pu.phoneNumber || '').replace(/\D/g, '').slice(-10);
      if (phone.length === 10) pfUserPhoneLast10.add(phone);
 
      // Reverse lookup via device_contact_name
      if (pu.device_contact_name) {
        const matched = normalizedContacts.find(
          (dc) => (dc.username || '').toLowerCase() === (pu.device_contact_name || '').toLowerCase()
        );
        if (matched) {
          const dcPhone = String(matched.phoneNumber || '').replace(/\D/g, '').slice(-10);
          if (dcPhone.length === 10) pfUserPhoneLast10.add(dcPhone);
        }
      }
    });
 
    const currentUserPhone = String(
      this.authService.authData?.phone_number || ''
    ).replace(/\D/g, '').slice(-10);
 
    const nonPlatformUsers: NonPlatformUser[] = normalizedContacts
      .filter((dc) => {
        const dcPhone = String(dc.phoneNumber || '').replace(/\D/g, '').slice(-10);
        if (dcPhone.length < 10) return false;
        if (dcPhone === currentUserPhone) return false;   // skip self
        if (pfUserPhoneLast10.has(dcPhone)) return false; // already on platform
        return true;
      })
      .map((dc) => ({
        username: dc.username || dc.phoneNumber || 'Unknown',
        phoneNumber: dc.phoneNumber || '',
      }));
 
    // Save non-platform users to PouchDB
    await this.chatPouchDb.saveNonPlatformUsers(nonPlatformUsers);
    this._nonPlatformUsers$.next(nonPlatformUsers);

    // ── Re-resolve ALL private-chat titles from the JUST-fetched device data ──
    // Uses normalizedContacts directly (not the BehaviorSubject) so we're
    // guaranteed to use the freshest data.
    // Handles both upgrades (new saved name) AND downgrades
    // (contact deleted from phone → fall back to phone number immediately).
    {
      // userId → pfUser from this sync run (device_contact_name = null when
      // the contact no longer exists in the phone book)
      const userIdToPf = new Map<string, any>();
      pfUsers.forEach((u: any) => {
        if (u.userId) userIdToPf.set(String(u.userId), u);
      });

      // phone last-10 → display name from FRESH device contacts
      // (deleted contacts will NOT appear here)
      const phoneToDeviceName = new Map<string, string>();
      normalizedContacts.forEach((dc) => {
        if (dc.username) {
          const last10 = String(dc.phoneNumber || '').replace(/\D/g, '').slice(-10);
          if (last10.length === 10) phoneToDeviceName.set(last10, dc.username);
        }
      });

      const currentConvs = this._conversations$.value;
      let hasUpdates = false;

      const updatedConvs = currentConvs.map((conv) => {
        if (conv.type !== 'private') return conv;

        const parts = (conv.roomId || '').split('_');
        const receiverId =
          parts.find((p) => p !== this.senderId) ?? parts[parts.length - 1];

        const pf = userIdToPf.get(String(receiverId));

        // Priority 1 (highest): server sync told us the device contact name
        // for this user. Only set when the contact EXISTS in the phone book
        // right now (contact-sync.ts builds deviceNameByHash from fresh fetch).
        if (pf?.device_contact_name) {
          if (conv.title !== pf.device_contact_name) {
            hasUpdates = true;
            return { ...conv, title: pf.device_contact_name };
          }
          return conv;
        }

        // Priority 2: user still in phone book but not a matched pfUser
        // (edge case) — use name from fresh device contacts list.
        if (conv.phoneNumber) {
          const last10 = String(conv.phoneNumber).replace(/\D/g, '').slice(-10);
          const deviceName = phoneToDeviceName.get(last10);
          if (deviceName) {
            if (conv.title !== deviceName) {
              hasUpdates = true;
              return { ...conv, title: deviceName };
            }
            return conv;
          }

          // Priority 3 (fallback): contact no longer in phone book at all
          // → revert to raw phone number immediately (no restart needed).
          if (conv.title !== conv.phoneNumber) {
            hasUpdates = true;
            return { ...conv, title: conv.phoneNumber };
          }
        }

        return conv;
      });

      if (hasUpdates) {
        // Push to BehaviorSubject immediately so home screen re-renders now
        this._conversations$.next(updatedConvs);
        try {
          await this.chatPouchDb.saveConversations(
            this.senderId as string,
            updatedConvs.map((c) => ({
              ...c,
              syncStatus: 'synced',
              lastSyncedAt: Date.now(),
            })),
            false
          );
        } catch (cacheErr) {
          console.warn('⚠️ PouchDB title update failed:', cacheErr);
        }
      }
    }

    console.log(`✅ Platform users synced: ${pfUsers.length} on platform, ${nonPlatformUsers.length} not on platform`);

  } catch (error) {
    console.error('❌ Background sync failed:', error);
  }
}

  /**
   * Process pending actions from queue when back online
   */
  async processPendingActions(): Promise<void> {
    try {
      const queue = await this.chatPouchDb.getQueue();

      if (queue.length === 0) {
        console.log('📭 No pending actions to process');
        return;
      }

      console.log(`📬 Processing ${queue.length} pending actions`);

      for (let i = queue.length - 1; i >= 0; i--) {
        const action = queue[i];

        try {
          switch (action.type) {
            case 'send_message':
              await this.retrySendMessage(action);
              break;
            case 'delete_message':
              await this.retryDeleteMessage(action);
              break;
            case 'edit_message':
              await this.retryEditMessage(action);
              break;
            case 'mark_read':
              await this.retryMarkRead(action);
              break;
            case 'mark_delivered':
              await this.retryMarkDelivered(action);
              break;
            default:
              console.warn('Unknown action type:', action.type);
          }

          await this.chatPouchDb.removeFromQueue(i);
          console.log(`✅ Processed action: ${action.type}`);
        } catch (error) {
          console.error(`❌ Failed to process action ${action.type}:`, error);

          action.retryCount = (action.retryCount || 0) + 1;

          if (action.retryCount > 3) {
            console.warn(
              `⚠️ Removing action after 3 failed attempts: ${action.type}`
            );
            await this.chatPouchDb.removeFromQueue(i);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error processing pending actions:', error);
    }
  }

  private async retrySendMessage(action: PendingChatAction): Promise<void> {
    console.log('🔄 Retrying send message:', action.messageId);
    await this.sendMessage(action.data);
  }

  private async retryDeleteMessage(action: PendingChatAction): Promise<void> {
    console.log('🔄 Retrying delete message:', action.messageId);
    await this.deleteMessage(
      action.messageId as string,
      action.data.forEveryone
    );
  }

  private async retryEditMessage(action: PendingChatAction): Promise<void> {
    console.log('🔄 Retrying edit message:', action.messageId);
    await this.editMessage(
      action.conversationId,
      action.messageId as string,
      action.data.newText
    );
  }

  private async retryMarkRead(action: PendingChatAction): Promise<void> {
    console.log('🔄 Retrying mark read:', action.messageId);
    await this.markAsRead(action.messageId as string, action.conversationId);
  }

  private async retryMarkDelivered(action: PendingChatAction): Promise<void> {
    console.log('🔄 Retrying mark delivered:', action.messageId);
    await this.markAsDelivered(
      action.messageId as string,
      action.data.userId,
      action.conversationId
    );
  }

  /**
   * Flush all pending saves before app close
   */
  async onAppClose(): Promise<void> {
    try {
      await this.chatPouchDb.flushPendingSaves();
      console.log('✅ Flushed all pending saves');
    } catch (error) {
      console.error('❌ Error flushing saves:', error);
    }
  }

  /**
   * Periodic cleanup - call this daily or weekly
   */
  async performMaintenance(): Promise<void> {
    try {
      await this.chatPouchDb.clearOldData(30);
      await this.chatPouchDb.compact();
      console.log('✅ Maintenance completed');
    } catch (error) {
      console.error('❌ Maintenance error:', error);
    }
  }

  /**
   * Get cache statistics for debugging
   */
  async getCacheStats(): Promise<any> {
    return await this.chatPouchDb.getStats();
  }

  /**
   * Debug cache contents
   */
  async debugCache(): Promise<void> {
    await this.chatPouchDb.debugDump();
  }

  setupPresence() {
    if (!this.senderId) return;

    const connectedRef = ref(this.db, '.info/connected');
    // No longer writing to /presence from frontend. 
    // Backend handles this via socket connect/disconnect.
    onValue(connectedRef, (snap) => {
      const isConnected = snap.val();
      if (isConnected) {
        console.log('🌐 Connected to Firebase RTDB (Read-Only)');
      } else {
        console.log('🌐 Disconnected from Firebase RTDB');
      }
    });
  }

  /**
   * Subscribes to one or multiple users' online presence.
   * Returns a cleanup function to stop all listeners.
   */
  isReceiverOnline(memberIds: string | string[]): () => void {
    const ids = Array.isArray(memberIds)
      ? memberIds.filter(Boolean)
      : [memberIds].filter(Boolean);

    if (!ids.length) return () => {};

    // Ensure tracking maps exist
    this._memberUnsubs ??= new Map<string, () => void>();
    this.membersPresence ??= new Map<
      string,
      { isOnline: boolean; lastSeen: number | null }
    >();

    // 🧹 Remove listeners for users no longer in the list
    for (const [existingId, unsub] of this._memberUnsubs.entries()) {
      if (!ids.includes(existingId)) {
        try {
          unsub?.();
        } catch {}
        this._memberUnsubs.delete(existingId);
        this.membersPresence.delete(existingId);
      }
    }

    // 🧠 Add listeners for new users
    for (const id of ids) {
      if (this._memberUnsubs.has(id)) continue; // already listening

      this.membersPresence.set(id, { isOnline: false, lastSeen: null });
      const userStatusRef = ref(this.db, `presence/${id}`);

      const unsubscribe = onValue(userStatusRef, (snap) => {
        const val = snap.val() ?? {};
        const isOnline = !!val.isOnline;

        const ts =
          val.lastSeen ??
          val.last_changed ??
          val.last_changed_at ??
          val.timestamp;
        const lastSeen =
          typeof ts === 'number' ? ts : ts ? Number(ts) || null : null;

        this.membersPresence.set(id, { isOnline, lastSeen });

        // 🆕 Emit the updated presence map
        this._presenceSubject$.next(new Map(this.membersPresence));

        console.log(this.membersPresence);
      });

      this._memberUnsubs.set(id, unsubscribe);
    }

    // 🧩 Return cleanup function
    return () => {
      for (const [id, unsub] of this._memberUnsubs.entries()) {
        try {
          unsub?.();
        } catch {}
      }
      this._memberUnsubs.clear();
      this.membersPresence.clear();
    };
  }

  async getPreviewUrl(msg: IMessage & { attachment: IAttachment }) {
    let previewUrl: string | null = null;
    let attachment: IAttachment | null = null;

    if (!msg.attachment?.localUrl) {
      attachment = await this.chatPouchDb.getAttachment(msg.msgId);

      if (attachment?.localUrl) {
        previewUrl = await this.fileSystemService.getFilePreview(
          attachment.localUrl
        );
      }

      if (!previewUrl && attachment?.mediaId) {
        const res = await firstValueFrom(
          this.apiService.getDownloadUrl(attachment.mediaId)
        );
        previewUrl = res.status ? res.downloadUrl : null;
      }
    } else {
      previewUrl = await this.fileSystemService.getFilePreview(
        msg.attachment.localUrl
      );

      if (!previewUrl) {
        previewUrl = msg.attachment.cdnUrl || null;
      }
    }

    return previewUrl;
  }

  getPresenceStatus(userId: string): MemberPresence | null {
    return this.membersPresence.get(userId) || null;
  }

  getPresenceObservable(): Observable<Map<string, MemberPresence>> {
    const presenceSubject = new BehaviorSubject<Map<string, MemberPresence>>(
      new Map(this.membersPresence)
    );

    // You'll need to add this property to your class
    // private _presenceSubject$ = new BehaviorSubject<Map<string, MemberPresence>>(new Map());

    return presenceSubject.asObservable();
  }

  /**
   * Set the currently active chat for a user
   * This helps determine if unread count should be incremented
   */
  async setActiveChat(roomId: string) {
    try {
      if (!this.senderId) return;
      await this.chatBackendSocket.setActiveChat(roomId);
    } catch (error) {
      console.error('Error in setActiveChat:', error);
    }
  }

  async clearActiveChat() {
    try {
      if (!this.senderId) return;
      await this.chatBackendSocket.setActiveChat(null);
    } catch (error) {
      console.error('Error in clearActiveChat:', error);
    }
  }

  async reactivateCurrentChat() {
    if (this.currentChat?.roomId) {
      await this.setActiveChat(this.currentChat.roomId);
    }
  }

  async updateMessageStatusFromReceipts(msg: IMessage) {
    if (!msg.receipts || !this.currentChat?.members) return;

    // ✅ Only sender should update message status
    if (msg.sender !== this.senderId) return;

    const members = this.currentChat.members;
    const others = members.filter((m) => m !== msg.sender);

    // ✅ Prevent false positives
    if (others.length === 0) return;

    const deliveredTo =
      msg.receipts.delivered?.deliveredTo?.map((d) => d.userId) || [];

    const readBy = msg.receipts.read?.readBy?.map((r) => r.userId) || [];

    // ✅ Read implies delivered
    const effectiveDelivered = new Set([...deliveredTo, ...readBy]);

    let newStatus: IMessage['status'] | null = null;

    if (others.every((id) => readBy.includes(id))) {
      newStatus = 'read';
    } else if (others.every((id) => effectiveDelivered.has(id))) {
      newStatus = 'delivered';
    }

    if (newStatus && msg.status !== newStatus) {
      if (newStatus === 'read' || newStatus === 'delivered') {
        await this.chatBackendSocket.updateReceipt({
          roomId: msg.roomId,
          msgId: msg.msgId,
          receiptType: newStatus,
        });
      }
    }
  }

  async updateMessageLocally(msg: IMessage) {
    const m = this.normalizeDeletionFlags(msg as any) as any;
    const messagesMap = new Map(this._messages$.value);
    const list = messagesMap.get(m.roomId) || [];
    const index = list.findIndex((x) => x.msgId === m.msgId);

    // ✅ For disappeared messages, preserve the existing decrypted text in UI
    // We only set the flag — never clear the text from memory
    let decryptedText: string;
    let decryptedTranslations = m.translations;
    if (m.isDisappeared) {
      // Keep whatever text is already rendered in the list
      decryptedText = index >= 0 ? (list[index] as any).text ?? '' : '';
      decryptedTranslations = index >= 0 ? (list[index] as any).translations ?? m.translations : m.translations;
    } else {
      try {
        decryptedText = await this.encryptionService.decrypt(m.text as string);
      } catch {
        decryptedText = m.text ?? '';
      }
      // Also decrypt translations.original.text so getDisplayedText() shows plain text
      if (m.translations?.original?.text) {
        try {
          const decOrigText = await this.encryptionService.decrypt(m.translations.original.text);
          decryptedTranslations = {
            ...m.translations,
            original: { ...m.translations.original, text: decOrigText },
          };
        } catch { /* leave as-is if decryption fails */ }
      }
    }

    // ... rest of updateMessageLocally unchanged from your existing code ...
    const prev = index >= 0 ? (list[index] as any) : null;
    const becameGlobalDelete =
      m?.deletedFor?.everyone === true &&
      !(prev?.deletedFor?.everyone === true);

    if (becameGlobalDelete && prev) {
      list[index] = {
        ...prev,
        uiHoldEveryone: true,
        fadeOut: true,
      };
      messagesMap.set(m.roomId, list);
      this._messages$.next(new Map(messagesMap));

      try {
        await this.chatPouchDb.updateMessage(m.roomId, m.msgId as string, {
          ...m,
          text: decryptedText,
          translations: decryptedTranslations,
          syncStatus: 'synced',
          localTimestamp: Date.now(),
        });
      } catch (e) {}

      setTimeout(() => {
        const currentList = this._messages$.value.get(m.roomId) || [];
        const idx = currentList.findIndex((x: any) => x.msgId === m.msgId);
        if (idx >= 0) {
          currentList[idx] = {
            ...m,
            text: decryptedText,
            translations: decryptedTranslations,
            isMe: m.sender === this.senderId,
            uiHoldEveryone: false,
            fadeOut: false,
          };
          this._animationCompletedDeletes.add(m.msgId as string);
          const newMap = new Map(this._messages$.value);
          newMap.set(m.roomId, currentList);
          this._messages$.next(new Map(newMap));
        }
      }, 1300);
      return;
    }

    if (index >= 0) {
      list[index] = {
        ...m,
        text: decryptedText,
        translations: decryptedTranslations,
        isMe: m.sender === this.senderId,
      };
    } else {
      list.push({
        ...m,
        text: decryptedText,
        translations: decryptedTranslations,
        isMe: m.sender === this.senderId,
      });
    }

    messagesMap.set(m.roomId, list);

    try {
      await this.chatPouchDb.updateMessage(m.roomId, m.msgId as string, {
        ...m,
        text: decryptedText,
        translations: decryptedTranslations,
        syncStatus: 'synced',
        localTimestamp: Date.now(),
      });
    } catch (cacheErr) {
      console.warn('⚠️ PouchDB update failed:', cacheErr);
    }

    this._messages$.next(new Map(messagesMap));
  }

  async markAsRead(msgId: string, roomId: string | null = null) {
    try {
      if (!this.senderId || !msgId) return;
      const targetRoomId = roomId || this.currentChat?.roomId;
      if (!targetRoomId) return;

      if (this.networkService.isOnline.value) {
        await this.chatBackendSocket.updateReceipt({
          roomId: targetRoomId as string,
          msgId,
          receiptType: 'read',
          userId: this.senderId
        });
      }

      const localMsg = await this.chatPouchDb.getMessageById(targetRoomId as string, msgId);
      if (localMsg) {
        const now = Date.now();
        const readReceipt = localMsg.receipts?.read || { status: false, readBy: [] };
        const alreadyRead = readReceipt.readBy?.some(
          (r: any) => r.userId === this.senderId
        );
        if (!alreadyRead) {
          const updatedReceipts = {
            status: true,
            readBy: [
              ...(readReceipt.readBy || []),
              { userId: this.senderId, timestamp: now },
            ],
          };
          await this.chatPouchDb.updateMessage(targetRoomId as string, msgId, {
            receipts: {
              ...(localMsg.receipts || {}),
              read: updatedReceipts,
            },
          } as any);
          console.log(`✅ Read receipt optimistically cached for ${msgId}`);
        }
      }

      await this.chatPouchDb.updateUnreadCount(
        targetRoomId as string,
        this.senderId as string,
        0
      );
      await this.setUnreadCount(targetRoomId as string, 0);
    } catch (error) {
      console.error('markAsRead error:', error);
    }
  }

  async markAsDelivered(
    msgId: string,
    userID: string | null = null,
    roomId: string | null = null
  ) {
    try {
      if (!msgId) return;
      const targetRoomId = roomId || this.currentChat?.roomId;
      if (!targetRoomId) return;
      const userId = userID || this.senderId;
      if (!userId) return;

      if (this.networkService.isOnline.value) {
        await this.chatBackendSocket.updateReceipt({
          roomId: targetRoomId as string,
          msgId,
          receiptType: 'delivered',
          userId
        });
      }

      const localMsg = await this.chatPouchDb.getMessageById(targetRoomId as string, msgId);
      if (localMsg) {
        const now = Date.now();
        const deliveredReceipt = localMsg.receipts?.delivered || { status: false, deliveredTo: [] };
        const alreadyDelivered = deliveredReceipt.deliveredTo?.some(
          (d: any) => d.userId === userId
        );
        
        if (!alreadyDelivered) {
          const updatedReceipts = {
            status: true,
            deliveredTo: [
              ...(deliveredReceipt.deliveredTo || []),
              { userId, timestamp: now },
            ],
          };

          await this.chatPouchDb.updateMessage(targetRoomId as string, msgId, {
            receipts: {
              ...(localMsg.receipts || {}),
              delivered: updatedReceipts,
            },
          } as any);

          console.log(`✅ Delivered receipt optimistically cached for ${msgId}`);
        }
      }
    } catch (error) {
      console.error('markAsDelivered error:', error);
    }
  }

  async setQuickReaction({
    msgId,
    userId,
    emoji,
  }: {
    msgId: string;
    userId: string;
    emoji: string | null;
  }) {
    if (!this.currentChat?.roomId) return;
    const targetRoomId = this.currentChat.roomId;

    await this.chatBackendSocket.setQuickReaction({
      roomId: targetRoomId,
      msgId,
      emoji
    });

    // Optimistically update PouchDB
    try {
      const localMsg = await this.chatPouchDb.getMessageById(targetRoomId, msgId);
      if (localMsg) {
        const reactions = localMsg.reactions || [];
        const idx = reactions.findIndex((r: { userId: string }) => String(r.userId) === String(userId));
        if (idx > -1) {
          reactions[idx] = { ...reactions[idx], emoji };
        } else {
          reactions.push({ userId, emoji });
        }
        await this.chatPouchDb.updateMessage(targetRoomId, msgId, { reactions } as any);
        console.log('✅ Reaction optimistically cached to PouchDB');
      }
    } catch (cacheErr) {
      console.warn('⚠️ PouchDB update failed:', cacheErr);
    }
  }

  //update conversation locally _conversations when member removed from group
  removeMemberFromConvLocal = (roomId: string, userId: string) => {
    const convs = this._conversations$.value;
    const idx = convs.findIndex((c) => c.roomId === roomId);
    convs[idx].members = convs[idx].members?.filter((uid) => uid !== userId);
    this._conversations$.next([...convs]);
  };

  async loadConversations() {
    try {
      // 🔥 STEP 1: Load from PouchDB (instant - works offline)
      console.log('📦 Loading conversations from PouchDB cache...');
      const cached = await this.chatPouchDb.getConversations(
        this.senderId as string
      );
      console.log('✅ Loaded from cache:', cached);

      if (cached.length > 0) {
        this._conversations$.next(cached);
        console.log('✅ Loaded from cache:', cached);
      } else {
        console.log('📭 No cached conversations found');
      }

      // 🔥 STEP 2: Background sync (only if online)
      if (this.networkService.isOnline.value) {
        this.syncConversationWithServer().catch((err) => {
          console.warn('Background sync failed:', err);
        });
      } else {
        console.log('📴 Skipping Firebase sync - offline');
      }

      return this._conversations$.value;
    } catch (err) {
      console.error('loadConversations error:', err);
      return this._conversations$.value;
    }
  }

  private async fetchPrivateConvDetails(
    roomId: string,
    meta: any
  ): Promise<IConversation> {
    const canonicalRoomId = this.ensureCanonicalRoomId(roomId);
    if (canonicalRoomId !== roomId) {
      console.warn(
        `⚠️ fetchPrivateConvDetails: fixed roomId ${roomId} → ${canonicalRoomId}`
      );
    }
    const isWeb = this.isWeb();
    // const parts = roomId.split('_');
    const parts = canonicalRoomId.split('_');
    const receiverId =
      parts.find((p) => p !== this.senderId) ?? parts[parts.length - 1];

    console.log('🔍 Fetching conversation for:', roomId);

    const localUser: Partial<IUser> | undefined =
      this._platformUsers$.value.find(
        (u) => String(u.userId) === String(receiverId)
      );

    let profileResp: {
      phone_number: string;
      profile: string | null;
      name: string;
      publicKeyHex?: string;
    } | null = null;

    // Only call API when online
    if (this.networkService.isOnline.value) {
      if (isWeb) {
        try {
          profileResp = await firstValueFrom(
            this.apiService.getUserProfilebyId(receiverId)
          );
        } catch (err) {
          console.warn('Failed to fetch profile (web)', receiverId, err);
        }
      } else if (!localUser) {
        try {
          profileResp = await firstValueFrom(
            this.apiService.getUserProfilebyId(receiverId)
          );
        } catch (err) {
          console.warn(
            'Failed to fetch profile (native fallback)',
            receiverId,
            err
          );
        }
      }
    } else {
      console.log('📴 Offline - skipping API call for', receiverId);
    }

    // Cache user information
    if (profileResp || localUser) {
      try {
        const userToCache: Partial<IUser> = {
          userId: receiverId,
          phoneNumber:
            profileResp?.phone_number || localUser?.phoneNumber || '',
          avatar: profileResp?.profile || localUser?.avatar || undefined,
        };

        const currentUsers = this._platformUsers$.value;
        console.log({ currentUsers });

        const userMap = new Map<string, Partial<IUser>>(
          currentUsers.map((u) => [String(u.userId), u])
        );

        const existing = userMap.get(String(receiverId));
        if (existing) {
          userMap.set(String(receiverId), { ...existing, ...userToCache });
        } else {
          userMap.set(String(receiverId), userToCache);
        }

        const updatedUsers = Array.from(userMap.values());

        this._platformUsers$.next(updatedUsers);
        console.log(
          'platform user from fetch private conv details',
          this._platformUsers$.value
        );

        await this.chatPouchDb
          .savePlatformUsers(updatedUsers)
          .catch((err) => console.warn('⚠️ Failed to cache user:', err));
      } catch (cacheErr) {
        console.warn('⚠️ User caching failed:', cacheErr);
      }
    }

    // ✅ RESOLVE TITLE FROM PLATFORM USERS / DEVICE CONTACTS
    let titleToShow: string = 'Unknown';
    let phoneNumberToShow: string | undefined;

    phoneNumberToShow = profileResp?.phone_number ?? localUser?.phoneNumber;

    // 1. Prefer localUser.username (userId-based match - most reliable)
    if (localUser?.username) {
      titleToShow = localUser.username;
    } else if (phoneNumberToShow) {
      // 2. Try phone-based match from deviceContacts
      const deviceContacts = this.currentDeviceContacts;
      const normalizedPhone = phoneNumberToShow.replace(/\D/g, '');
      const last10 = normalizedPhone.slice(-10);

      const deviceContact = deviceContacts.find((c: any) => {
        const dcPhone = c.phoneNumber?.replace(/\D/g, '')?.slice(-10);
        return dcPhone === last10;
      });

      if (deviceContact?.username) {
        titleToShow = deviceContact.username;
      } else {
        titleToShow = phoneNumberToShow;
      }
    } else {
      phoneNumberToShow = meta?.phoneNumber || receiverId;
      titleToShow =
        localUser?.username || phoneNumberToShow || receiverId || 'Unknown';
    }

    // Decrypt message
    let decryptedText: string | undefined;
    try {
      decryptedText = await this.encryptionService.decrypt(meta?.lastmessage);
    } catch (e) {
      console.warn('Decrypt failed for', roomId);
      decryptedText =
        typeof meta?.lastmessage === 'string' ? meta.lastmessage : undefined;
    }

    if ((meta?.lastmessageType as string) === 'system') {
      decryptedText = undefined;
    }

    // ✅ Build conversation object with BOTH title AND phoneNumber
    const conv: IConversation = {
      roomId: canonicalRoomId,
      type: 'private',
      title: titleToShow,
      phoneNumber: phoneNumberToShow,
      avatar: localUser?.avatar ?? profileResp?.profile ?? undefined,
      members: [this.senderId, receiverId],
      isMyself: false,
      isArchived: meta?.isArchived || false,
      isPinned: meta?.isPinned || false,
      isLocked: meta?.isLocked || false,
      pinnedAt: meta?.pinnedAt || null,
      lastMessage: decryptedText ?? undefined,
      lastMessageType: meta?.lastmessageType ?? undefined,
      lastMessageAt: meta?.lastmessageAt
        ? new Date(Number(meta.lastmessageAt))
        : undefined,
      unreadCount: meta.unreadCount || 0,
      updatedAt: meta?.lastmessageAt
        ? new Date(Number(meta.lastmessageAt))
        : undefined,
    } as IConversation;

    console.log('✅ Built conversation:', {
      roomId: conv.roomId,
      title: conv.title,
      phoneNumber: conv.phoneNumber,
      isOffline: !this.networkService.isOnline.value,
    });

    return conv;
  }

  private parseDate(value: any): Date | undefined {
    if (!value && value !== 0) return undefined;
    if (value instanceof Date) return value;
    const n =
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (typeof n === 'number' && !Number.isNaN(n)) return new Date(n);
    const parsed = Date.parse(String(value));
    return isNaN(parsed) ? undefined : new Date(parsed);
  }

  // updated group function with title resolve error
  private async fetchGroupConDetails(
    roomId: string,
    meta: IChatMeta
  ): Promise<IConversation> {
    console.log('🔍 Fetching group conversation for:', roomId);

    const groupRef = rtdbRef(this.db, `groups/${roomId}`);
    const groupSnap = await rtdbGet(groupRef);

    if (!groupSnap.exists()) {
      console.warn(`⚠️ Group ${roomId} does not exist in Firebase`);

      const fallbackTitle =
        roomId.replace('group_', 'Group ') || 'Unknown Group';

      return {
        roomId,
        type: 'group',
        title: fallbackTitle,
        phoneNumber: 'NO_PHONE',
        members: [],
        adminIds: [],
        isArchived: !!meta.isArchived,
        isPinned: !!meta.isPinned,
        pinnedAt: meta.pinnedAt || null,
        isLocked: !!meta.isLocked,
        unreadCount: meta.unreadCount || 0,
        lastMessage: undefined,
        lastMessageType: meta.lastmessageType ?? undefined,
        lastMessageAt: meta.lastmessageAt
          ? this.parseDate(meta.lastmessageAt)
          : undefined,
        updatedAt: meta.lastmessageAt
          ? this.parseDate(meta.lastmessageAt)
          : undefined,
      } as IConversation;
    }

    const group: Partial<IGroup> = groupSnap.val() || {};
    const membersObj: Record<string, Partial<IGroupMember>> = group.members || {};
    const members = Object.keys(membersObj);

    console.log('📊 Group data:', {
      roomId,
      title: group.title,
      memberCount: members.length,
      hasAvatar: !!(group.avatar || group.groupAvatar),
    });

    let decryptedText: string | undefined;
    try {
      decryptedText = await this.encryptionService.decrypt(meta?.lastmessage);
    } catch (e) {
      console.warn('⚠️ fetchGroupConDetails: decrypt failed for', roomId, e);
      decryptedText =
        typeof meta?.lastmessage === 'string' ? meta.lastmessage : undefined;
    }

    if ((meta?.lastmessageType as string) === 'system') {
      decryptedText = undefined;
    }

    let groupAvatar = group.avatar || group.groupAvatar || '';

    if (!groupAvatar && this.networkService.isOnline.value) {
      try {
        const dpResponse = await firstValueFrom(
          this.apiService.getGroupDp(roomId)
        );
        if (dpResponse.group_dp_url) {
          groupAvatar = dpResponse.group_dp_url;
        }
      } catch (err) {
        console.warn(`⚠️ Failed to fetch group avatar for ${roomId}:`, err);
      }
    } else if (!groupAvatar) {
      console.log('📴 Offline - skipping avatar fetch for', roomId);
    }

    let groupTitle: string = 'Unknown Group';

    if (group.title && group.title.trim() !== '') {
      groupTitle = group.title.trim();
    } else {
      try {
        const timestamp = roomId.replace('group_', '');
        if (/^\d+$/.test(timestamp)) {
          const date = new Date(Number(timestamp));
          if (!isNaN(date.getTime())) {
            const dateStr = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            groupTitle = `Group ${dateStr}`;
          } else {
            groupTitle = `Group ${timestamp.substring(0, 8)}`;
          }
        } else {
          groupTitle = roomId.replace('group_', 'Group ') || 'Unknown Group';
        }
      } catch (err) {
        groupTitle = 'Unknown Group';
      }
    }

    const conv: IConversation = {
      roomId,
      type: 'group',
      communityId: group.communityId || null,
      title: groupTitle,
      phoneNumber: 'NO_PHONE',
      avatar: groupAvatar || undefined,
      members,
      adminIds: group.adminIds || [],
      isArchived: !!meta.isArchived,
      isPinned: !!meta.isPinned,
      pinnedAt: meta.pinnedAt || null,
      isLocked: !!meta.isLocked,
      createdAt: group.createdAt ? this.parseDate(group.createdAt) : undefined,
      lastMessage: decryptedText ?? undefined,
      lastMessageType: meta.lastmessageType ?? undefined,
      lastMessageAt: meta.lastmessageAt
        ? this.parseDate(meta.lastmessageAt)
        : undefined,
      unreadCount: meta.unreadCount || 0,
      updatedAt: meta.lastmessageAt
        ? this.parseDate(meta.lastmessageAt)
        : group.updatedAt
        ? this.parseDate(group.updatedAt)
        : undefined,
    } as IConversation;

    const membersArray = Object.entries(membersObj).map(
      ([userId, memberData]: [string, any]) => ({
        user_id: userId,
        username: memberData.username || userId,
        phoneNumber: memberData.phoneNumber || '',
        contactName: memberData.contactName,
      })
    );
    const rawAdminIds = group.adminIds || [];
    const adminIds: string[] = Array.isArray(rawAdminIds)
      ? rawAdminIds.map(String)
      : Object.keys(rawAdminIds);

    this.chatPouchDb.saveGroup(roomId, {
      members: membersObj,
      adminIds,
      title: groupTitle,
      avatar: groupAvatar || '',
    }).catch((e: any) => console.warn('⚠️ Failed to cache group to PouchDB:', e));

    this.chatPouchDb.cacheGroupDetails(roomId, {
      meta: {},
      members: membersArray,
      adminIds,
    }).catch((e: any) => console.warn('⚠️ Failed to cache group details to PouchDB:', e));

    // ✅ FIX 1: Save as individual conversation doc so openChat() Step 2 finds it offline
    this.chatPouchDb.saveConversation({
      ...conv,
      syncStatus: 'synced' as any,
      lastSyncedAt: Date.now(),
    } as any, false).catch((e: any) =>
      console.warn('⚠️ Failed to cache group conv as individual doc:', e)
    );

    return conv;
  }

createTypingListener(
    roomId: string,
    onEvent: (event: ITypingEvent) => void
  ): () => void {
    const typingRef = rtdbRef(this.db, `typing/${roomId}`);

    const handleAdded = (snap: DataSnapshot) => {
      onEvent({
        roomId,
        userId: snap.key as string,
        isTyping: Boolean(snap.val()),
        type: 'added',
      });
    };

    const handleChanged = (snap: DataSnapshot) => {
      onEvent({
        roomId,
        userId: snap.key as string,
        isTyping: Boolean(snap.val()),
        type: 'updated',
      });
    };

    const handleRemoved = (snap: DataSnapshot) => {
      onEvent({
        roomId,
        userId: snap.key as string,
        isTyping: false,
        type: 'updated',
      });
    };

    onChildAdded(typingRef, handleAdded);
    onChildChanged(typingRef, handleChanged);
    onChildRemoved(typingRef, handleRemoved);

    return () => {
      off(typingRef, 'child_added', handleAdded);
      off(typingRef, 'child_changed', handleChanged);
      off(typingRef, 'child_removed', handleRemoved);
    };
  }

  attachTypingListener(roomId: string) {
    if (this._typingListeners.has(roomId)) return;

    const unsub = this.createTypingListener(roomId, (event) => {
      // ignore own typing
      if (event.userId === this.senderId) return;

      this.handleTypingEvent(event);
    });

    this._typingListeners.set(roomId, unsub);
  }

  detachTypingListener(roomId: string) {
    const unsub = this._typingListeners.get(roomId);
    if (unsub) {
      try {
        unsub();
      } catch {}
      this._typingListeners.delete(roomId);
    }
  }

  cleanupAllTypingListeners() {
    this._typingListeners.forEach((unsub) => {
      try {
        unsub();
      } catch {}
    });
    this._typingListeners.clear();
  }

  handleTypingEvent(event: ITypingEvent) {
    const { roomId, userId, isTyping } = event;

    const current = this._conversationsTypingStatus$.value;
    const roomTypers = current[roomId] ?? [];

    let updatedRoomTypers: string[];

    if (isTyping) {
      // add user if not already present
      updatedRoomTypers = roomTypers.includes(userId)
        ? roomTypers
        : [...roomTypers, userId];
    } else {
      // remove user
      updatedRoomTypers = roomTypers.filter((id) => id !== userId);
    }

    // avoid unnecessary emits (important for UI performance)
    if (
      roomTypers.length === updatedRoomTypers.length &&
      roomTypers.every((id) => updatedRoomTypers.includes(id))
    ) {
      return;
    }

    this._conversationsTypingStatus$.next({
      ...current,
      [roomId]: updatedRoomTypers,
    });
  }

  isAnyoneTypingInRoom(roomId: string) {
    return this.getTypingStatusForRoom(roomId).pipe(
      map((users) => users.length > 0),
      distinctUntilChanged()
    );
  }

  getTypingStatusForRoom(roomId: string) {
    return this._conversationsTypingStatus$.pipe(
      map((state) => state[roomId] ?? []),
      distinctUntilChanged(
        (a, b) => a.length === b.length && a.every((id) => b.includes(id))
      )
    );
  }

  private async isSystemGroupInCommunity(groupId: string): Promise<boolean> {
    try {
      const groupRef = rtdbRef(this.db, `groups/${groupId}`);
      const groupSnap = await rtdbGet(groupRef);

      if (!groupSnap.exists()) return false;

      const groupData = groupSnap.val();

      // Check if group belongs to a community
      const belongsToCommunity = !!groupData.communityId;

      // Check if it's a system group (Announcements or General)
      const isSystemGroup =
        groupData.title === 'Announcements' || groupData.title === 'General';

      return belongsToCommunity && isSystemGroup;
    } catch (error) {
      console.error('Error checking system group:', error);
      return false;
    }
  }

  async syncConversationWithServer(): Promise<void> {
    try {
      if (!this.senderId || !this.networkService.isOnline.value) return;
      if (this._isSyncing$.value) return;

      this._isSyncing$.next(true);
      this._convOldestTimestamp = null;
      this._convHasMore = true;
      this._convRetryCount = 0;

      await this._fetchConversationBatches();
      this.setupConversationListener();
    } catch (error) {
      console.error('❌ syncConversationWithServer error:', error);
      try {
        const cached = await this.chatPouchDb.getConversations(
          this.senderId as string
        );
        if (cached.length > 0) this._conversations$.next(cached);
      } catch {}
    } finally {
      this._isSyncing$.next(false);
    }
  }

  private async _fetchConversationBatches(): Promise<void> {
    if (!this._convHasMore) {
      this.conversationBatchesComplete$.next(true);
      return;
    }

    try {
      const batch = await this._fetchOneConversationBatch();

      if (batch.length === 0) {
        this._convHasMore = false;
        this.conversationBatchesComplete$.next(true);
        return;
      }

      // Build conversations from batch
      const convPromises = batch.map(async ([roomId, meta]: [string, any]) => {
        try {
          // ✅ FIX: Use roomId-based type detection as fallback (same as fetchNewConversation)
          let type: IConversation['type'] = meta.type || 'private';
          if (!meta.type) {
            if (roomId.startsWith('group_')) type = 'group';
            else if (roomId.startsWith('community_')) type = 'community';
          }
          if (type === 'private')
            return await this.fetchPrivateConvDetails(roomId, meta);
          if (type === 'group') {
            try {
              const groupRef = rtdbRef(this.db, `groups/${roomId}`);
              const groupSnap = await rtdbGet(groupRef);
              if (!groupSnap.exists()) return null;
              const groupData = groupSnap.val() || {};
              if (
                groupData.communityId &&
                (groupData.title === 'Announcements' ||
                  groupData.title === 'General')
              )
                return null;
              return await this.fetchGroupConDetails(roomId, meta);
            } catch {
              return null;
            }
          }
          if (type === 'community')
            return await this.fetchCommunityConvDetails(roomId, meta);
          return null;
        } catch {
          return null;
        }
      });

      const results = await Promise.allSettled(convPromises);
      const newConvs: IConversation[] = [];
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) newConvs.push(r.value);
      });

      // Merge with existing
      const existing = this._conversations$.value;
      const merged = [...existing];
      newConvs.forEach((nc) => {
        const idx = merged.findIndex((c) => c.roomId === nc.roomId);
        if (idx >= 0) merged[idx] = { ...merged[idx], ...nc };
        else merged.push(nc);
      });
      this._conversations$.next(merged);

      // Save to PouchDB
      try {
        await this.chatPouchDb.saveConversations(
          this.senderId as string,
          merged.map((c) => ({
            ...c,
            syncStatus: 'synced',
            lastSyncedAt: Date.now(),
          })),
          false
        );
      } catch {}

      // Update cursor
      if (newConvs.length > 0) {
        const timestamps = newConvs
          .map((c) =>
            c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0
          )
          .filter((t) => t > 0);
        if (timestamps.length > 0) {
          this._convOldestTimestamp = Math.min(...timestamps);
        }
      }

      if (batch.length < this.CONV_BATCH_SIZE) {
        this._convHasMore = false;
        this.conversationBatchesComplete$.next(true);
        return;
      }

      // Fetch next batch
      this._convRetryCount = 0;
      await this._fetchConversationBatches();
    } catch (error) {
      console.error('❌ _fetchConversationBatches error:', error);
      this._convRetryCount++;
      if (this._convRetryCount > this.CONV_MAX_RETRIES) {
        this.conversationBatchesComplete$.next(true);
        return;
      }
      const delay = Math.pow(2, this._convRetryCount - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));
      await this._fetchConversationBatches();
    }
  }

  private async _fetchOneConversationBatch(): Promise<[string, any][]> {
    const db = getDatabase();
    const userChatsPath = `userchats/${this.senderId}`;
    const baseRef = rtdbRef(db, userChatsPath);

    let q;
    if (this._convOldestTimestamp == null) {
      q = query(
        baseRef,
        orderByChild('lastmessageAt'),
        limitToLast(this.CONV_BATCH_SIZE)
      );
    } else {
      q = query(
        baseRef,
        orderByChild('lastmessageAt'),
        endAt(this._convOldestTimestamp - 1),
        limitToLast(this.CONV_BATCH_SIZE)
      );
    }

    const snap = await rtdbGet(q);
    if (!snap.exists()) return [];

    const val = snap.val() || {};
    return Object.entries(val) as [string, any][];
  }

  private setupConversationListener(): void {
    if (this._userChatsListener) {
      console.log('Listener already active');
      return;
    }

    const userChatsPath = `userchats/${this.senderId}`;
    const userChatsRef = rtdbRef(this.db, userChatsPath);

    const processedOnAdd = new Set<string>();

    // ── onChildChanged ───────────────────────────────────────────────
    const changedUnsub = onChildChanged(userChatsRef, async (snap) => {
      const roomId = snap.key!;

      const normalizedRoomId = this.ensureCanonicalRoomId(roomId);
      if (normalizedRoomId !== roomId) {
        console.warn(
          `⚠️ Listener got non-canonical roomId: ${roomId} → ${normalizedRoomId}`
        );
        // Skip processing non-canonical — the canonical one will also fire
        return;
      }
      const meta: IChatMeta = { ...snap.val(), roomId };

      if ((meta.lastmessageType as string) === 'system') {
        console.log(`⏭️ Skipping system message update for room: ${roomId}`);
        return;
      }

      const current = [...this._conversations$.value];
      const idx = current.findIndex((c) => c.roomId === roomId);

      if (idx === -1) {
        processedOnAdd.delete(roomId);
        try {
          const newConv = await this.fetchNewConversation(roomId, meta);
          if (!newConv) return;

          const latest = this._conversations$.value;
          if (latest.some((c) => c.roomId === roomId)) return; // race condition guard

          const updated = [...latest, newConv];
          this._conversations$.next(updated);

          await this.chatPouchDb
            .saveConversations(
              this.senderId as string,
              updated.map((c) => ({
                ...c,
                syncStatus: 'synced',
                lastSyncedAt: Date.now(),
              })),
              false
            )
            .catch((e) => console.warn('PouchDB save failed:', e));
        } catch (err) {
          console.error('onChildChanged->new conv error:', err);
        }
        return;
      }

      try {
        const decryptedText = await this.encryptionService.decrypt(
          meta.lastmessage
        );
        current[idx] = {
          ...current[idx],
          lastMessage: decryptedText ?? current[idx].lastMessage,
          lastMessageType: meta.lastmessageType ?? current[idx].lastMessageType,
          lastMessageAt: meta.lastmessageAt
            ? new Date(Number(meta.lastmessageAt))
            : current[idx].lastMessageAt,
          unreadCount: Number(meta.unreadCount || 0),
          isArchived: meta.isArchived,
          updatedAt: meta.lastmessageAt
            ? new Date(Number(meta.lastmessageAt))
            : current[idx].updatedAt,
        };
        this._conversations$.next([...current]);

        await this.chatPouchDb
          .updateConversationField(this.senderId as string, roomId, {
            lastMessage: decryptedText,
            lastMessageType: meta.lastmessageType,
            lastMessageAt: new Date(Number(meta.lastmessageAt)),
            unreadCount: Number(meta.unreadCount || 0),
            isArchived: meta.isArchived,
            updatedAt: new Date(Number(meta.lastmessageAt)),
          })
          .catch((e) => console.warn('PouchDB update failed:', e));
      } catch (e) {
        console.error('onChildChanged error for', roomId, e);
      }
    });

    // ── onChildAdded ─────────────────────────────────────────────────
    const addedUnsub = onChildAdded(userChatsRef, async (snap) => {
      const roomId = snap.key!;
      const normalizedRoomId = this.ensureCanonicalRoomId(roomId);
      if (normalizedRoomId !== roomId) {
        console.warn(`⚠️ Skipping non-canonical roomId in listener: ${roomId}`);
        return;
      }
      const meta: IChatMeta = { ...snap.val(), roomId };

      const alreadyExists = this._conversations$.value.some(
        (c) => c.roomId === roomId
      );
      if (alreadyExists) return;

      // ✅ FIX: Don't block re-processing — remove processedOnAdd guard
      // processedOnAdd was preventing newly-added group chats from showing
      if (processedOnAdd.has(roomId)) {
        // ✅ But still allow if it's a fresh add (not just a stale guard)
        processedOnAdd.delete(roomId); // Clear stale guard, re-process
      }

      processedOnAdd.add(roomId);

      console.log(`🆕 New conversation detected: ${roomId}`);

      try {
        const newConv = await this.fetchNewConversation(roomId, meta);
        if (!newConv) {
          processedOnAdd.delete(roomId);
          return;
        }

        const current = this._conversations$.value;
        if (current.some((c) => c.roomId === roomId)) return;

        const updated = [...current, newConv];
        this._conversations$.next(updated);
        console.log(`✅ New conversation added to UI: ${roomId}`);

        await this.chatPouchDb
          .saveConversations(
            this.senderId as string,
            updated.map((c) => ({
              ...c,
              syncStatus: 'synced',
              lastSyncedAt: Date.now(),
            })),
            false
          )
          .catch((e) => console.warn('PouchDB save failed:', e));
      } catch (err) {
        console.error('onChildAdded error for', roomId, err);
        processedOnAdd.delete(roomId);
      }
    });

    // ── onChildRemoved: ✅ KEY FIX - deleted roomId ko processedOnAdd se hata do
    const removedUnsub = onChildRemoved(userChatsRef, (snap) => {
      const roomId = snap.key!;
      console.log(`🗑️ Conversation removed from Firebase: ${roomId}`);

      // ✅ CRITICAL: Guard hata do taaki future message aane par re-add ho sake
      processedOnAdd.delete(roomId);

      // _conversations$ se bhi remove karo (agar abhi bhi hai)
      const current = this._conversations$.value;
      const filtered = current.filter((c) => c.roomId !== roomId);
      if (filtered.length !== current.length) {
        this._conversations$.next(filtered);
      }

      // ✅ PouchDB se bhi remove karo — warna app restart par wapas aajata hai
      if (this.senderId) {
        this.chatPouchDb.deleteConversation(this.senderId, roomId).catch((e) =>
          console.warn('PouchDB deleteConversation failed:', e)
        );
      }
    });

    // ── Combined cleanup ──────────────────────────────────────────────
    this._userChatsListener = () => {
      changedUnsub();
      addedUnsub();
      removedUnsub(); // ✅ cleanup mein include karo
    };

    console.log(
      '✅ Real-time conversation listener active (childAdded + childChanged + childRemoved)'
    );
  }

  private async fetchNewConversation(
    roomId: string,
    chatMeta: IChatMeta
  ): Promise<IConversation | null> {
    try {
      // const type: IConversation['type'] = chatMeta.type || 'private';

       let type: IConversation['type'] = chatMeta.type || 'private';
      if (!chatMeta.type) {
        if (roomId.startsWith('group_')) type = 'group';
        else if (roomId.startsWith('community_')) type = 'community';
      }

      if (type === 'private') {
        return await this.fetchPrivateConvDetails(roomId, chatMeta);
      } else if (type === 'group') {
        const isSystemGroup = await this.isSystemGroupInCommunity(roomId);
        if (isSystemGroup) {
          console.log(`⏭️ Skipping new system group ${roomId}`);
          return null;
        }
        return await this.fetchGroupConDetails(roomId, chatMeta);
      } else if (type === 'community') {
        return await this.fetchCommunityConvDetails(roomId, chatMeta);
      } else {
        return {
          roomId,
          type: 'private',
          title: roomId,
          lastMessage: chatMeta.lastmessage,
          lastMessageAt: chatMeta.lastmessageAt
            ? new Date(Number(chatMeta.lastmessageAt))
            : undefined,
          unreadCount: Number(chatMeta.unreadCount) || 0,
        } as IConversation;
      }
    } catch (error) {
      console.error('fetchNewConversation error:', error);
      return null;
    }
  }

  private _groupTitleListeners: Map<string, () => void> = new Map();
  private _communityTitleListeners: Map<string, () => void> = new Map();

  // 🆕 Helper method to update conversation title in real-time
  private updateConversationTitle(roomId: string, newTitle: string): void {
    const convs = this._conversations$.value;
    const idx = convs.findIndex((c) => c.roomId === roomId);

    if (idx > -1) {
      const updated = [...convs];
      updated[idx] = {
        ...updated[idx],
        title: newTitle,
      };
      this._conversations$.next(updated);

      console.log(`✅ Updated title for ${roomId}: ${newTitle}`);
    }
  }

  private async fetchCommunityConvDetails(
    roomId: string,
    meta: IChatMeta
  ): Promise<IConversation> {
    try {
      const communityRef = rtdbRef(this.db, `communities/${roomId}`);
      const communitySnap = await rtdbGet(communityRef);
      const community: Partial<ICommunity> = communitySnap.val() || {};

      const membersObj: Record<
        string,
        Partial<ICommunityMember>
      > = community.members || {};
      const members = Object.keys(membersObj);

      let decryptedText: string | undefined;
      try {
        decryptedText = await this.encryptionService.decrypt(meta?.lastmessage);
      } catch (e) {
        console.warn(
          'fetchCommunityConvDetails: decrypt failed for',
          roomId,
          e
        );
        decryptedText =
          typeof meta?.lastmessage === 'string' ? meta.lastmessage : undefined;
      }

      const conv: IConversation = {
        roomId,
        type: 'community',
        title: community.title || 'COMMUNITY',
        avatar: community.avatar || '',
        members,
        adminIds: community.adminIds || [],
        isArchived: !!meta.isArchived,
        isPinned: !!meta.isPinned,
        isLocked: !!meta.isLocked,
        createdAt: community.createdAt
          ? this.parseDate(community.createdAt)
          : undefined,
        lastMessage: decryptedText ?? undefined,
        lastMessageType: meta.lastmessageType ?? undefined,
        lastMessageAt: meta.lastmessageAt
          ? this.parseDate(meta.lastmessageAt)
          : undefined,
        unreadCount: meta.unreadCount || 0,
        updatedAt: meta.lastmessageAt
          ? this.parseDate(meta.lastmessageAt)
          : undefined,
      } as IConversation;

      return conv;
    } catch (error) {
      console.error('Error fetching community details:', error);
      throw error;
    }
  }

  async syncReceipt(convs: { roomId: string; unreadCount: number }[]) {
    try {
      if (!convs.length) return;

      await Promise.allSettled(
        convs.map(async (conv) => {
          const messagesSnap = await this.getMessagesSnap(
            conv.roomId,
            conv.unreadCount as number
          );

          const messagesObj = messagesSnap.exists() ? messagesSnap.val() : {};
          const messages = Object.keys(messagesObj)
            .map((k) => ({
              ...messagesObj[k],
              msgId: k,
              timestamp: messagesObj[k].timestamp ?? 0,
            }))
            .sort((a, b) => a.timestamp - b.timestamp);

          // Mark all messages as delivered in parallel
          await Promise.allSettled(
            messages.map((m) =>
              this.markAsDelivered(m.msgId, null, conv.roomId as string)
            )
          );
        })
      );
    } catch (error) {
      console.error('syncReceipt error:', error);
    }
  }

  // new function updated
  async syncMessagesWithServer(
    removedOrLeftAt: string | null = null
  ): Promise<void> {
    try {
      // ✅ Check if online FIRST
      if (!this.networkService.isOnline.value) {
        console.log('📴 Offline - skipping syncMessagesWithServer');
        return;
      }

      const roomId = this.currentChat?.roomId;
      if (!roomId) {
        console.error('syncMessagesWithServer: No roomId present');
        return;
      }

      console.log(
        '🌐 Online - 📥 Sync messages - removedOrLeftAt:',
        removedOrLeftAt
      );

      const baseRef = rtdbRef(this.db, `chats/${roomId}`);
      const state = this._roomPaginationState.get(roomId);
      if (
        state &&
        state.messages.length > 0 &&
        state.newestLoadedTimestamp != null
      ) {
        const qNew = query(
          baseRef,
          orderByChild('timestamp'),
          startAfter(state.newestLoadedTimestamp)
        );
        const snapNew = await rtdbGet(qNew);
        const newChildren: DataSnapshot[] = [];
        snapNew.forEach((c: any) => {
          newChildren.push(c);
        });
        if (newChildren.length === 0) return;

        const newMessages: IMessage[] = [];
        for (const s of newChildren) {
          const m = await this.snapToMsgFromSnapshot(
            roomId,
            s,
            removedOrLeftAt
          );
          if (m) newMessages.push(m);
        }
        if (newMessages.length === 0) return;

        const enriched = await this.enrichMessagesWithSenderNames(
          newMessages,
          roomId
        );
        const asIMessage: IMessage[] = enriched.map((m) => ({
          ...m,
          isMe: m.sender === this.senderId,
          roomId,
        }));
        const combined = [...state.messages, ...asIMessage];
        const newestTs = Math.max(
          ...asIMessage.map((m) => Number(new Date(m.timestamp).getTime()))
        );
        this._roomPaginationState.set(roomId, {
          messages: combined,
          oldestLoadedTimestamp: state.oldestLoadedTimestamp,
          newestLoadedTimestamp: newestTs,
          hasMoreOlder: state.hasMoreOlder,
        });
        this.emitRoomMessages(roomId, combined);
        const existingCached = await this.chatPouchDb.getMessages(roomId);
        const merged = [...existingCached];
        for (const msg of asIMessage) {
          if (!merged.some((x) => x.msgId === (msg as any).msgId)) {
            merged.push(msg as any);
          }
        }
        merged.sort(
          (a: any, b: any) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        await this.chatPouchDb.saveMessages(roomId, merged, true);
        return;
      }

      const currentMap = new Map(this._messages$.value);
      const currentArr = currentMap.get(roomId) ?? [];

      const snapToMsg = async (s: DataSnapshot): Promise<any | null> => {
        const payload = s.val() ?? {};
        const msgKey = s.key!;

        // Filter messages by removedOrLeftAt timestamp
        if (removedOrLeftAt && payload.timestamp) {
          const messageTimestamp = Number(payload.timestamp);
          const cutoffTimestamp = Number(removedOrLeftAt);

          if (messageTimestamp > cutoffTimestamp) {
            console.log(
              `⏭️ Skipping message ${msgKey} (timestamp: ${messageTimestamp} > cutoff: ${cutoffTimestamp})`
            );
            return null;
          }
        }

        const decryptedText = await this.encryptionService.decrypt(
          payload.text as string
        );

        return {
          msgId: msgKey,
          isMe: payload.sender === this.senderId,
          ...payload,
          text: decryptedText,
          ...(payload.attachment && {
            attachment: { ...payload.attachment },
          }),
        };
      };

      console.log('inside the sync message with server');
      console.log('current array length', currentArr.length);

      // 🔥 CASE 1: Load ALL messages (initial load with timestamp query)
      if (!currentArr.length) {
        console.log('################ load all messages');

        // ✅ OPTIMIZED: Use timestamp-based query
        const q = removedOrLeftAt
          ? query(
              baseRef,
              orderByChild('timestamp'),
              endAt(Number(removedOrLeftAt))
            )
          : query(baseRef, orderByChild('timestamp'));

        if (removedOrLeftAt) {
          console.log(
            `📥 Loading and filtering messages before timestamp: ${removedOrLeftAt}`
          );
        } else {
          console.log('📥 Loading all messages with timestamp ordering');
        }

        const snap = await rtdbGet(q);
        const fetched: IMessage[] = [];
        const children: any[] = [];

        snap.forEach((child: any) => {
          children.push(child);
        });

        console.log(`📊 Total messages in DB: ${children.length}`);

        let filteredCount = 0;
        for (const s of children) {
          try {
            const m = await snapToMsg(s);
            if (m === null) {
              filteredCount++;
              continue;
            }

            fetched.push(m);
          } catch (err) {
            console.warn(
              'sqlite saveMessage failed for item',
              s?.key ?? s?.id ?? s,
              err
            );
          }
        }

        if (removedOrLeftAt) {
          console.log(
            `🔍 Filtered out ${filteredCount} messages after timestamp`
          );
        }

        // ✅ Messages already sorted by timestamp from Firebase query
        // No need to sort again!

        // Save to PouchDB cache
        await this.chatPouchDb.saveMessages(
          roomId,
          fetched.map((m) => ({
            ...m,
            syncStatus: 'synced',
            localTimestamp: Date.now(),
          }))
        );

        console.log(
          `✅ Loaded ${fetched.length} messages (${filteredCount} filtered)`
        );
        fetched.forEach((m) => this.pushMsgToChat(m));
        return;
      }

      // 🔥 CASE 2: Find last message by timestamp (not by key)
      const sortedMessages = currentArr.sort(
        (a, b) => Number(a.timestamp) - Number(b.timestamp)
      );
      const last = sortedMessages[sortedMessages.length - 1] || null;

      const lastTimestamp = last?.timestamp ? Number(last.timestamp) : null;

      if (!lastTimestamp) {
        console.log(
          '⚠️ syncMessagesWithServer: last message missing timestamp; falling back to latest page'
        );
        const pageSize = 50;

        // ✅ OPTIMIZED: Use timestamp-based limitToLast
        const q = query(
          baseRef,
          orderByChild('timestamp'),
          limitToLast(pageSize)
        );
        console.log(`📥 Loading last ${pageSize} messages`);

        const snap = await rtdbGet(q);
        const fetched: IMessage[] = [];
        const children: any[] = [];

        snap.forEach((child: any) => {
          children.push(child);
        });

        let filteredCount = 0;
        for (const s of children) {
          try {
            const m = await snapToMsg(s);
            if (m === null) {
              filteredCount++;
              continue;
            }

            fetched.push(m);
          } catch (err) {
            console.warn(
              'sqlite saveMessage failed for item',
              s?.key ?? s?.id ?? s,
              err
            );
          }
        }

        // Already sorted by timestamp from query
        await this.chatPouchDb.saveMessages(
          roomId,
          fetched.map((m) => ({
            ...m,
            syncStatus: 'synced',
            localTimestamp: Date.now(),
          }))
        );

        console.log(
          `✅ Loaded ${fetched.length} messages from fallback (${filteredCount} filtered)`
        );
        fetched.forEach((m) => this.pushMsgToChat(m));
        return;
      }

      // Check if we already have all messages before removedOrLeftAt
      if (removedOrLeftAt && last?.timestamp) {
        const lastTimestampNum = Number(last.timestamp);
        const cutoffTimestamp = Number(removedOrLeftAt);

        if (lastTimestampNum >= cutoffTimestamp) {
          console.log(
            '✅ Already loaded all messages before removedOrLeftAt timestamp'
          );
          return;
        }
      }

      // 🔥 CASE 3: Load NEW messages after last timestamp
      // ✅ OPTIMIZED: Use timestamp-based startAfter
      const qNew = query(
        baseRef,
        orderByChild('timestamp'),
        startAfter(lastTimestamp)
      );
      console.log(`📥 Loading new messages after timestamp ${lastTimestamp}`);

      const snapNew = await rtdbGet(qNew);

      const newMessages: IMessage[] = [];
      const children: any[] = [];

      snapNew.forEach((child: any) => {
        children.push(child);
        return false;
      });

      // ✅ Fetch from private vault (Private Sync feature)
      const myId = this.senderId || this.authService.authData?.userId;
      const privateRef = rtdbRef(this.db, `private_messages/${myId}/${roomId}`);
      const qPrivate = query(
        privateRef,
        orderByChild('timestamp'),
        startAfter(lastTimestamp)
      );
      const privateSnap = await rtdbGet(qPrivate);
      if (privateSnap.exists()) {
        privateSnap.forEach((c: any) => {
          if (!children.some((child) => child.key === c.key)) {
            children.push(c);
          }
        });
      }

      console.log(
        `📊 Found ${children.length} new messages in DB (including private vault)`
      );
      let filteredCount = 0;
      for (const s of children) {
        try {
          const m = await snapToMsg(s);
          if (m === null) {
            filteredCount++;
            continue;
          }

          newMessages.push(m);
        } catch (err) {
          console.warn(
            'sqlite saveMessage failed for item',
            s?.key ?? s?.id ?? s,
            err
          );
        }
      }

      if (newMessages.length === 0) {
        console.log(
          `ℹ️ No new messages to load (${filteredCount} filtered out)`
        );
        return;
      }

      for (const m of newMessages) {
        currentArr.push(m);
      }

      // Update cache with new messages
      await this.chatPouchDb.saveMessages(
        roomId,
        currentArr.map((m) => ({
          ...m,
          syncStatus: 'synced',
          localTimestamp: Date.now(),
        }))
      );

      console.log(
        `✅ Added ${newMessages.length} new messages (${filteredCount} filtered)`
      );
      currentArr.forEach((m) => this.pushMsgToChat(m));
    } catch (error) {
      console.error('❌ syncMessagesWithServer error:', error);

      // Restore from cache on error
      try {
        const cached = await this.chatPouchDb.getMessages(
          this.currentChat?.roomId as string
        );
        if (cached.length > 0) {
          cached.forEach((msg) => this.pushMsgToChat(msg));
          console.log('✅ Restored messages from cache after sync error');
        }
      } catch (cacheErr) {
        console.error('Failed to restore messages from cache:', cacheErr);
      }
    }
  }
  fetchOnce = async (path: string) => {
    // or use your existing db instance if stored in this.db
    const snapshot = await get(ref(this.db, path));
    return snapshot.exists() ? snapshot.val() : null;
  };

  // async getMessagesSnap(roomId: string, limit: number) {
  //   return await get(
  //     query(
  //       ref(this.db, `chats/${roomId}`),
  //       orderByChild('timestamp'),
  //       limitToLast(limit)
  //     )
  //   );
  // }

  async getMessagesSnap(roomId: string, limit: number) {
    // ✅ OPTIMIZED: Use timestamp ordering instead of key ordering
    return await get(
      query(
        ref(this.db, `chats/${roomId}`),
        orderByChild('timestamp'),
        limitToLast(limit)
      )
    );
  }

  getMessages(): Observable<IMessage[] | undefined> {
    return this._messages$.asObservable().pipe(
      map(
        (messagesMap: Map<string, IMessage[]>) =>
          messagesMap
            .get(this.currentChat?.roomId as string)
            ?.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
            ?.map((msg, idx, arr) => ({
              ...msg,
              timestamp: new Date(msg.timestamp), // convert timestamp to Date object
              isLast: arr.length - 1 == idx,
            })) || []
      )
    );
  }

  get hasMoreMessages(): boolean {
    const roomId = this.currentChat?.roomId as string;
    const state = this._roomPaginationState.get(roomId);
    return state?.hasMoreOlder ?? false;
  }

  async setArchiveConversation(
    roomIds: string[],
    isArchive: boolean = true
  ): Promise<void> {
    if (!this.senderId) {
      throw new Error('senderId not set');
    }
    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      console.error('RoomIds is not an array');
      return;
    }

    const existing = this.currentConversations;
    const db = getDatabase();

    const findLocalConv = (roomId: string) => {
      return (
        existing.find(
          (c) => c.roomId === roomId && c.isArchived != isArchive
        ) ?? null
      );
    };

    await Promise.all(
      roomIds.map(async (roomId) => {
        try {
          const chatRef = rtdbRef(db, `userchats/${this.senderId}/${roomId}`);
          const snap: DataSnapshot = await rtdbGet(chatRef);
          if (snap.exists()) {
          await this.chatBackendSocket.setArchived({
            roomId,
            isArchived: isArchive,
          });
          } else {
            const localConv: any = findLocalConv(roomId);
            const meta: Partial<IChatMeta> = {
              type: (localConv?.type as IChatMeta['type']) ?? 'private',
              lastmessageAt:
                localConv?.lastMessageAt instanceof Date
                  ? localConv.lastMessageAt.getTime()
                  : typeof localConv?.lastMessageAt === 'number'
                  ? Number(localConv.lastMessageAt)
                  : Date.now(),
              lastmessageType:
                (localConv?.lastMessageType as IChatMeta['lastmessageType']) ??
                'text',
              lastmessage: localConv?.lastMessage ?? '',
              unreadCount:
                typeof localConv?.unreadCount === 'number'
                  ? localConv.unreadCount
                  : Number(localConv?.unreadCount) || 0,
              isArchived: isArchive,
              isPinned: !!localConv?.isPinned,
              isLocked: !!localConv?.isLocked,
            };

            await rtdbSet(chatRef, meta);
          }

          // 🔥 NEW: Update PouchDB
          try {
            await this.chatPouchDb.updateConversationArchiveStatus(
              this.senderId as string,
              roomId,
              isArchive
            );
          } catch (cacheErr) {
            console.warn('⚠️ PouchDB update failed:', cacheErr);
          }

          const localConv = findLocalConv(roomId);
          if (localConv) {
            localConv.isArchived = isArchive;
            const idx = existing.findIndex((c) => c.roomId === roomId);
            if (idx > -1) {
              existing[idx] = {
                ...existing[idx],
                ...localConv,
              };
            } else {
              existing.push(localConv);
            }
          }
          this._conversations$.next(existing);
        } catch (err) {
          console.error('Failed to archive room:', roomId, err);
        }
      })
    );
  }

  async setPinConversation(
    roomIds: string[],
    pin: boolean = true
  ): Promise<{ success: boolean; message?: string }> {
    try {
      if (!this.senderId) {
        throw new Error('senderId not set');
      }

      if (!Array.isArray(roomIds) || roomIds.length === 0) {
        console.error('RoomIds is not an array');
        return { success: false, message: 'Invalid room IDs' };
      }

      const existing = [...this.currentConversations];
      const db = getDatabase();
      const now = Date.now();

      if (pin) {
        const currentPinnedCount = existing.filter((c) => c.isPinned).length;

        if (currentPinnedCount >= 3) {
          console.warn('⚠️ Maximum 3 chats can be pinned');
          return {
            success: false,
            message:
              'Maximum 3 chats can be pinned. Please unpin a chat first.',
          };
        }

        if (currentPinnedCount + roomIds.length > 3) {
          return {
            success: false,
            message: `You can only pin ${
              3 - currentPinnedCount
            } more chat(s). Please unpin some chats first.`,
          };
        }
      }

      const findLocalConv = (roomId: string) => {
        return existing.find((c) => c.roomId === roomId) ?? null;
      };

      await Promise.all(
        roomIds.map(async (roomId) => {
          try {
            const chatRef = rtdbRef(db, `userchats/${this.senderId}/${roomId}`);
            const snap: DataSnapshot = await rtdbGet(chatRef);

            const updateData: any = {
              isPinned: pin,
            };

            if (pin) {
              updateData.pinnedAt = now;
            } else {
              updateData.pinnedAt = '';
            }

            if (snap.exists()) {
              await this.chatBackendSocket.setPinned({
                roomId,
                isPinned: pin,
                pinnedAt: pin ? now : '',
              });
            } else {
              const localConv: any = findLocalConv(roomId);
              const meta: Partial<IChatMeta> = {
                type: (localConv?.type as IChatMeta['type']) ?? 'private',
                lastmessageAt:
                  localConv?.lastMessageAt instanceof Date
                    ? localConv.lastMessageAt.getTime()
                    : typeof localConv?.lastMessageAt === 'number'
                    ? Number(localConv?.lastMessageAt)
                    : Date.now(),
                lastmessageType:
                  (localConv?.lastMessageType as IChatMeta['lastmessageType']) ??
                  'text',
                lastmessage: localConv?.lastMessage ?? '',
                unreadCount:
                  typeof localConv?.unreadCount === 'number'
                    ? localConv.unreadCount
                    : Number(localConv?.unreadCount) || 0,
                isPinned: pin,
                pinnedAt: pin ? now : '',
                isArchived: !!localConv?.isArchived,
                isLocked: !!localConv?.isLocked,
              };

              await rtdbSet(chatRef, meta);
            }

            // 🔥 NEW: Update PouchDB
            try {
              await this.chatPouchDb.updateConversationPinStatus(
                this.senderId as string,
                roomId,
                pin,
                pin ? now : null
              );
            } catch (cacheErr) {
              console.warn('⚠️ PouchDB update failed:', cacheErr);
            }

            const localConv = findLocalConv(roomId);
            if (localConv) {
              localConv.isPinned = pin;
              localConv.pinnedAt = pin ? now : null;

              const idx = existing.findIndex((c) => c.roomId === roomId);
              if (idx > -1) {
                existing[idx] = { ...existing[idx], ...localConv };
              }
            }
          } catch (err) {
            console.error('Failed to pin/unpin room:', roomId, err);
          }
        })
      );

      this._conversations$.next([...existing]);

      console.log(
        `✅ ${pin ? 'Pinned' : 'Unpinned'} ${roomIds.length} conversation(s)`
      );

      return { success: true };
    } catch (error) {
      console.error('Error in setPinConversation:', error);
      return { success: false, message: 'Failed to update pin status' };
    }
  }

  async setLockConversation(
    roomIds: string[],
    lock: boolean = true
  ): Promise<void> {
    if (!this.senderId) {
      throw new Error('senderId not set');
    }

    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      console.error('RoomIds is not an array');
      return;
    }

    const existing = this.currentConversations;

    // helper to find local conversation that isn't already locked
    const findLocalConv = (roomId: string) =>
      existing.find((c) => c.roomId === roomId && c.isLocked != lock) ?? null;

    await Promise.all(
      roomIds.map(async (roomId) => {
        try {
          const chatRef = rtdbRef(
            this.db,
            `userchats/${this.senderId}/${roomId}`
          );
          const snap: DataSnapshot = await rtdbGet(chatRef);

          if (snap.exists()) {
            // ✅ Update existing chat node
          await this.chatBackendSocket.setLocked({
            roomId,
            isLocked: lock,
          });
          } else {
            // ✅ Create a new chat metadata entry
            const localConv: any = findLocalConv(roomId);
            const meta: Partial<IChatMeta> = {
              type: (localConv?.type as IChatMeta['type']) ?? 'private',
              lastmessageAt:
                localConv?.lastMessageAt instanceof Date
                  ? localConv.lastMessageAt.getTime()
                  : typeof localConv?.lastMessageAt === 'number'
                  ? Number(localConv.lastMessageAt)
                  : Date.now(),
              lastmessageType:
                (localConv?.lastMessageType as IChatMeta['lastmessageType']) ??
                'text',
              lastmessage: localConv?.lastMessage ?? '',
              unreadCount:
                typeof localConv?.unreadCount === 'number'
                  ? localConv.unreadCount
                  : Number(localConv?.unreadCount) || 0,
              isLocked: lock,
              isPinned: !!localConv?.isPinned,
              isArchived: !!localConv?.isArchived,
            };

            await rtdbSet(chatRef, meta);
          }

          const localConv = findLocalConv(roomId);
          if (localConv) {
            localConv.isLocked = true;
            const idx = existing.findIndex((c) => c.roomId === roomId);
            if (idx > -1) {
              existing[idx] = { ...existing[idx], ...localConv };
            } else {
              existing.push(localConv);
            }
          }
          this._conversations$.next(existing);
        } catch (err) {
          console.error('Failed to lock room:', roomId, err);
        }
      })
    );
  }

  async bulkUpdate(updates: any) {
    const db = getDatabase();
    await rtdbUpdate(rtdbRef(db, '/'), updates);
  }

  async setPath(path: string, value: any) {
    const db = getDatabase();
    await rtdbSet(rtdbRef(db, path), value);
  }

  async listenRoomStream(
    roomId: string,
    handlers: {
      onAdd?: (msgKey: string, data: any, isNew: boolean) => void;
      onChange?: (msgKey: string, data: any) => void;
      onRemove?: (msgKey: string) => void;
    }
  ) {
    if (!this.networkService.isOnline.value) {
      console.log('📴 Skipping listenRoomStream - offline');
      return () => {};
    }

    const roomRef = ref(this.db, `chats/${roomId}`);

    const timestampQuery = query(roomRef, orderByChild('timestamp'));

    const snapshot = await get(timestampQuery);
    const existing = snapshot.val() || {};

    if (handlers.onAdd) {
      const items = Object.entries(existing).map(([k, v]: any) => ({
        key: k,
        val: v,
      }));

      items.forEach((i) => handlers.onAdd!(i.key, i.val, false));
    }

    const addedHandler = async (snap: any) => {
      const key = snap.key!;
      const val = snap.val();

      const currentMessagesMap = new Map(this._messages$.value);
      const existingMessages = currentMessagesMap.get(roomId) || [];
      const existingKeys = new Set(existingMessages.map((m: any) => m.msgId));
      if (existingKeys.has(key)) return;

      if (val.isDisappeared) {
        // ✅ Just set the flag, don't clear text
        await this.updateMessageLocally({
          ...val,
          msgId: key,
          roomId,
          isDisappeared: true,
        } as any);
        return;
      }
      if (val.expiresAt && val.expiresAt <= Date.now()) {
        // Abhi expire ho gaya — flag update karo (socket se, direct RTDB write nahi)
        await this.chatBackendSocket.applySecuredBatchUpdates({
          updates: {
            [`chats/${roomId}/${key}/isDisappeared`]: true,
          },
        });
        return;
      }

      // Skip messages already deleted for the current user (handles both formats)
      const deletedForCheck = val.deletedFor || {};
      const isDeletedForCurrentUser =
        deletedForCheck.everyone === true ||
        (Array.isArray(deletedForCheck.users) && deletedForCheck.users.map(String).includes(String(this.senderId))) ||
        deletedForCheck[String(this.senderId)] === true; // old flat format
      if (isDeletedForCurrentUser) return;

      console.log('🔥 New message added:', key);

      // ✅ NEW: Cache received message to PouchDB immediately
      // For self-sent messages, skip the cache here — sendMessage/sendForwardMessage
      // already saved to PouchDB with correct fields (e.g. isForwarded: true).
      // Writing again from RTDB data would overwrite with a copy that may be missing fields
      // (e.g. isForwarded) that the backend doesn't yet persist in RTDB.
      const isSelfMsg = String(val.sender) === String(this.senderId);
      if (!isSelfMsg) {
        try {
          const message: IMessage = {
            msgId: key,
            ...val,
            timestamp: this.normalizeTs(val.timestamp),
            isMe: false,
          };

          if (message.text) {
            try {
              message.text = await this.encryptionService.decrypt(
                message.text as string
              );
            } catch {
              // already decrypted or non-text
            }
          }
          // Also decrypt translations.original.text
          if ((message as any).translations?.original?.text) {
            try {
              const decOrig = await this.encryptionService.decrypt((message as any).translations.original.text);
              (message as any).translations = {
                ...(message as any).translations,
                original: { ...(message as any).translations.original, text: decOrig },
              };
            } catch { /* leave as-is */ }
          }
          await this.chatPouchDb.addMessage(roomId, message);
        } catch (error) {
          console.warn(`⚠️ Failed to cache message ${key}:`, error);
        }
      }

      handlers.onAdd?.(key, val, true);
    };

    const changedHandler = async (snap: any) => {
      const msgKey = snap.key!;
      const msgData = snap.val();

      if (msgData.isDisappeared) {
        await this.updateMessageLocally({
          ...msgData,
          msgId: msgKey,
          roomId,
          isDisappeared: true,
        } as any);
        await this.updateLastMessageAfterDisappear(roomId, msgKey);
        // ✅ Sync disappeared flag to PouchDB
        try {
          await this.chatPouchDb.updateMessage(roomId, msgKey, { isDisappeared: true } as any);
        } catch (cacheErr) {
          console.warn(`⚠️ Cache update failed for disappeared msg ${msgKey}:`, cacheErr);
        }
        return;
      }

      const deletedFor = msgData.deletedFor || {};

      // Per-user deletion (delete for me only): remove silently, no placeholder
      // Handles both new format (deletedFor.users[]) and old flat format (deletedFor[userId])
      const isDeletedForMeOnly =
        !deletedFor.everyone &&
        ((Array.isArray(deletedFor.users) && deletedFor.users.map(String).includes(String(this.senderId))) ||
          deletedFor[String(this.senderId!)] === true);

      if (isDeletedForMeOnly) {
        console.log(
          `🗑️ Message ${msgKey} deleted-for-me - removing from cache`
        );

        try {
          await this.chatPouchDb.deleteMessage(roomId, msgKey);
        } catch (cacheErr) {
          console.warn(`⚠️ Cache delete failed for ${msgKey}:`, cacheErr);
        }

        const messageMap = new Map(this._messages$.value);
        const messages = messageMap.get(roomId) || [];
        const updatedMessages = messages.filter((msg) => msg.msgId !== msgKey);
        messageMap.set(roomId, updatedMessages);
        this._messages$.next(messageMap);

        return;
      }

      // Everyone-deletion AND all other changes (status, reactions, edits):
      // route through onChange → updateMessageLocally → animation + placeholder
      handlers.onChange?.(msgKey, msgData);

      try {
        let decMsgTranslations = msgData.translations;
        if (msgData.translations?.original?.text) {
          try {
            const decOrigText = await this.encryptionService.decrypt(msgData.translations.original.text);
            decMsgTranslations = {
              ...msgData.translations,
              original: { ...msgData.translations.original, text: decOrigText },
            };
          } catch { /* keep as-is */ }
        }
        await this.chatPouchDb.updateMessage(roomId, msgKey, {
          ...msgData,
          text: msgData.text
            ? await this.encryptionService.decrypt(msgData.text)
            : '',
          translations: decMsgTranslations,
          syncStatus: 'synced',
        });
      } catch (cacheErr) {
        console.warn(`⚠️ Cache update failed for ${msgKey}:`, cacheErr);
      }
    };
    const removedHandler = (snap: any) => {
      handlers.onRemove?.(snap.key!);
    };

    onChildAdded(timestampQuery, addedHandler);
    onChildChanged(timestampQuery, changedHandler);
    onChildRemoved(timestampQuery, removedHandler);

    // ✅ FIX: Real-time edit delivery via socket — fires instantly for all online
// room members. onChildChanged above also handles it but has RTDB propagation delay.
const offMessageEdited = this.chatBackendSocket.onMessageEdited(async (data) => {
  if (data.roomId !== roomId) return;

  try {
    let decryptedText: string;
    try {
      decryptedText = await this.encryptionService.decrypt(data.text);
    } catch {
      decryptedText = data.text; // fallback
    }

    // Patch in-memory list immediately → instant UI update
    const messagesMap = new Map(this._messages$.value);
    const list = messagesMap.get(roomId) || [];
    const idx = list.findIndex((m: any) => m.msgId === data.msgId);
    if (idx >= 0) {
      const prev = list[idx] as any;
      list[idx] = {
        ...prev,
        text: decryptedText,
        isEdit: true,
        editedAt: data.editedAt,
        translations: prev.translations?.original
          ? {
              ...prev.translations,
              original: { ...prev.translations.original, text: decryptedText },
            }
          : prev.translations,
      };
      messagesMap.set(roomId, list);
      this._messages$.next(new Map(messagesMap));
    }

    // Persist to PouchDB (decrypted — same as all other local cache writes)
    try {
      await this.chatPouchDb.updateMessage(roomId, data.msgId, {
        text: decryptedText,
        isEdit: true,
        editedAt: data.editedAt,
        syncStatus: 'synced',
      } as any);
    } catch (cacheErr) {
      console.warn('⚠️ PouchDB edit sync failed for', data.msgId, cacheErr);
    }
  } catch (err) {
    console.error('❌ messageEdited socket handler error:', err);
  }
});

    // ✅ For group rooms: listen to member + admin changes in Firebase → sync to PouchDB
    let offGroupMembers: (() => void) | null = null;
    let offGroupAdmins: (() => void) | null = null;
    if (roomId.startsWith('group_') || roomId.startsWith('community_')) {
      const membersRef = rtdbRef(this.db, `groups/${roomId}/members`);
      const adminsRef = rtdbRef(this.db, `groups/${roomId}/adminIds`);
      const membersUnsub = onValue(membersRef, (snap) => {
        const members = snap.val() || {};
        this.chatPouchDb.updateGroupMembers(roomId, members)
          .catch((e: any) => console.warn('⚠️ PouchDB group members sync failed:', e));
      });
      const adminsUnsub = onValue(adminsRef, (snap) => {
        const raw = snap.val();
        const adminIds: string[] = raw
          ? Array.isArray(raw) ? raw.map(String) : Object.values(raw).map(String)
          : [];
        this.chatPouchDb.updateGroupAdmins(roomId, adminIds)
          .catch((e: any) => console.warn('⚠️ PouchDB group admins sync failed:', e));
      });
      offGroupMembers = () => off(membersRef);
      offGroupAdmins = () => off(adminsRef);
    }

    return () => {
      off(timestampQuery);
      offGroupMembers?.();
      offGroupAdmins?.();
    };
  }

  /** Listen to messages in a room as an Observable of message arrays */
  listenForMessages(roomId: string): Observable<any[]> {
    return new Observable((observer) => {
      const messagesRef = ref(this.db, `chats/${roomId}`);
      const off = onValue(messagesRef, (snapshot) => {
        const data = snapshot.val();
        const messages = data
          ? Object.entries(data).map(([key, val]) => ({ key, ...(val as any) }))
          : [];
        observer.next(messages);
      });

      // return teardown
      return () => {
        try {
          off();
        } catch (e) {}
      };
    });
  }

  /** Listen to single pinned message for room (callback style) */
  /** Listen to pinned messages for room (array style) */
  listenToPinnedMessage(
    roomId: string,
    callback: (pinnedMessages: PinnedMessage[]) => void
  ) {
    const pinRef = ref(this.db, `pinnedMessages/${roomId}`);
    return onValue(pinRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();

        const messages: PinnedMessage[] = Array.isArray(data)
          ? data
          : Object.values(data);

        callback(messages);
      } else {
        callback([]);
      }
    });
  }

  listenToUnreadCount(roomId: string, userId: string): Observable<number> {
    return new Observable((observer) => {
      const unreadRef = ref(this.db, `unreadCounts/${roomId}/${userId}`);
      const off = onValue(unreadRef, (snapshot) => {
        const val = snapshot.val();
        observer.next(val || 0);
      });
      return () => {
        try {
          off();
        } catch (e) {}
      };
    });
  }

  getUnreadCountOnce(roomId: string, userId: string): Promise<number> {
    return firstValueFrom(
      this.listenToUnreadCount(roomId, userId).pipe(take(1))
    );
  }

  // ============================================================================
  // FIX: Update sendMessage() to update local conversations immediately
  // ============================================================================
  // Location: Line ~3650 in firebase-chat.service.ts
  // Replace the existing sendMessage function with this updated version
  // ============================================================================

  async getBlockHistory(blockerId: string, blockedId: string): Promise<any[]> {
    try {
      const blockRef = rtdbRef(
        this.db,
        `usersBlocks/${blockerId}/${blockedId}`
      );
      const snapshot = await rtdbGet(blockRef);
      if (!snapshot.exists()) {
        return [];
      }

      const data = snapshot.val() as any;
      if (Array.isArray(data?.history)) {
        return data.history;
      }

      return [];
    } catch (error) {
      console.warn('Error reading block history:', error);
      return [];
    }
  }

  isMessageInBlockedWindow(messageTimestamp: number, history: any[]): boolean {
    if (!Array.isArray(history) || history.length === 0) {
      return false;
    }

    return history.some((h) => {
      const blockedAt = Number(h?.blockedAt || 0);
      const unblockedAt = h?.unblockedAt ? Number(h.unblockedAt) : Infinity;
      return messageTimestamp >= blockedAt && messageTimestamp <= unblockedAt;
    });
  }

  async isUserBlockedBy(
    blockerId: string,
    blockedId: string
  ): Promise<boolean> {
    try {
      const blockRef = ref(this.db, `usersBlocks/${blockerId}/${blockedId}`);
      const snapshot = await get(blockRef);
      const val = snapshot.val();
      return val?.status === 'active';
    } catch (error) {
      console.warn('Error checking block status:', error);
      return false;
    }
  }

  async sendMessage(msg: Partial<IMessage & { attachment?: any }>) {
    try {
      const { attachment, translations, ...message } = msg || {};
      const { localUrl, ...restAttachment } = attachment || {
        localUrl: undefined,
      };

      //   const roomId = this.currentChat?.roomId as string;
      //    if (roomId && !roomId.startsWith('group_') && !roomId.startsWith('community_')) {
      //   roomId = this.ensureCanonicalRoomId(roomId);
      //   // ✅ Also fix currentChat roomId if it was wrong
      //   if (this.currentChat && this.currentChat.roomId !== roomId) {
      //     console.warn(`⚠️ Non-canonical roomId detected: ${this.currentChat.roomId} → ${roomId}`);
      //     this.currentChat.roomId = roomId;
      //   }
      // }
      const rawRoomId = this.currentChat?.roomId as string;
      let roomId = rawRoomId;

      if (
        rawRoomId &&
        !rawRoomId.startsWith('group_') &&
        !rawRoomId.startsWith('community_')
      ) {
        roomId = this.ensureCanonicalRoomId(rawRoomId);
        if (this.currentChat && this.currentChat.roomId !== roomId) {
          console.warn(
            `⚠️ Non-canonical roomId detected: ${this.currentChat.roomId} → ${roomId}`
          );
          this.currentChat.roomId = roomId;
        }
      }
      const members =
        this.currentChat?.members || (roomId ? roomId.split('_') : []);

      const hasText = msg.text && msg.text.trim().length > 0;
      let encryptedText = '';
      if (hasText) {
        encryptedText = await this.encryptionService.encrypt(
          msg.text as string
        );
      }

      const isSelfChat =
        this.currentChat?.type === 'private' &&
        members.length === 2 &&
        members.every((m) => m === this.senderId);

      const expiresAt = await this.getExpiresAtForRoom(roomId);

      const messageToSave: Partial<IMessage> = {
        ...message,
        status: isSelfChat ? 'read' : 'sent',
        roomId,
        text: hasText ? msg.text : '',
        translations: translations || undefined,
        expiresAt: expiresAt || null,
        receipts: isSelfChat
          ? {
              read: {
                status: true,
                readBy: [{ userId: this.senderId!, timestamp: Date.now() }],
              },
              delivered: {
                status: true,
                deliveredTo: [
                  { userId: this.senderId!, timestamp: Date.now() },
                ],
              },
            }
          : {
              read: { status: false, readBy: [] },
              delivered: { status: false, deliveredTo: [] },
            },
      };

      try {
        // await this.chatPouchDb.addMessage(roomId, {
        //   ...messageToSave,
        //   isPending: true,
        //   syncStatus: 'pending',
        //   localTimestamp: Date.now(),
        // } as any);

        await this.chatPouchDb.addMessage(roomId, {
          ...messageToSave,
          ...(attachment
            ? {
                attachment: {
                  ...restAttachment,
                  localUrl: localUrl || '',
                },
              }
            : {}),
          isPending: true,
          syncStatus: 'pending',
          localTimestamp: Date.now(),
        } as any);

        console.log('✅ Message cached to PouchDB');
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB cache failed:', cacheErr);
      }

      // this is important not for delete
      // this.pushMsgToChat({
      //   ...messageToSave,
      //   isMe: true,
      //   isPending: !this.networkService.isOnline.value,
      // });

      if (!this.networkService.isOnline.value) {
        console.log('📴 Offline - message queued');

        await this.chatPouchDb.enqueueAction({
          type: 'send_message',
          conversationId: roomId,
          messageId: message.msgId as string,
          data: messageToSave,
          timestamp: Date.now(),
          userId: this.senderId as string,
        });

        return;
      }

      const meta: Partial<IChatMeta> = {
        type: this.currentChat?.type || 'private',
        lastmessageAt: message.timestamp as string,
        lastmessageType: attachment ? restAttachment.type : 'text',
        lastmessage: encryptedText || '',
      };

      // ✅ FRONTEND BLOCK CHECK (Check if receiver has blocked current user)
      let isBlockedByReceiver = false;
      const receiverId = msg.receiver_id;
       if (
        receiverId &&
        this.senderId &&
        receiverId !== this.senderId &&
        !roomId.startsWith('group_')
      ) {
        isBlockedByReceiver = await this.isUserBlockedBy(
          receiverId,
          this.senderId
        );
      }

      // ✅ USERCHATS UPDATE REMOVED: This is now handled by the backend socket sendMessage handler
      // to comply with .write: false security rules.


      let cdnUrl = '';
      let previewUrl: string | null = null;
      const hasAttachment =
        !!attachment && Object.keys(restAttachment || {}).length > 0;

      if (hasAttachment) {
        if (restAttachment.mediaId) {
          const res: any = await firstValueFrom(
            this.apiService.getDownloadUrl(restAttachment.mediaId)
          );
          cdnUrl = res?.status ? res.downloadUrl : '';
        }

        if (localUrl) {
          previewUrl = await this.fileSystemService.getFilePreview(localUrl);
        }
      }

      const messagesRef = ref(this.db, `chats/${roomId}/${message.msgId}`);
      const messageData = {
        ...messageToSave,
        ...(hasAttachment ? { attachment: { ...restAttachment, cdnUrl } } : {}),
        text: encryptedText || '',
        ...(translations ? { translations } : {}),
        blockedSend: isBlockedByReceiver,
      };

      // Keep private archive for migration/compatibility (deprecated path)
      const myId = this.senderId || this.authService.authData?.userId;
      const privateRef = rtdbRef(
        this.db,
        `private_messages/${myId}/${roomId}/${message.msgId}`
      );

      try {
        // Phase 3: Route ALL messages (text and attachments) through backend socket.
        await this.chatBackendSocket.sendMessage({
          roomId,
          msgId: message.msgId as string,
          content: encryptedText || '',
          type: hasAttachment && restAttachment.type ? restAttachment.type : ((message.type as string) || 'text'),
          replyToMsgId: (message.replyToMsgId as string) || '',
          timestamp: message.timestamp,
          attachment: hasAttachment ? { ...restAttachment, cdnUrl } : undefined,
          blockedSend: isBlockedByReceiver,
          translations,
          receiverId
        });
        console.log(`✅ Message saved to public chats via backend (blockedSend=${isBlockedByReceiver})`);

        // optional: keep private vault for compatibility for blocked messages
        if (isBlockedByReceiver && myId) {
          await rtdbSet(privateRef, messageData);
          console.log('✅ Also stored blocked message in private vault');
        }
      } catch (error: any) {
        const errorCode = error?.code?.toUpperCase() || error?.message?.toUpperCase() || '';

        if (errorCode.includes('FORBIDDEN') || errorCode.includes('PERMISSION_DENIED')) {
          console.warn(
            '🚫 Backend/Firebase denied write to chats; migrating to private vault only'
          );
          if (myId) {
            await rtdbSet(privateRef, messageData);
            console.log('✅ Message saved to private vault (fallback)');
          }
        } else {
          console.error('❌ Unexpected error sending message via socket:', error);
          throw error;
        }
      }

      try {
        await this.chatPouchDb.updateMessage(roomId, message.msgId as string, {
          ...(hasAttachment
            ? {
                attachment: {
                  ...restAttachment,
                  localUrl: previewUrl || localUrl || '',
                  cdnUrl,
                },
              }
            : {}),
          expiresAt: expiresAt || null,
          syncStatus: 'synced',
          isPending: false,
        });

        await this.chatPouchDb.updateConversationLastMessage(
          this.senderId as string,
          roomId,
          hasText ? msg.text || '' : '',
          hasAttachment ? restAttachment.type : 'text',
          Date.now()
        );

        console.log('✅ Message synced to Firebase and PouchDB updated');
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB update failed:', cacheErr);
      }

      if (!isSelfChat) {
        for (const member of members) {
          if (member === this.senderId) continue;

          // ✅ BLOCK CHECK: If receiver blocked me, do NOT mark as delivered
          if (isBlockedByReceiver) {
            console.log(
              `🚫 Skipping markAsDelivered for ${member} (user has blocked you)`
            );
            continue;
          }
          const isReceiverOnline = !!this.membersPresence.get(member)?.isOnline;
          if (isReceiverOnline) {
            this.markAsDelivered(message.msgId as string, member);
          }
        }
      }

      const uiMsg = {
        ...messageToSave,
        ...(hasAttachment && (localUrl || cdnUrl)
          ? {
              attachment: {
                ...restAttachment,
                localUrl: previewUrl || localUrl,
                cdnUrl,
              },
            }
          : {}),
        isMe: true,
        isPending: false,
      } as IMessage & { isPending: boolean };

      this.pushMsgToChat(uiMsg);

      const currentConvs = this._conversations$.value;
      const existingIndex = currentConvs.findIndex((c) => c.roomId === roomId);

      if (existingIndex >= 0) {
        // Update existing conversation
        const updated = [...currentConvs];
        updated[existingIndex] = {
          ...updated[existingIndex],
          lastMessage: hasText ? msg.text || '' : '',
          lastMessageType: (hasAttachment
            ? restAttachment.type
            : 'text') as any,
          lastMessageAt: new Date(Number(message.timestamp)),
          updatedAt: new Date(Date.now()),
        };
        this._conversations$.next(updated);
        console.log('✅ Updated conversation in local state');
      } else {
        // This is a new conversation - fetch and add it
        try {
          const newConv = await this.fetchPrivateConvDetails(roomId, {
            type: this.currentChat?.type || 'private',
            lastmessageAt: message.timestamp as string,
            lastmessageType: (hasAttachment
              ? restAttachment.type
              : 'text') as any,
            lastmessage: encryptedText || '',
            unreadCount: 0,
            isArchived: false,
            isPinned: false,
            isLocked: false,
          });

          const updated = [...currentConvs, newConv];
          this._conversations$.next(updated);
        } catch (convErr) {
          console.warn('⚠️ Failed to create conversation:', convErr);
        }
      }

      if (this._selectedMessageInfo) {
        this._selectedMessageInfo = null;
      }
    } catch (error) {
      console.error('❌ Error in sending message', error);

      try {
        await this.chatPouchDb.updateMessage(
          this.currentChat?.roomId as string,
          msg.msgId as string,
          {
            syncStatus: 'failed',
            isPending: false,
          }
        );

        await this.chatPouchDb.enqueueAction({
          type: 'send_message',
          conversationId: this.currentChat?.roomId as string,
          messageId: msg.msgId as string,
          data: msg,
          timestamp: Date.now(),
          userId: this.senderId as string,
          retryCount: 1,
        });
      } catch (queueErr) {
        console.error('Failed to queue action:', queueErr);
      }
    }
  }

  /**
   * Check if a user currently has a specific chat open
   * Uses Firebase presence to track active chats
   */
  private async hasUserOpenedChat(
    userId: string,
    roomId: string
  ): Promise<boolean> {
    try {
      const activeChatRef = rtdbRef(this.db, `activeChats/${userId}`);
      const snapshot = await rtdbGet(activeChatRef);

      if (!snapshot.exists()) {
        return false;
      }

      const activeRoomId = snapshot.val();
      return activeRoomId === roomId;
    } catch (error) {
      console.warn('Error checking active chat:', error);
      return false;
    }
  }

  async sendForwardMessage(
    forwardedMsg: any,
    receiverId: string,
    groupRoomId?: string
  ): Promise<void> {
    try {
      console.log('📤 Forwarding message to:', receiverId);
      console.log('📤 Forwarding message to:', forwardedMsg);

      const { attachment, translations, ...message } = forwardedMsg || {};
      const { localUrl, ...restAttachment } = attachment || {
        localUrl: undefined,
      };

      // Generate room ID: use groupRoomId override for groups/communities, else canonical private id
      const roomId = groupRoomId || this.getCanonicalRoomId(
        this.senderId as string,
        receiverId
      );
      const members = [this.senderId, receiverId];

      // Encrypt the text
      let encryptedText = '';
      if (forwardedMsg.text) {
        encryptedText = forwardedMsg.text.startsWith('ENC:')
          ? forwardedMsg.text
          : await this.encryptionService.encrypt(forwardedMsg.text);
      }

      // Generate new message ID and timestamp for forwarded message
      // const newMsgId = push(ref(this.db, `chats/${roomId}`)).key as string;
      const newMsgId = uuidv4();
      // const timestamp = new Date().toISOString();
      const timestamp = Date.now();

      const messageToSave: Partial<IMessage> = {
        msgId: newMsgId,
        roomId,
        // sender: this.senderId,
        sender_name: this.authService.authData?.name || '',
        receiver_id: receiverId,
        sender: this.senderId || '',
        sender_phone: this.authService.authData?.phone_number,
        timestamp,
        status: 'sent',
        isForwarded: true,
        type: forwardedMsg?.channel_invite
          ? 'channel_invite'
          : forwardedMsg?.type || 'text',
        text: forwardedMsg.text || '',
        translations: translations || null,
        channel_invite: forwardedMsg.channel_invite || null,
        receipts: {
          read: { status: false, readBy: [] },
          delivered: { status: false, deliveredTo: [] },
        },
      };

      console.log({ messageToSave });

      // Update chat meta for both members
      const meta: Partial<IChatMeta> = {
        type: 'private',
        lastmessageAt: timestamp,
        lastmessageType: forwardedMsg?.channel_invite
          ? 'channel_invite'
          : attachment
          ? restAttachment.type
          : 'text',
        lastmessage: encryptedText || '',
      };

      // ✅ FRONTEND BLOCK CHECK (Check if receiver has blocked current user)
      let isBlockedByReceiver = false;
      if (receiverId && this.senderId && receiverId !== this.senderId) {
        isBlockedByReceiver = await this.isUserBlockedBy(
          receiverId,
          this.senderId
        );
      }

      const isSelfChat =
        this.currentChat?.type === 'private' &&
        members.length === 2 &&
        members.every((m) => m === this.senderId);

      const loopMembers = (members as Array<string | null | undefined>).filter(
        (x): x is string => !!x
      );

      // ✅ USERCHATS UPDATE REMOVED: Handled by backend sendMessage


      let cdnUrl = '';
      let previewUrl: string | null = null;

      const hasAttachment =
        !!attachment && Object.keys(restAttachment || {}).length > 0;

      // Handle attachment if present
      if (hasAttachment) {
        if (restAttachment.mediaId) {
          const res: any = await firstValueFrom(
            this.apiService.getDownloadUrl(restAttachment.mediaId)
          );
          cdnUrl = res?.status ? res.downloadUrl : '';
        }

        if (localUrl) {
          previewUrl = await this.fileSystemService.getFilePreview(localUrl);
        }
      }

      // Save message to Firebase
      const messagesRef = rtdbRef(this.db, `chats/${roomId}/${newMsgId}`);
      const myId = this.senderId || this.authService.authData?.userId;
      const privateRef =
        myId && newMsgId
          ? rtdbRef(this.db, `private_messages/${myId}/${roomId}/${newMsgId}`)
          : null;

      const messageToUpload = {
        ...messageToSave,
        ...(hasAttachment ? { attachment: { ...restAttachment, cdnUrl } } : {}),
        text: encryptedText,
        ...(translations ? { translations } : {}),
        ...(messageToSave.channel_invite
          ? { channel_invite: messageToSave.channel_invite }
          : {}),
        blockedSend: isBlockedByReceiver,
      };

      try {
        // ✅ SECURE UPDATE: Use backend socket for forwarding messages
        await this.chatBackendSocket.sendMessage({
          roomId,
          msgId: newMsgId,
          content: encryptedText || '',
          type: messageToUpload.type || 'text',
          timestamp: messageToUpload.timestamp,
          attachment: hasAttachment ? { ...restAttachment, cdnUrl } : undefined,
          isForwarded: true,
          blockedSend: isBlockedByReceiver,
          translations,
          receiverId,
          channel_invite: messageToUpload.channel_invite
        });
        
        console.log(
          `✅ Forward message saved to public chats via backend (blockedSend=${isBlockedByReceiver})`
        );
      } catch (error: any) {
        console.error('❌ Failed to forward message via socket:', error);
        throw error;
      }

      // Mark as delivered if receiver is online and NOT blocked
      const isReceiverOnline = !!this.membersPresence.get(receiverId)?.isOnline;
      if (isReceiverOnline && !isBlockedByReceiver) {
        this.markAsDelivered(newMsgId, receiverId, roomId);
        console.log('✅ Mark delivered triggered (receiver online)');
      } else if (isBlockedByReceiver) {
        console.log(
          '🚫 Skipping markAsDelivered in forward (user has blocked you)'
        );
      }

      // ✅ Save forwarded message to PouchDB with isForwarded: true so it persists on reload
      try {
        await this.chatPouchDb.addMessage(roomId, {
          ...messageToSave,
          ...(hasAttachment ? { attachment: { ...restAttachment, cdnUrl } } : {}),
          isForwarded: true,
          isPending: false,
          syncStatus: 'synced',
          localTimestamp: Date.now(),
        } as any);
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB forward cache failed:', cacheErr);
      }

      await this.pushMessageToRoomChat(
        {
          ...messageToSave,
          ...(hasAttachment
            ? { attachment: { ...restAttachment, cdnUrl } }
            : {}),
        },
        roomId
      );
    } catch (error) {
      console.error('❌ Error in sending forward message:', error);
      throw error;
    }
  }

  pushMessageToRoomChat(msg: any, roomId: string) {
    try {
      // console.log(msg.attachment)
      const existing = new Map(this._messages$?.value || []);
      const currentMessages = existing.get(roomId as string);
      if (!currentMessages) return;
      const messageIdSet = new Set(currentMessages.map((m) => m.msgId));
      if (messageIdSet.has(msg.msgId)) return;
      currentMessages?.push({
        ...msg,
        attachment: msg?.attachment
          ? {
              ...msg.attachment,
              cdnUrl: msg.attachment.cdnUrl.replace(/[?#].*$/, ''),
            }
          : null,
        isMe: msg.sender === this.senderId,
      });
      existing.set(
        this.currentChat?.roomId as string,
        currentMessages as IMessage[]
      );

      console.log({ currentMessages });
      // return
      this._messages$.next(existing);
    } catch (error) {}
  }

  getUserLanguage(userId: string | number) {
    const url = `${this.baseUrl}/get-language/${userId}`;
    const headers = new HttpHeaders({
      Accept: 'application/json',
    });

    return this.http.get<any>(url, { headers }).pipe(
      map((res: any) => {
        // Expected format: { user_id: "52", language: "hi" }
        if (res && res.language) {
          return { language: res.language.trim() };
        }

        // Some APIs wrap data in a 'data' field
        if (res?.data?.language) {
          return { language: res.data.language.trim() };
        }

        // Fallback if nothing found
        console.warn('Unexpected response structure:', res);
        return null;
      }),
      catchError((err) => {
        console.error('❌ getUserLanguage API error:', err);
        return of(null);
      })
    );
  }

  // Pinned message operations
  async pinMessage(message: PinnedMessage) {
    try {
      if (!message.roomId || !message.messageId) return;

      await this.chatBackendSocket.pinMessage({
        roomId: message.roomId,
        msgId: message.messageId
      });

      // Optimistically update PouchDB for the isPinned flag
      try {
        const localMsg = await this.chatPouchDb.getMessageById(message.roomId, message.messageId);
        if (localMsg) {
          await this.chatPouchDb.updateMessage(message.roomId, message.messageId, { isPinned: true } as any);
        }
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB update failed:', cacheErr);
      }
    } catch (error) {
      console.error('❌ Error pinning message:', error);
      throw error;
    }
  }

  async unpinMessage(message: IMessage | any) {
    try {
      // Support both IMessage (msgId) and PinnedMessage (messageId)
      const msgId = message.msgId || message.messageId;
      const roomId = message.roomId;
      if (!roomId || !msgId) {
        console.warn('unpinMessage: missing roomId or msgId', message);
        return;
      }

      await this.chatBackendSocket.unpinMessage({ roomId, msgId });

      // Optimistically update isPinned flag in PouchDB
      try {
        const localMsg = await this.chatPouchDb.getMessageById(roomId, msgId);
        if (localMsg) {
          await this.chatPouchDb.updateMessage(roomId, msgId, { isPinned: false } as any);
        }
      } catch (cacheErr) {
        console.warn('⚠️ Failed to update pinned message cache:', cacheErr);
      }
    } catch (error) {
      console.error('❌ Error unpinning message:', error);
      throw error;
    }
  }

  async getPinnedMessages(roomId: string): Promise<PinnedMessage[]> {
    try {
      const pinRef = ref(this.db, `pinnedMessages/${roomId}`);
      const snapshot = await get(pinRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        // Handle both array and single object (backward compatibility)
        if (Array.isArray(data)) {
          return data;
        } else if (data.messageId) {
          return [data];
        }
      }
      return [];
    } catch (error) {
      console.error('Error getting pinned messages:', error);
      return [];
    }
  }

  /**
   * 🔥 NEW: Get visible pinned messages for a user (excluding deleted-for-me messages)
   * This is used for pin limit checks so deleted-for-me messages don't count
   */
  async getVisiblePinnedMessages(
    roomId: string,
    userId: string
  ): Promise<PinnedMessage[]> {
    try {
      // Get all pinned messages first
      const pinnedMessages = await this.getPinnedMessages(roomId);

      if (pinnedMessages.length === 0) {
        return [];
      }

      // Filter out messages that are deleted for the current user
      const visiblePinned: PinnedMessage[] = [];

      for (const pinned of pinnedMessages) {
        if (!pinned.messageId) continue;

        // Get full message details to check if deleted for this user
        const msgRef = ref(this.db, `chats/${roomId}/${pinned.messageId}`);
        const msgSnapshot = await get(msgRef);

        if (msgSnapshot.exists()) {
          const msgData = msgSnapshot.val();

          // Check if deleted for this user
          const isDeletedForMe =
            msgData.deletedFor?.everyone === true ||
            (Array.isArray(msgData.deletedFor?.users) &&
              msgData.deletedFor.users.includes(userId));

          if (!isDeletedForMe) {
            visiblePinned.push(pinned);
          } else {
            console.log(
              `📌 Pinned message ${pinned.messageId} is deleted for user ${userId}`
            );
          }
        } else {
          // Message doesn't exist, remove from visible
          console.log(
            `📌 Pinned message ${pinned.messageId} not found in messages`
          );
        }
      }

      return visiblePinned;
    } catch (error) {
      console.error('❌ Error getting visible pinned messages:', error);
      return [];
    }
  }

  async editMessage(
  roomId: string,
  msgId: string,
  newText: string
): Promise<void> {
  try {
    if (!roomId || !msgId || !newText.trim()) {
      throw new Error('editMessageInDb: Missing required parameters');
    }

    const encryptedText = await this.encryptionService.encrypt(newText.trim());

    await this.chatBackendSocket.editMessage({
      roomId,
      msgId,
      newText: encryptedText,
      // RTDB stores encrypted — frontend decrypts on read (no plainText needed)
    });

    // Update PouchDB with decrypted text (local cache always stores decrypted)
    try {
      await this.chatPouchDb.updateMessage(roomId, msgId, {
        text: newText.trim(),
        isEdit: true,
        editedAt: Date.now(),
        syncStatus: 'synced',
      } as any);
      console.log('✅ Message edit optimistically cached to PouchDB');
    } catch (cacheErr) {
      console.warn('⚠️ PouchDB update failed:', cacheErr);
    }

    console.log(`✅ Message ${msgId} updated successfully in ${roomId} via backend`);
  } catch (err) {
    console.error('❌ editMessage error:', err);
    throw err;
  }
}

  // Group and community operations

  // async createGroup({
  //   groupId,
  //   groupName,
  //   members,
  // }: {
  //   groupId: string;
  //   groupName: string;
  //   members: Array<{ userId: string; username: string; phoneNumber?: string }>;
  // }) {
  //   try {
  //     if (!this.senderId) throw new Error('createGroup: senderId not set');

  //     this.senderName = this.authService.authData?.name || '';
  //     const now = Date.now();

  //     // 🔹 Build members object for RTDB
  //     const membersObj: Record<string, IGroupMember> = {};
  //     const memberIds = members.map((m) => m.userId);

  //     for (const m of members) {
  //       membersObj[m.userId] = {
  //         username: m.username,
  //         phoneNumber: m.phoneNumber ?? '',
  //         isActive: true,
  //       };
  //     }

  //     // Add creator
  //     membersObj[this.senderId] = {
  //       username: this.senderName,
  //       phoneNumber: this.authService.authData?.phone_number as string,
  //       isActive: true,
  //     };

  //     // 🔹 Group data for Firebase
  //     // 🔹 Phase 3: Route group creation through the backend socket securely
  //     await this.chatBackendSocket.createGroup({
  //       groupId,
  //       name: groupName,
  //       description: 'Hey I am using Telldemm',
  //       members: memberIds
  //     });

  //     // =====================================================
  //     // ✅ SAVE GROUP CONVERSATION TO POUCHDB (NOT SQLITE)
  //     // =====================================================

  //     const conversation: IConversation = {
  //       roomId: groupId,
  //       title: groupName,
  //       type: 'group',
  //       avatar: '',
  //       members: memberIds,
  //       adminIds: [this.senderId],
  //       createdAt: new Date(now),
  //       updatedAt: new Date(now),
  //       lastMessage: '',
  //       lastMessageType: 'text',
  //       lastMessageAt: new Date(now),
  //       unreadCount: 0,
  //       isArchived: false,
  //       isPinned: false,
  //       isLocked: false,
  //       isMyself: true,
  //     };

  //     // ✅ Save to PouchDB
  //     await this.chatPouchDb.saveConversation(conversation as any, true);

  //     // ✅ Update conversation list
  //     await this.chatPouchDb.updateConversationField(
  //       this.senderId,
  //       groupId,
  //       conversation
  //     );

  //     // 🔹 Save as single conversation doc
  //     await this.chatPouchDb.saveConversation(conversation, true);

  //     // 🔹 Also update conversations list for current user
  //     await this.chatPouchDb.updateConversationField(
  //       this.senderId,
  //       groupId,
  //       conversation
  //     );

  //     console.log(
  //       `✅ Group "${groupName}" created & cached in PouchDB with ${members.length} members.`
  //     );
  //   } catch (err) {
  //     console.error('❌ Error creating group:', err);
  //     throw err;
  //   }
  // }

  async createGroup({
  groupId,
  groupName,
  members,
}: {
  groupId: string;
  groupName: string;
  members: Array<{ userId: string; username: string; phoneNumber?: string }>;
}) {
  try {
    if (!this.senderId) throw new Error('createGroup: senderId not set');

    this.senderName = this.authService.authData?.name || '';
    const now = Date.now();

    // 🔹 Build members object for RTDB
    const membersObj: Record<string, IGroupMember> = {};
    const memberIds = members.map((m) => m.userId);

    for (const m of members) {
      membersObj[m.userId] = {
        username: m.username,
        phoneNumber: m.phoneNumber ?? '',
        isActive: true,
      };
    }

    // Add creator
    membersObj[this.senderId] = {
      username: this.senderName,
      phoneNumber: this.authService.authData?.phone_number as string,
      isActive: true,
    };

    // 🔹 Group data for Firebase (IGroup type — same as createCommunity pattern)
    const groupDataForRTDB: IGroup = {
      roomId: groupId,
      title: groupName,
      description: 'Hey I am using Telldemm',
      adminIds: [this.senderId],
      createdBy: this.senderId,
      createdByName: this.senderName,
      createdAt: now,
      members: membersObj,
      type: 'group',
      isArchived: false,
      isPinned: false,
      isLocked: false,
    };

    // 🔹 Chat meta for each member
    const chatMeta: IChatMeta = {
      type: 'group',
      lastmessageAt: now,
      lastmessageType: 'text',
      lastmessage: '',
      unreadCount: 0,
      isArchived: false,
      isPinned: false,
      isLocked: false,
    };

    // 🔹 Build batch updates object (same as createCommunity)
    const updates: Record<string, any> = {};
    updates[`/groups/${groupId}`] = groupDataForRTDB;

    for (const memberId of Object.keys(membersObj)) {
      updates[`/userchats/${memberId}/${groupId}`] = chatMeta;
    }

    // 🔹 Phase 3: Route group creation through the backend socket securely
    await this.chatBackendSocket.applySecuredBatchUpdates({ updates });

    // =====================================================
    // ✅ SAVE GROUP CONVERSATION TO POUCHDB
    // =====================================================
    const conversation: IConversation = {
      roomId: groupId,
      title: groupName,
      type: 'group',
      avatar: '',
      members: memberIds,
      adminIds: [this.senderId],
      createdAt: new Date(now),
      updatedAt: new Date(now),
      lastMessage: '',
      lastMessageType: 'text',
      lastMessageAt: new Date(now),
      unreadCount: 0,
      isArchived: false,
      isPinned: false,
      isLocked: false,
      isMyself: true,
    };

    await this.chatPouchDb.saveConversation(conversation as any, true);
    await this.chatPouchDb.updateConversationField(this.senderId, groupId, conversation);
    // await this.chatPouchDb.saveConversation(conversation, true);
    // await this.chatPouchDb.updateConversationField(this.senderId, groupId, conversation);

    console.log(`✅ Group "${groupName}" created & cached in PouchDB with ${members.length} members.`);
  } catch (err) {
    console.error('❌ Error creating group:', err);
    throw err;
  }
}

  async saveGroupVisibility(
    groupId: string,
    visibility: 'Visible' | 'Hidden'
  ): Promise<void> {
    try {
      await this.chatBackendSocket.setGroupVisibility({ groupId, visibility });
      console.log(`✅ Group visibility saved: ${visibility}`);
    } catch (err) {
      console.warn('⚠️ saveGroupVisibility failed (non-fatal):', err);
    }
  }

  //update group name from userabout page
  async updateGroupName(groupId: string, groupName: string): Promise<void> {
    const trimmedName = groupName.trim();
    if (!groupId || !trimmedName) {
      throw new Error('Invalid groupId or groupName');
    }

    await this.chatBackendSocket.updateGroupMetadata({
      groupId,
      title: trimmedName
    });
  }

  async updateGroupDescription(groupId: string, description: string): Promise<void> {
    if (!groupId) throw new Error('Invalid groupId');
    
    await this.chatBackendSocket.updateGroupMetadata({
      groupId,
      description: description || ''
    });
  }
  async updateBackendGroupId(groupId: string, backendGroupId: string) {
    await this.chatBackendSocket.updateGroupMetadata({
      groupId,
      backendGroupId
    });
  }

  async getGroupAdminIds(groupId: string): Promise<string[]> {
    try {
      const adminIdsRef = ref(this.db, `groups/${groupId}/adminIds`);
      const snapshot = await get(adminIdsRef);
      if (!snapshot.exists()) return [];
      const val = snapshot.val();
      // Firebase may store adminIds as an array OR as an object { userId: true }
      if (Array.isArray(val)) return val.map(String);
      if (val && typeof val === 'object') return Object.keys(val);
      return [];
    } catch (error) {
      console.error('Error fetching admin IDs:', error);
      return [];
    }
  }

  /**
   * Check if a user is admin in a group
   */
  async isUserAdmin(groupId: string, userId: string): Promise<boolean> {
    try {
      const adminIds = await this.getGroupAdminIds(groupId);
      return adminIds.includes(String(userId));
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  /**
   * Make a user admin in a group
   */
  async makeGroupAdmin(groupId: string, userId: string): Promise<boolean> {
    try {
      const db = getDatabase();
      const adminIdsRef = ref(db, `groups/${groupId}/adminIds`);

      // Get current admin IDs
      const snapshot = await get(adminIdsRef);
      let adminIds = snapshot.exists() ? snapshot.val() : {};

      // Check if user is already an admin
      const adminIdsArray = Object.values(adminIds).map((id) => String(id));
      if (adminIdsArray.includes(String(userId))) {
        console.log('User is already an admin');
        return true;
      }

      // Add new admin ID
      const newIndex = Object.keys(adminIds).length;
      adminIds[newIndex] = String(userId);

      // ✅ SECURE UPDATE: Use socket proxy to update admin list
      await this.applySecuredBatchUpdates({
        [`groups/${groupId}/adminIds`]: adminIds,
      });

      // 🔥 NEW: Update PouchDB
      try {
        await this.chatPouchDb.updateGroupAdmins(
          groupId,
          Object.values(adminIds).map((id) => String(id))
        );
        console.log('✅ Group admins cached to PouchDB');
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB update failed:', cacheErr);
      }

      console.log(`✅ Successfully made user ${userId} a group admin`);
      return true;
    } catch (error) {
      console.error('Error making group admin:', error);
      return false;
    }
  }

  async blockUserByUserId(targetUserId: string): Promise<void> {
    await this.chatBackendSocket.blockUser(targetUserId);
  }

  async unblockUserByUserId(targetUserId: string): Promise<void> {
    await this.chatBackendSocket.unblockUser(targetUserId);
  }

  async clearChatForUser(roomId?: string): Promise<void> {
    const targetRoomId = roomId || this.currentChat?.roomId;
    if (!targetRoomId) throw new Error('Room ID not found');

    // 1. Backend: soft-delete all messages for this user
    await this.chatBackendSocket.clearChat(targetRoomId);

    // 2. Update userchats lastmessage preview in RTDB via backend
    if (this.senderId) {
      const now = Date.now();
      try {
        await this.applySecuredBatchUpdates({
          [`userchats/${this.senderId}/${targetRoomId}/lastmessage`]: 'Messages was deleted',
          [`userchats/${this.senderId}/${targetRoomId}/lastmessageAt`]: now,
          [`userchats/${this.senderId}/${targetRoomId}/lastmessageType`]: 'text',
        });
      } catch (err) {
        console.warn('RTDB userchats update failed during clearChatForUser:', err);
      }
    }

    // 3. Clear local PouchDB cache
    try {
      await this.chatPouchDb.deleteAllMessages(targetRoomId);
      if (this.senderId) {
        await this.chatPouchDb.updateConversationField(this.senderId, targetRoomId, {
          lastMessage: 'Messages was deleted',
          lastMessageType: 'text',
          lastMessageAt: new Date(),
          unreadCount: 0,
        });
      }
    } catch (err) {
      console.warn('PouchDB clear failed during clearChatForUser:', err);
    }

    // 4. Update UI Observables
    const messageMap = new Map(this._messages$.value);
    messageMap.set(targetRoomId, []);
    this._messages$.next(messageMap);

    const currentConvs = this._conversations$.value;
    const idx = currentConvs.findIndex(c => c.roomId === targetRoomId);
    if (idx >= 0) {
      const updated = [...currentConvs];
      updated[idx] = {
        ...updated[idx],
        lastMessage: 'Messages was deleted',
        lastMessageAt: new Date(),
        unreadCount: 0,
      };
      this._conversations$.next(updated);
    }
  }

  async leaveGroup(groupId: string): Promise<void> {
    const userId = this.authService.authData?.userId;
    if (!userId) throw new Error('User ID not found');
    await this.chatBackendSocket.removeGroupMember({ groupId, targetUserId: userId });
  }



  /**
   * Remove admin privileges from a user
   */
  async dismissGroupAdmin(groupId: string, userId: string): Promise<boolean> {
    try {
      const db = getDatabase();
      const adminIdsRef = ref(db, `groups/${groupId}/adminIds`);

      // Get current admin IDs
      const snapshot = await get(adminIdsRef);
      if (!snapshot.exists()) {
        console.log('No admin IDs found');
        return false;
      }

      const adminIds = snapshot.val();

      // Convert to array and filter out the user
      const adminIdsArray = Object.values(adminIds).map((id) => String(id));
      const updatedArray = adminIdsArray.filter(
        (id) => String(id) !== String(userId)
      );

      // Check if user was actually an admin
      if (adminIdsArray.length === updatedArray.length) {
        console.log('User was not an admin');
        return true;
      }

      // Convert back to object format for Firebase
      const updatedAdminIds = updatedArray.reduce((acc, id, index) => {
        acc[index] = id;
        return acc;
      }, {} as any);

      // Update Firebase
      // ✅ SECURE UPDATE: Use socket proxy to update admin list
      await this.applySecuredBatchUpdates({
        [`groups/${groupId}/adminIds`]: updatedAdminIds,
      });

      // 🔥 NEW: Update PouchDB
      try {
        await this.chatPouchDb.updateGroupAdmins(groupId, updatedArray);
        console.log('✅ Group admins updated in PouchDB');
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB update failed:', cacheErr);
      }

      console.log(`✅ Successfully dismissed user ${userId} as group admin`);
      return true;
    } catch (error) {
      console.error('❌ Error dismissing group admin:', error);
      return false;
    }
  }

  /**
   * Get admin check details for action sheet
   */
  async getAdminCheckDetails(
    groupId: string,
    currentUserId: string,
    targetUserId: string
  ) {
    try {
      const adminIds = await this.getGroupAdminIds(groupId);

      return {
        adminIds,
        isCurrentUserAdmin: adminIds.includes(String(currentUserId)),
        isTargetUserAdmin: adminIds.includes(String(targetUserId)),
        isSelf: String(targetUserId) === String(currentUserId),
      };
    } catch (error) {
      console.error('Error getting admin check details:', error);
      return {
        adminIds: [],
        isCurrentUserAdmin: false,
        isTargetUserAdmin: false,
        isSelf: false,
      };
    }
  }

  async createCommunity({
    communityId,
    communityName,
    description,
    createdBy,
    avatar = '',
    privacy = 'invite_only',
  }: {
    communityId: string;
    communityName: string;
    description?: string;
    createdBy: string;
    avatar?: string;
    privacy?: 'public' | 'invite_only';
  }): Promise<{
    communityId: string;
    announcementGroupId: string;
    generalGroupId: string;
  }> {
    try {
      if (!createdBy) {
        throw new Error('createCommunity: createdBy (userId) is required');
      }

      const now = Date.now();
      const announcementGroupId = `${communityId}_announcement`;
      const generalGroupId = `${communityId}_general`;

      // =====================================================
      // 🔹 Fetch creator profile
      // =====================================================
      let creatorProfile: { username?: string; phoneNumber?: string } = {};

      try {
        const user = this.currentUsers.find((u) => u.userId === createdBy);
        if (user) {
          creatorProfile.username = user.username || '';
          creatorProfile.phoneNumber = user.phoneNumber || '';
        } else {
          const userSnap = await get(ref(this.db, `users/${createdBy}`));
          if (userSnap.exists()) {
            const u = userSnap.val();
            creatorProfile.username = u.name || u.username || '';
            creatorProfile.phoneNumber = u.phone_number || u.phoneNumber || '';
          }
        }
      } catch (err) {
        console.warn('Creator profile fetch failed, using fallback', err);
        creatorProfile.username = this.authService.authData?.name || 'User';
        creatorProfile.phoneNumber =
          this.authService.authData?.phone_number || '';
      }

      // =====================================================
      // 🔹 Member structures
      // =====================================================
      const communityMemberDetails: ICommunityMember = {
        username: creatorProfile.username || '',
        phoneNumber: creatorProfile.phoneNumber || '',
        isActive: true,
        joinedAt: now,
        role: 'admin',
      };

      const groupMemberDetails: IGroupMember = {
        username: creatorProfile.username || '',
        phoneNumber: creatorProfile.phoneNumber || '',
        isActive: true,
      };

      // =====================================================
      // 🔹 Firebase data structures
      // =====================================================
      const communityData: ICommunity = {
        roomId: communityId,
        title: communityName,
        description: description || 'Hey, I am using Telldemm',
        avatar,
        adminIds: [],
        createdBy,
        ownerId: createdBy,
        createdAt: now,
        members: {
          [createdBy]: communityMemberDetails,
        },
        groups: {
          [announcementGroupId]: true,
          [generalGroupId]: true,
        },
        type: 'community',
        isArchived: false,
        isPinned: false,
        isLocked: false,
        privacy,
        settings: {
          announcementPosting: 'adminsOnly',
          whoCanAddMembers: 'everyone',
          whoCanAddGroups: 'only_admins',
        },
      };

      const announcementGroupData: IGroup = {
        roomId: announcementGroupId,
        title: 'Announcements',
        description: 'Important announcements for the community',
        avatar: '',
        adminIds: [createdBy],
        createdBy,
        createdByName: this.senderName,
        createdAt: now,
        members: {
          [createdBy]: groupMemberDetails,
        },
        type: 'group',
        communityId,
        isArchived: false,
        isPinned: false,
        isLocked: false,
      };

      const generalGroupData: IGroup = {
        roomId: generalGroupId,
        title: 'General',
        description: 'General discussion for community members',
        avatar: '',
        adminIds: [createdBy],
        createdBy,
        createdByName: this.senderName,
        createdAt: now,
        members: {
          [createdBy]: groupMemberDetails,
        },
        type: 'group',
        communityId,
        isArchived: false,
        isPinned: false,
        isLocked: false,
      };

      // =====================================================
      // 🔹 userchats metadata
      // =====================================================
      const communityChatMeta: ICommunityChatMeta = {
        type: 'community',
        lastmessageAt: now,
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        communityGroups: [announcementGroupId, generalGroupId],
      };

      const groupChatMeta: IChatMeta = {
        type: 'group',
        lastmessageAt: now,
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
      };

      // =====================================================
      // 🔹 Atomic Firebase update
      // =====================================================
      const updates: Record<string, any> = {};

      updates[`/communities/${communityId}`] = communityData;
      updates[`/groups/${announcementGroupId}`] = announcementGroupData;
      updates[`/groups/${generalGroupId}`] = generalGroupData;

      updates[`/userchats/${createdBy}/${communityId}`] = communityChatMeta;
      updates[`/userchats/${createdBy}/${announcementGroupId}`] = groupChatMeta;
      updates[`/userchats/${createdBy}/${generalGroupId}`] = groupChatMeta;

      updates[
        `/usersInCommunity/${createdBy}/joinedCommunities/${communityId}`
      ] = true;

      await this.chatBackendSocket.applySecuredBatchUpdates({ updates });

      // =====================================================
      // ✅ SAVE LOCAL CONVERSATIONS TO POUCHDB
      // =====================================================
      const communityConvo: IConversation = {
        roomId: communityId,
        title: communityName,
        type: 'community',
        avatar,
        members: [createdBy],
        adminIds: [createdBy],
        createdAt: new Date(now),
        updatedAt: new Date(now),
        lastMessage: '',
        lastMessageType: 'text',
        lastMessageAt: new Date(now),
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        isMyself: true,
      };

      const announcementConvo: IConversation = {
        roomId: announcementGroupId,
        title: 'Announcements',
        type: 'group',
        communityId,
        avatar: '',
        members: [createdBy],
        adminIds: [createdBy],
        createdAt: new Date(now),
        updatedAt: new Date(now),
        lastMessage: '',
        lastMessageType: 'text',
        lastMessageAt: new Date(now),
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        isMyself: true,
      };

      const generalConvo: IConversation = {
        roomId: generalGroupId,
        title: 'General',
        type: 'group',
        communityId,
        avatar: '',
        members: [createdBy],
        adminIds: [createdBy],
        createdAt: new Date(now),
        updatedAt: new Date(now),
        lastMessage: '',
        lastMessageType: 'text',
        lastMessageAt: new Date(now),
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        isMyself: true,
      };

      await this.chatPouchDb.saveConversation(communityConvo as any, true);
      await this.chatPouchDb.saveConversation(announcementConvo as any, true);
      await this.chatPouchDb.saveConversation(generalConvo as any, true);

      await this.chatPouchDb.updateConversationField(
        createdBy,
        communityId,
        communityConvo
      );
      await this.chatPouchDb.updateConversationField(
        createdBy,
        announcementGroupId,
        announcementConvo
      );
      await this.chatPouchDb.updateConversationField(
        createdBy,
        generalGroupId,
        generalConvo
      );

      console.log(
        `✅ Community "${communityName}" created & cached in PouchDB`
      );

      return {
        communityId,
        announcementGroupId,
        generalGroupId,
      };
    } catch (err) {
      console.error('Error creating community:', err);
      throw err;
    }
  }

  async getCommunityDetails(
    communityId: string,
    onUpdate?: (data: any) => void
  ): Promise<any | null> {
    try {
      if (!communityId) return null;

      const communityRef = rtdbRef(this.db, `communities/${communityId}`);

      // ---- 1) GET initial snapshot once ----
      const snapshot = await rtdbGet(communityRef);

      if (!snapshot.exists()) {
        console.warn(`Community ${communityId} not found`);
        return null;
      }

      const initialData = snapshot.val();

      // ---- 2) LISTEN for updates if callback provided ----
      if (onUpdate) {
        onValue(communityRef, (snap) => {
          if (snap.exists()) {
            onUpdate(snap.val());
          }
        });
      }

      return initialData;
    } catch (error) {
      console.error('getCommunityDetails error:', error);
      return null;
    }
  }

  /**
   * Get all groups in a community with full details
   */
  async getCommunityGroupsWithDetails(
    communityId: string,
    currentUserId?: string
  ): Promise<{
    announcementGroup: any | null;
    generalGroup: any | null;
    otherGroups: any[];
    memberGroups: any[];
    availableGroups: any[];
  }> {
    try {
      if (!communityId) {
        return {
          announcementGroup: null,
          generalGroup: null,
          otherGroups: [],
          memberGroups: [],
          availableGroups: [],
        };
      }

      // Get community data to fetch group IDs
      const communityRef = rtdbRef(this.db, `communities/${communityId}`);
      const commSnap = await rtdbGet(communityRef);

      if (!commSnap.exists()) {
        return {
          announcementGroup: null,
          generalGroup: null,
          otherGroups: [],
          memberGroups: [],
          availableGroups: [],
        };
      }

      const communityData = commSnap.val();
      const groupsObj = communityData.groups || {};
      const groupIds = Object.keys(groupsObj);

      let announcementGroup: any = null;
      let generalGroup: any = null;
      const otherGroups: any[] = [];
      const memberGroups: any[] = [];
      const availableGroups: any[] = [];

      // Fetch each group's details
      for (const groupId of groupIds) {
        try {
          const groupRef = rtdbRef(this.db, `groups/${groupId}`);
          const groupSnap = await rtdbGet(groupRef);

          if (!groupSnap.exists()) continue;

          const groupData = groupSnap.val();

          const groupObj = {
            id: groupId,
            roomId: groupId,
            name: groupData.title || groupData.name || 'Unnamed group',
            title: groupData.title || groupData.name || 'Unnamed group',
            type: groupData.type || 'group',
            description: groupData.description || '',
            avatar: groupData.avatar || '',
            membersCount: groupData.members
              ? Object.keys(groupData.members).length
              : 0,
            members: groupData.members || {},
            createdBy: groupData.createdBy || '',
            createdAt: groupData.createdAt || Date.now(),
            adminIds: groupData.adminIds || [],
            communityId: groupData.communityId || communityId,
          };

          // Check if current user is a member
          const isMember =
            currentUserId && groupObj.members
              ? Object.prototype.hasOwnProperty.call(
                  groupObj.members,
                  currentUserId
                )
              : false;

          // Categorize groups
          if (groupData.title === 'Announcements') {
            announcementGroup = groupObj;
          } else if (groupData.title === 'General') {
            generalGroup = groupObj;
          } else {
            otherGroups.push(groupObj);

            if (isMember) {
              memberGroups.push(groupObj);
            } else {
              availableGroups.push(groupObj);
            }
          }
        } catch (err) {
          console.error(`Error fetching group ${groupId}:`, err);
        }
      }

      // Sort groups alphabetically
      otherGroups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      memberGroups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      availableGroups.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );

      return {
        announcementGroup,
        generalGroup,
        otherGroups,
        memberGroups,
        availableGroups,
      };
    } catch (error) {
      console.error('getCommunityGroupsWithDetails error:', error);
      return {
        announcementGroup: null,
        generalGroup: null,
        otherGroups: [],
        memberGroups: [],
        availableGroups: [],
      };
    }
  }

  /**
   * Join a group in community
   */
  async joinCommunityGroup(
    groupId: string,
    userId: string,
    userData: {
      username: string;
      phoneNumber: string;
    }
  ): Promise<{ success: boolean; message: string; groupName?: string }> {
    try {
      if (!groupId || !userId) {
        return { success: false, message: 'Invalid group ID or user ID' };
      }

      const groupRef = rtdbRef(this.db, `groups/${groupId}`);
      const groupSnap = await rtdbGet(groupRef);

      if (!groupSnap.exists()) {
        return { success: false, message: 'Group not found' };
      }

      const groupData = groupSnap.val();

      // Check if already a member
      if (
        groupData.members &&
        Object.prototype.hasOwnProperty.call(groupData.members, userId)
      ) {
        return {
          success: false,
          message: 'You are already a member',
          groupName: groupData.title || groupData.name,
        };
      }

      // Prepare member details
      const memberDetails = {
        username: userData.username || '',
        phoneNumber: userData.phoneNumber || '',
        isActive: true,
      };

      // 🔹 Self-join: write member entry + userchats via secured batch (no admin needed)
      // Also remove from pastMembers if the user previously left this group
      const updates: Record<string, any> = {
        [`groups/${groupId}/members/${userId}`]: {
          username: userData.username || '',
          phoneNumber: userData.phoneNumber || '',
          isActive: true,
        },
        [`userchats/${userId}/${groupId}`]: {
          type: 'group',
          lastmessageAt: Date.now(),
          lastmessageType: 'text',
          lastmessage: groupData.lastMessage || '',
          unreadCount: 0,
          isArchived: false,
          isPinned: false,
          isLocked: false,
        },
      };

      // If user is in pastmembers, remove them (Firebase key is lowercase 'pastmembers')
      if (groupData.pastmembers && Object.prototype.hasOwnProperty.call(groupData.pastmembers, userId)) {
        updates[`groups/${groupId}/pastmembers/${userId}`] = null;
      }

      await this.applySecuredBatchUpdates(updates);

      // Also join the socket room so real-time events arrive immediately
      try {
        await this.chatBackendSocket.joinRoom(groupId);
      } catch (roomErr) {
        console.warn('joinRoom after group join failed (non-fatal):', roomErr);
      }

      return {
        success: true,
        message: 'Successfully joined group',
        groupName: groupData.title || groupData.name,
      };
    } catch (error) {
      console.error('joinCommunityGroup error:', error);
      return {
        success: false,
        message: 'Failed to join group. Please try again.',
      };
    }
  }

  /**
   * Leave a community group
   */
  async leaveCommunityGroup(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!groupId || !userId) {
        return { success: false, message: 'Invalid group ID or user ID' };
      }

      const groupRef = rtdbRef(this.db, `groups/${groupId}`);
      const groupSnap = await rtdbGet(groupRef);

      if (!groupSnap.exists()) {
        return { success: false, message: 'Group not found' };
      }

      const groupData = groupSnap.val();
      const memberData = groupData.members?.[userId];

      if (!memberData) {
        return {
          success: false,
          message: 'You are not a member of this group',
        };
      }

      // 🔹 Phase 3: Route group leave securely through backend
      await this.chatBackendSocket.removeGroupMember({
        groupId,
        targetUserId: userId
      });

      return { success: true, message: 'Successfully left group' };
    } catch (error) {
      console.error('leaveCommunityGroup error:', error);
      return {
        success: false,
        message: 'Failed to leave group. Please try again.',
      };
    }
  }

  async deactivateCommunity(
    communityId: string,
    ownerId: string
  ): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      console.log(`🔴 Starting community deactivation: ${communityId}`);

      if (!communityId || !ownerId) {
        return {
          success: false,
          message: 'Invalid community ID or owner ID',
        };
      }

      const db = getDatabase();
      const communityRef = ref(db, `communities/${communityId}`);
      const communitySnap = await get(communityRef);

      if (!communitySnap.exists()) {
        return {
          success: false,
          message: 'Community not found',
        };
      }

      const communityData = communitySnap.val();

      // ❌ Only owner can deactivate
      const currentOwnerId = communityData.ownerId || communityData.createdBy;
      if (currentOwnerId !== ownerId) {
        return {
          success: false,
          message: 'Only the owner can deactivate the community',
        };
      }

      const updates: Record<string, any> = {};

      /* ---------------------------------------------------
       * 1️⃣ Get all members, groups, and system groups
       * --------------------------------------------------- */
      const members = communityData.members || {};
      const memberIds = Object.keys(members);

      const allGroups = communityData.groups || {};
      const allGroupIds = Object.keys(allGroups);

      const announcementGroupId = `${communityId}_announcement`;
      const generalGroupId = `${communityId}_general`;

      console.log(`📊 Community has ${memberIds.length} members`);
      console.log(`📊 Community has ${allGroupIds.length} groups`);

      /* ---------------------------------------------------
       * 2️⃣ Remove community from ALL users' userchats
       * --------------------------------------------------- */
      for (const userId of memberIds) {
        updates[`userchats/${userId}/${communityId}`] = null;
      }
      console.log(
        `✅ Step 2: Removed community from ${memberIds.length} users' userchats`
      );

      /* ---------------------------------------------------
       * 3️⃣ Get announcement group members and remove
       * --------------------------------------------------- */
      const announcementGroupRef = ref(db, `groups/${announcementGroupId}`);
      const announcementSnap = await get(announcementGroupRef);

      if (announcementSnap.exists()) {
        const announcementData = announcementSnap.val();
        const announcementMembers = announcementData.members || {};
        const announcementMemberIds = Object.keys(announcementMembers);

        // Remove announcement group from all members' userchats
        for (const userId of announcementMemberIds) {
          updates[`userchats/${userId}/${announcementGroupId}`] = null;
        }

        // Delete announcement group completely
        updates[`groups/${announcementGroupId}`] = null;

        console.log(
          `✅ Step 3: Removed announcement group from ${announcementMemberIds.length} users`
        );
      }

      /* ---------------------------------------------------
       * 4️⃣ Get general group members and remove
       * --------------------------------------------------- */
      const generalGroupRef = ref(db, `groups/${generalGroupId}`);
      const generalSnap = await get(generalGroupRef);

      if (generalSnap.exists()) {
        const generalData = generalSnap.val();
        const generalMembers = generalData.members || {};
        const generalMemberIds = Object.keys(generalMembers);

        // Remove general group from all members' userchats
        for (const userId of generalMemberIds) {
          updates[`userchats/${userId}/${generalGroupId}`] = null;
        }

        // Delete general group completely
        updates[`groups/${generalGroupId}`] = null;

        console.log(
          `✅ Step 4: Removed general group from ${generalMemberIds.length} users`
        );
      }

      /* ---------------------------------------------------
       * 5️⃣ Unlink ALL groups from community (remove communityId)
       * --------------------------------------------------- */
      for (const groupId of allGroupIds) {
        // Skip announcement and general (already deleted)
        if (groupId === announcementGroupId || groupId === generalGroupId) {
          continue;
        }

        // Remove communityId from group
        updates[`groups/${groupId}/communityId`] = null;
      }
      console.log(
        `✅ Step 5: Unlinked ${allGroupIds.length - 2} groups from community`
      );

      /* ---------------------------------------------------
       * 6️⃣ Mark community as deactivated (for audit/backup)
       * OR delete community completely (choose one)
       * --------------------------------------------------- */

      // OPTION A: Soft delete (mark as deactivated, keep data)
      updates[`communities/${communityId}/isDeactivated`] = true;
      updates[`communities/${communityId}/deactivatedAt`] = Date.now();
      updates[`communities/${communityId}/deactivatedBy`] = ownerId;
      updates[`communities/${communityId}/members`] = null;
      updates[`communities/${communityId}/groups`] = null;

      // OPTION B: Hard delete (completely remove community)
      // Uncomment below and comment out Option A if you want hard delete
      // updates[`communities/${communityId}`] = null;

      console.log(`✅ Step 6: Marked community as deactivated`);

      /* ---------------------------------------------------
       * 7️⃣ Remove from usersInCommunity index (for all members)
       * --------------------------------------------------- */
      for (const userId of memberIds) {
        updates[`usersInCommunity/${userId}/joinedCommunities/${communityId}`] =
          null;
      }
      console.log(`✅ Step 7: Cleaned up usersInCommunity index`);

      /* ---------------------------------------------------
       * 8️⃣ Apply all updates atomically
       * --------------------------------------------------- */
      await this.applySecuredBatchUpdates(updates);

      console.log(`✅ Community ${communityId} deactivated successfully`);

      return {
        success: true,
        message: 'Community deactivated successfully',
        details: {
          communityId,
          membersRemoved: memberIds.length,
          groupsUnlinked: allGroupIds.length - 2, // Exclude announcement & general
          systemGroupsDeleted: 2, // Announcement + General
        },
      };
    } catch (error) {
      console.error('❌ Error deactivating community:', error);
      return {
        success: false,
        message: 'Failed to deactivate community. Please try again.',
      };
    }
  }

  /**
   * ✅ HELPER: Delete community chat from local state
   * Call this after successful deactivation to update UI
   */
  public removeCommunityFromLocalState(communityId: string): void {
    try {
      // Remove from conversations array
      const existingConvs = this._conversations$.value.filter(
        (conv) => conv.roomId !== communityId
      );
      this._conversations$.next(existingConvs);

      // Clear messages from local map
      const messageMap = new Map(this._messages$.value);
      messageMap.delete(communityId);
      this._messages$.next(messageMap);

      console.log(`✅ Removed community ${communityId} from local state`);
    } catch (error) {
      console.error('Error removing community from local state:', error);
    }
  }

  async exitCommunity(
    communityId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log('exitCommunity →', communityId, userId);

      if (!communityId || !userId) {
        return { success: false, message: 'Invalid community ID or user ID' };
      }

      // =====================================================
      // 🔹 Fetch community
      // =====================================================
      const communityRef = rtdbRef(this.db, `communities/${communityId}`);
      const communitySnap = await rtdbGet(communityRef);

      if (!communitySnap.exists()) {
        return { success: false, message: 'Community not found' };
      }

      const communityData = communitySnap.val();

      // ❌ Owner cannot exit
      const ownerId = communityData.ownerId || communityData.createdBy;
      if (ownerId === userId) {
        return {
          success: false,
          message:
            'Owner cannot exit the community. Please assign a new owner first.',
        };
      }

      // ❌ Not a member
      if (!communityData.members?.[userId]) {
        return {
          success: false,
          message: 'You are not a member of this community',
        };
      }

      // =====================================================
      // 🔹 Firebase atomic updates
      // =====================================================
      const updates: Record<string, any> = {};

      // 1️⃣ Remove from community members
      updates[`/communities/${communityId}/members/${userId}`] = null;

      // 2️⃣ Remove from userchats
      updates[`/userchats/${userId}/${communityId}`] = null;
      updates[`/userchats/${userId}/${communityId}_announcement`] = null;
      updates[`/userchats/${userId}/${communityId}_general`] = null;

      // 3️⃣ Remove from groups
      updates[`/groups/${communityId}_announcement/members/${userId}`] = null;
      updates[`/groups/${communityId}_general/members/${userId}`] = null;

      // 4️⃣ Update member count
      const currentMemberCount = Object.keys(
        communityData.members || {}
      ).length;

      updates[`/communities/${communityId}/memberCount`] = Math.max(
        0,
        currentMemberCount - 1
      );

      // 5️⃣ Commit Firebase update
      await this.chatBackendSocket.applySecuredBatchUpdates({ updates });

      // =====================================================
      // ✅ LOCAL CLEANUP — POUCHDB
      // =====================================================

      // 🔥 Remove conversations from PouchDB
      await this.chatPouchDb.deleteConversation(userId, communityId);
      await this.chatPouchDb.deleteConversation(
        userId,
        `${communityId}_announcement`
      );
      await this.chatPouchDb.deleteConversation(
        userId,
        `${communityId}_general`
      );

      // =====================================================
      // 🔹 Update in-memory conversations list
      // =====================================================
      const filteredConvs = this._conversations$.value.filter(
        (conv) =>
          conv.roomId !== communityId &&
          conv.roomId !== `${communityId}_announcement` &&
          conv.roomId !== `${communityId}_general`
      );

      this._conversations$.next(filteredConvs);

      // =====================================================
      // 🔹 Clear messages cache
      // =====================================================
      const messageMap = new Map(this._messages$.value);
      messageMap.delete(communityId);
      messageMap.delete(`${communityId}_announcement`);
      messageMap.delete(`${communityId}_general`);
      this._messages$.next(messageMap);

      console.log(
        `✅ User ${userId} exited community ${communityId} (Firebase + PouchDB cleaned)`
      );

      return {
        success: true,
        message: 'Successfully exited the community',
      };
    } catch (error) {
      console.error('exitCommunity error:', error);
      return {
        success: false,
        message: 'Failed to exit community. Please try again.',
      };
    }
  }

  /**
   * Promote a member to admin
   */
  async promoteMemberToAdmin(
    communityId: string,
    currentOwnerId: string,
    targetUserId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get community reference - UPDATED PATH
      const communityRef = ref(this.db, `communities/${communityId}`);
      const communitySnapshot = await get(communityRef);

      if (!communitySnapshot.exists()) {
        return { success: false, message: 'Community not found' };
      }

      const community = communitySnapshot.val();

      // Verify current user is owner
      const ownerId = community.ownerId || community.createdBy;
      if (ownerId !== currentOwnerId) {
        return { success: false, message: 'Only owner can promote to admin' };
      }

      // Check if target is already owner
      if (ownerId === targetUserId) {
        return { success: false, message: 'User is already the owner' };
      }

      // Check if already admin
      const adminIds = community.adminIds || [];
      if (adminIds.includes(targetUserId)) {
        return { success: false, message: 'User is already an admin' };
      }

      // Check if member exists in community
      if (!community.members || !community.members[targetUserId]) {
        return {
          success: false,
          message: 'User is not a member of this community',
        };
      }

      // Add to adminIds array
      const updatedAdminIds = [...adminIds, targetUserId];

      // Update community document - UPDATED PATH
      const updates: any = {};
      updates[`communities/${communityId}/adminIds`] = updatedAdminIds;
      updates[`communities/${communityId}/members/${targetUserId}/role`] =
        'admin';

      await this.applySecuredBatchUpdates(updates);

      // Update in currentConversations if needed
      this.updateLocalConversation(communityId, {
        adminIds: updatedAdminIds,
      });

      return {
        success: true,
        message: 'Member promoted to admin successfully',
      };
    } catch (error) {
      console.error('Error promoting member to admin:', error);
      return { success: false, message: 'Failed to promote member to admin' };
    }
  }

  /**
   * Transfer community ownership
   */
  async transferCommunityOwnership(
    communityId: string,
    currentOwnerId: string,
    newOwnerId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const communityRef = ref(this.db, `communities/${communityId}`);
      const communitySnapshot = await get(communityRef);

      if (!communitySnapshot.exists()) {
        return { success: false, message: 'Community not found' };
      }

      const community = communitySnapshot.val();

      // Verify current user is owner
      const currentOwner = community.ownerId || community.createdBy;
      if (currentOwner !== currentOwnerId) {
        return { success: false, message: 'Only owner can transfer ownership' };
      }

      // Verify new owner is an admin
      const adminIds = community.adminIds || [];
      if (!adminIds.includes(newOwnerId)) {
        return {
          success: false,
          message:
            'New owner must be an admin first. Please promote them to admin.',
        };
      }

      // Remove new owner from adminIds
      const updatedAdminIds = adminIds.filter(
        (id: string) => id !== newOwnerId
      );

      // Add current owner to adminIds
      updatedAdminIds.push(currentOwnerId);

      // Prepare update object - UPDATED PATH
      const updates: any = {};
      updates[`communities/${communityId}/ownerId`] = newOwnerId;
      updates[`communities/${communityId}/adminIds`] = updatedAdminIds;
      updates[`communities/${communityId}/members/${newOwnerId}/role`] =
        'owner';
      updates[`communities/${communityId}/members/${currentOwnerId}/role`] =
        'admin';

      // Update community
      await this.applySecuredBatchUpdates(updates);

      // Update in currentConversations
      this.updateLocalConversation(communityId, {
        ownerId: newOwnerId,
        adminIds: updatedAdminIds,
      });

      return {
        success: true,
        message: 'Ownership transferred successfully',
      };
    } catch (error) {
      console.error('Error transferring ownership:', error);
      return { success: false, message: 'Failed to transfer ownership' };
    }
  }

  /**
   * Combined: Promote to admin and transfer ownership
   */
  async promoteAndTransferOwnership(
    communityId: string,
    currentOwnerId: string,
    newOwnerId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const communityRef = ref(this.db, `communities/${communityId}`);
      const communitySnapshot = await get(communityRef);

      if (!communitySnapshot.exists()) {
        return { success: false, message: 'Community not found' };
      }

      const community = communitySnapshot.val();

      // Verify current user is owner
      const currentOwner = community.ownerId || community.createdBy;
      if (currentOwner !== currentOwnerId) {
        return { success: false, message: 'Only owner can transfer ownership' };
      }

      // Check if target is current owner
      if (currentOwnerId === newOwnerId) {
        return { success: false, message: 'You are already the owner' };
      }

      // Check if member exists
      if (!community.members || !community.members[newOwnerId]) {
        return {
          success: false,
          message: 'User is not a member of this community',
        };
      }

      const adminIds = community.adminIds || [];
      let updatedAdminIds = [...adminIds];

      // If not already admin, they will become one temporarily (then owner)
      if (!updatedAdminIds.includes(newOwnerId)) {
        updatedAdminIds.push(newOwnerId);
      }

      // Remove new owner from adminIds (they'll be owner)
      updatedAdminIds = updatedAdminIds.filter(
        (id: string) => id !== newOwnerId
      );

      // Add current owner to adminIds
      if (!updatedAdminIds.includes(currentOwnerId)) {
        updatedAdminIds.push(currentOwnerId);
      }

      // Update everything using multi-path update - UPDATED PATH
      const updates: any = {};
      updates[`communities/${communityId}/ownerId`] = newOwnerId;
      updates[`communities/${communityId}/adminIds`] = updatedAdminIds;
      updates[`communities/${communityId}/members/${newOwnerId}/role`] =
        'owner';
      updates[`communities/${communityId}/members/${currentOwnerId}/role`] =
        'admin';

      await this.applySecuredBatchUpdates(updates);

      // Update in currentConversations
      this.updateLocalConversation(communityId, {
        ownerId: newOwnerId,
        adminIds: updatedAdminIds,
      });

      return {
        success: true,
        message: 'Ownership transferred successfully',
      };
    } catch (error) {
      console.error('Error in promoteAndTransferOwnership:', error);
      return { success: false, message: 'Failed to transfer ownership' };
    }
  }

  /**
   * Helper: Update local conversation cache
   */
  private updateLocalConversation(communityId: string, updates: any) {
    const index = this.currentConversations.findIndex(
      (c) => c.roomId === communityId
    );
    if (index !== -1) {
      this.currentConversations[index] = {
        ...this.currentConversations[index],
        ...updates,
      };
    }
  }

  /**
   * Make a user a community admin
   * @param communityId - The community ID
   * @param userId - The user ID to make admin
   * @returns Promise<boolean> - Success status
   */
  async makeCommunityAdmin(
    communityId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const db = getDatabase();
      const adminIdsRef = ref(db, `communities/${communityId}/adminIds`);

      // Get current admin IDs
      const snapshot = await get(adminIdsRef);
      let adminIds = snapshot.exists() ? snapshot.val() : {};

      // Check if user is already an admin
      const adminIdsArray = Object.values(adminIds).map((id) => String(id));
      if (adminIdsArray.includes(String(userId))) {
        console.log('User is already an admin');
        return true;
      }

      // Add new admin ID
      const newIndex = Object.keys(adminIds).length;
      adminIds[newIndex] = String(userId);

      // ✅ SECURE UPDATE: route through backend socket (direct set() causes PERMISSION_DENIED)
      await this.applySecuredBatchUpdates({
        [`communities/${communityId}/adminIds`]: adminIds,
        [`usersInCommunity/${communityId}/${userId}/role`]: 'admin',
      });

      console.log(`✅ Successfully made user ${userId} a community admin`);
      return true;
    } catch (error) {
      console.error('❌ Error making community admin:', error);
      return false;
    }
  }

  /**
   * Dismiss a user as community admin
   * @param communityId - The community ID
   * @param userId - The user ID to dismiss as admin
   * @returns Promise<boolean> - Success status
   */
  async dismissCommunityAdmin(
    communityId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const db = getDatabase();
      const adminIdsRef = ref(db, `communities/${communityId}/adminIds`);

      // Get current admin IDs
      const snapshot = await get(adminIdsRef);
      if (!snapshot.exists()) {
        console.log('No admin IDs found');
        return false;
      }

      const adminIds = snapshot.val();

      // Convert to array and filter out the user
      const adminIdsArray = Object.values(adminIds).map((id) => String(id));
      const updatedArray = adminIdsArray.filter(
        (id) => String(id) !== String(userId)
      );

      // Check if user was actually an admin
      if (adminIdsArray.length === updatedArray.length) {
        console.log('User was not an admin');
        return true; // Not an error, just already not an admin
      }

      // Convert back to object format for Firebase
      const updatedAdminIds = updatedArray.reduce((acc, id, index) => {
        acc[index] = id;
        return acc;
      }, {} as any);

      // ✅ SECURE UPDATE: route through backend socket (direct set() causes PERMISSION_DENIED)
      await this.applySecuredBatchUpdates({
        [`communities/${communityId}/adminIds`]: updatedAdminIds,
        [`usersInCommunity/${communityId}/${userId}/role`]: 'member',
      });

      console.log(
        `✅ Successfully dismissed user ${userId} as community admin`
      );
      return true;
    } catch (error) {
      console.error('❌ Error dismissing community admin:', error);
      return false;
    }
  }

  /**
   * Remove a member from community
   * @param communityId - The community ID
   * @param userId - The user ID to remove
   * @returns Promise<boolean> - Success status
  //  */
  // async removeCommunityMember(
  //   communityId: string,
  //   userId: string
  // ): Promise<boolean> {
  //   try {
  //     const db = getDatabase();

  //     // Mark member as inactive instead of deleting
  //     const memberRef = ref(db, `communities/${communityId}/members/${userId}`);

  //     // Check if member exists
  //     const snapshot = await get(memberRef);
  //     if (!snapshot.exists()) {
  //       console.log('Member not found in community');
  //       return false;
  //     }

  //     // Update member status to inactive
  //     await update(memberRef, {
  //       isActive: false,
  //       removedAt: new Date().toISOString(),
  //     });

  //     // Also remove from adminIds if they are an admin
  //     const adminIdsRef = ref(db, `communities/${communityId}/adminIds`);
  //     const adminSnapshot = await get(adminIdsRef);

  //     if (adminSnapshot.exists()) {
  //       const adminIds = adminSnapshot.val();
  //       const adminIdsArray = Object.values(adminIds).map((id) => String(id));

  //       if (adminIdsArray.includes(String(userId))) {
  //         // Remove from admin list
  //         const updatedArray = adminIdsArray.filter(
  //           (id) => String(id) !== String(userId)
  //         );
  //         const updatedAdminIds = updatedArray.reduce((acc, id, index) => {
  //           acc[index] = id;
  //           return acc;
  //         }, {} as any);

  //         await set(adminIdsRef, updatedAdminIds);
  //         console.log(`✅ Also removed user ${userId} from admin list`);
  //       }
  //     }

  //     console.log(`✅ Successfully removed member ${userId} from community`);
  //     return true;
  //   } catch (error) {
  //     console.error('❌ Error removing community member:', error);
  //     return false;
  //   }
  // }

  async removeCommunityMember(
    communityId: string,
    userId: string
  ): Promise<boolean> {
    try {
      // const db = getDatabase();

      // ── 1. Fetch community data ──────────────────────────────────
      const communityRef = ref(this.db, `communities/${communityId}`);
      const communitySnap = await get(communityRef);

      if (!communitySnap.exists()) {
        console.log('Community not found');
        return false;
      }

      const communityData = communitySnap.val();
      const memberData = communityData.members?.[userId];

      if (!memberData) {
        console.log('Member not found in community');
        return false;
      }

      const updates: Record<string, any> = {};

      // ── 2. Remove from community members (hard delete, like exitCommunity) ──
      updates[`communities/${communityId}/members/${userId}`] = null;

      // ── 3. Remove from userchats for community + system groups ───
      updates[`userchats/${userId}/${communityId}`] = null;
      updates[`userchats/${userId}/${communityId}_announcement`] = null;
      updates[`userchats/${userId}/${communityId}_general`] = null;

      // ── 4. Remove from announcement group members ─────────────────
      updates[`groups/${communityId}_announcement/members/${userId}`] = null;

      // ── 5. Remove from general group members ─────────────────────
      updates[`groups/${communityId}_general/members/${userId}`] = null;

      // ── 6. Remove from adminIds if they were admin ────────────────
      const adminIdsRef = ref(this.db, `communities/${communityId}/adminIds`);
      const adminSnap = await get(adminIdsRef);

      if (adminSnap.exists()) {
        const adminIds = adminSnap.val();
        const adminIdsArray = Object.values(adminIds).map((id: any) =>
          String(id)
        );

        if (adminIdsArray.includes(String(userId))) {
          const updatedArray = adminIdsArray.filter(
            (id) => String(id) !== String(userId)
          );
          const updatedAdminIds = updatedArray.reduce((acc, id, index) => {
            acc[index] = id;
            return acc;
          }, {} as any);

          updates[`communities/${communityId}/adminIds`] = updatedAdminIds;
          console.log(`✅ Also removed user ${userId} from admin list`);
        }
      }

      // ── 7. Update member count ────────────────────────────────────
      const currentMemberCount = Object.keys(
        communityData.members || {}
      ).length;
      updates[`communities/${communityId}/memberCount`] = Math.max(
        0,
        currentMemberCount - 1
      );

      // ── 8. Apply all Firebase updates atomically ──────────────────
      await this.applySecuredBatchUpdates(updates);

      // ── 9. PouchDB cleanup (mirrors exitCommunity) ────────────────
      try {
        await this.chatPouchDb.deleteConversation(userId, communityId);
        await this.chatPouchDb.deleteConversation(
          userId,
          `${communityId}_announcement`
        );
        await this.chatPouchDb.deleteConversation(
          userId,
          `${communityId}_general`
        );
        console.log(`✅ PouchDB cleaned for removed member ${userId}`);
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB cleanup failed for removed member:', cacheErr);
      }

      // ── 10. Update in-memory conversations$ (only affects current user's view) ──
      // Note: conversations$ is per-user, so this only matters if
      // the removed user is the currently logged-in user (senderId).
      // For admin removing someone else, we just refresh locally.
      if (userId === this.senderId) {
        const filteredConvs = this._conversations$.value.filter(
          (conv) =>
            conv.roomId !== communityId &&
            conv.roomId !== `${communityId}_announcement` &&
            conv.roomId !== `${communityId}_general`
        );
        this._conversations$.next(filteredConvs);

        // Clear messages cache
        const messageMap = new Map(this._messages$.value);
        messageMap.delete(communityId);
        messageMap.delete(`${communityId}_announcement`);
        messageMap.delete(`${communityId}_general`);
        this._messages$.next(messageMap);
      }

      console.log(
        `✅ Successfully removed member ${userId} from community ${communityId} (Firebase + PouchDB cleaned)`
      );
      return true;
    } catch (error) {
      console.error('❌ Error removing community member:', error);
      return false;
    }
  }

  /**
   * Get community admin details for permission checks
   * @param communityId - The community ID
   * @param currentUserId - Current user's ID
   * @param targetUserId - Target user's ID
   * @returns Promise with admin check details
   */
  async getCommunityAdminCheckDetails(
    communityId: string,
    currentUserId: string,
    targetUserId: string
  ): Promise<{
    adminIds: string[];
    isCurrentUserAdmin: boolean;
    isCurrentUserCreator: boolean;
    isTargetUserAdmin: boolean;
    isSelf: boolean;
  }> {
    try {
      const db = getDatabase();

      // Get community details
      const communityRef = ref(db, `communities/${communityId}`);
      const snapshot = await get(communityRef);

      if (!snapshot.exists()) {
        return {
          adminIds: [],
          isCurrentUserAdmin: false,
          isCurrentUserCreator: false,
          isTargetUserAdmin: false,
          isSelf: false,
        };
      }

      const communityData = snapshot.val();
      const adminIds = communityData.adminIds
        ? Object.values(communityData.adminIds).map((id: any) => String(id))
        : [];
      const creatorId = String(communityData.createdBy || '');

      const isCurrentUserAdmin = adminIds.includes(String(currentUserId));
      const isCurrentUserCreator = String(currentUserId) === creatorId;
      const isTargetUserAdmin = adminIds.includes(String(targetUserId));
      const isSelf = String(currentUserId) === String(targetUserId);

      return {
        adminIds,
        isCurrentUserAdmin,
        isCurrentUserCreator,
        isTargetUserAdmin,
        isSelf,
      };
    } catch (error) {
      console.error('Error getting community admin check details:', error);
      return {
        adminIds: [],
        isCurrentUserAdmin: false,
        isCurrentUserCreator: false,
        isTargetUserAdmin: false,
        isSelf: false,
      };
    }
  }

  /**
   * Transfer community ownership to a new owner
   * - Changes ownerId to new owner
   * - Makes old owner an admin
   * - Removes new owner from adminIds
   * - createdBy remains unchanged (original creator)
   *
   * @param communityId - The community ID
   * @param currentOwnerId - Current owner's user ID
   * @param newOwnerId - New owner's user ID (must be an admin)
   * @returns Promise<boolean> - Success status
   */

  /**
   * Check if user is member of a community
   */
  async isUserCommunityMember(
    communityId: string,
    userId: string
  ): Promise<boolean> {
    try {
      if (!communityId || !userId) return false;

      const memberRef = rtdbRef(
        this.db,
        `communities/${communityId}/members/${userId}`
      );
      const snapshot = await rtdbGet(memberRef);

      return snapshot.exists();
    } catch (error) {
      console.error('isUserCommunityMember error:', error);
      return false;
    }
  }

  /**
   * Get community member count
   */
  async getCommunityMemberCount(communityId: string): Promise<number> {
    try {
      if (!communityId) return 0;

      const membersRef = rtdbRef(this.db, `communities/${communityId}/members`);
      const snapshot = await rtdbGet(membersRef);

      if (!snapshot.exists()) return 0;

      const members = snapshot.val();
      return Object.keys(members).length;
    } catch (error) {
      console.error('getCommunityMemberCount error:', error);
      return 0;
    }
  }

  /**
   * Check if user is admin of a community
   */
  async isUserCommunityAdmin(
    communityId: string,
    userId: string
  ): Promise<boolean> {
    try {
      if (!communityId || !userId) return false;

      const adminIdsRef = rtdbRef(
        this.db,
        `communities/${communityId}/adminIds`
      );
      const snapshot = await rtdbGet(adminIdsRef);

      if (!snapshot.exists()) return false;

      const adminIds: string[] = snapshot.val() || [];
      return adminIds.includes(String(userId));
    } catch (error) {
      console.error('isUserCommunityAdmin error:', error);
      return false;
    }
  }

  /**
   * Add group to community
   */
  async addGroupToCommunity(
    communityId: string,
    groupId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!communityId || !groupId) {
        return { success: false, message: 'Invalid community ID or group ID' };
      }

      const updates: Record<string, any> = {};

      // Add group to community's groups list
      updates[`/communities/${communityId}/groups/${groupId}`] = true;

      // Link community to group
      updates[`/groups/${groupId}/communityId`] = communityId;

      await this.chatBackendSocket.applySecuredBatchUpdates({ updates });

      return {
        success: true,
        message: 'Group added to community successfully',
      };
    } catch (error) {
      console.error('addGroupToCommunity error:', error);
      return { success: false, message: 'Failed to add group to community' };
    }
  }

  /**
   * Remove group from community
   */
  async removeGroupFromCommunity(
    communityId: string,
    groupId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!communityId || !groupId) {
        return { success: false, message: 'Invalid community ID or group ID' };
      }

      const updates: Record<string, any> = {};

      // Remove group from community's groups list
      updates[`/communities/${communityId}/groups/${groupId}`] = null;

      // Remove community link from group
      updates[`/groups/${groupId}/communityId`] = null;

      await this.chatBackendSocket.applySecuredBatchUpdates({ updates });

      return {
        success: true,
        message: 'Group removed from community successfully',
      };
    } catch (error) {
      console.error('removeGroupFromCommunity error:', error);
      return {
        success: false,
        message: 'Failed to remove group from community',
      };
    }
  }

  /**
   * Get community announcement group
   */
  async getCommunityAnnouncementGroup(
    communityId: string
  ): Promise<any | null> {
    try {
      if (!communityId) return null;

      const { announcementGroup } = await this.getCommunityGroupsWithDetails(
        communityId
      );
      return announcementGroup;
    } catch (error) {
      console.error('getCommunityAnnouncementGroup error:', error);
      return null;
    }
  }

  /**
   * Get community general group
   */
  async getCommunityGeneralGroup(communityId: string): Promise<any | null> {
    try {
      if (!communityId) return null;

      const { generalGroup } = await this.getCommunityGroupsWithDetails(
        communityId
      );
      return generalGroup;
    } catch (error) {
      console.error('getCommunityGeneralGroup error:', error);
      return null;
    }
  }

  // Add these functions to your FirebaseChatService class

  /**
   * Get all groups in a community (simple list with basic info)
   */
  async getCommunityGroupsList(communityId: string): Promise<
    Array<{
      id: string;
      name: string;
      title: string;
      type: string;
      membersCount: number;
      isSystemGroup: boolean;
    }>
  > {
    try {
      if (!communityId) return [];

      const communityRef = rtdbRef(this.db, `communities/${communityId}`);
      const commSnap = await rtdbGet(communityRef);

      if (!commSnap.exists()) return [];

      const communityData = commSnap.val();
      const groupsObj = communityData.groups || {};
      const groupIds = Object.keys(groupsObj);

      const groups: Array<{
        id: string;
        name: string;
        title: string;
        type: string;
        membersCount: number;
        isSystemGroup: boolean;
      }> = [];

      for (const groupId of groupIds) {
        try {
          const groupRef = rtdbRef(this.db, `groups/${groupId}`);
          const groupSnap = await rtdbGet(groupRef);

          if (!groupSnap.exists()) continue;

          const groupData = groupSnap.val();
          const title = groupData.title || groupData.name || 'Unnamed group';
          const type = groupData.type || 'group';

          // Check if it's a system group (Announcements or General)
          const isSystemGroup =
            title === 'Announcements' || title === 'General';

          groups.push({
            id: groupId,
            name: title,
            title: title,
            type: type,
            membersCount: groupData.members
              ? Object.keys(groupData.members).length
              : 0,
            isSystemGroup: isSystemGroup,
          });
        } catch (err) {
          console.error(`Error fetching group ${groupId}:`, err);
        }
      }

      // Sort: system groups first, then alphabetically
      groups.sort((a, b) => {
        if (a.isSystemGroup && !b.isSystemGroup) return -1;
        if (!a.isSystemGroup && b.isSystemGroup) return 1;
        return a.name.localeCompare(b.name);
      });

      return groups;
    } catch (error) {
      console.error('getCommunityGroupsList error:', error);
      return [];
    }
  }

  /**
   * Remove a group from community
   */
  async removeGroupFromCommunitys(
    communityId: string,
    groupId: string,
    options: {
      removeMembers: boolean;
      currentUserId?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    removedMembersCount?: number;
  }> {
    try {
      if (!communityId || !groupId) {
        return { success: false, message: 'Invalid community ID or group ID' };
      }

      const updates: Record<string, any> = {};

      // 1. Unlink group from community
      updates[`/communities/${communityId}/groups/${groupId}`] = null;
      updates[`/groups/${groupId}/communityId`] = null;

      // 2. Get community info
      const communityRef = rtdbRef(this.db, `communities/${communityId}`);
      const commSnap = await rtdbGet(communityRef);
      const communityData = commSnap.exists() ? commSnap.val() : null;
      const commCreatedBy = communityData?.createdBy || null;
      const existingCommMembers = communityData?.members || {};

      // 3. Get all groups in community (remaining after removal)
      const allGroupIds = Object.keys(communityData?.groups || {});
      const remainingGroupIds = allGroupIds.filter((gid) => gid !== groupId);

      // 4. Get members from remaining groups
      const remainingMembersSet = new Set<string>();
      for (const gid of remainingGroupIds) {
        try {
          const gRef = rtdbRef(this.db, `groups/${gid}`);
          const gSnap = await rtdbGet(gRef);
          if (gSnap.exists()) {
            const gData = gSnap.val();
            const members = gData.members || {};
            Object.keys(members).forEach((uid) => {
              if (uid) remainingMembersSet.add(uid);
            });
          }
        } catch (err) {
          console.warn(`Failed to load group ${gid}:`, err);
        }
      }

      // 5. Get members from the group being removed
      const removedGroupRef = rtdbRef(this.db, `groups/${groupId}`);
      const removedGroupSnap = await rtdbGet(removedGroupRef);
      const removedGroupData = removedGroupSnap.exists()
        ? removedGroupSnap.val()
        : null;
      const removedGroupMembers = removedGroupData?.members || {};
      const removedGroupMemberIds = Object.keys(removedGroupMembers);

      let removedMembersCount = 0;

      if (options.removeMembers) {
        // Remove members who are ONLY in the removed group (not in other groups)
        const membersToRemove: string[] = [];

        for (const uid of removedGroupMemberIds) {
          // Skip community creator
          if (uid === commCreatedBy) continue;

          // If member is not in any remaining group, remove from community
          if (!remainingMembersSet.has(uid)) {
            membersToRemove.push(uid);
          }
        }

        // Remove these members from community
        for (const uid of membersToRemove) {
          updates[`/communities/${communityId}/members/${uid}`] = null;
          updates[`/userchats/${uid}/${communityId}`] = null;
          removedMembersCount++;
        }

        // Remove from the specific group being removed
        for (const uid of membersToRemove) {
          updates[`/groups/${groupId}/members/${uid}`] = null;
          updates[`/userchats/${uid}/${groupId}`] = null;
        }

        // Find and update announcement group
        const announcementGroupId = await this.findCommunityAnnouncementGroupId(
          communityId
        );
        if (announcementGroupId) {
          for (const uid of membersToRemove) {
            updates[`/groups/${announcementGroupId}/members/${uid}`] = null;
            updates[`/userchats/${uid}/${announcementGroupId}`] = null;
          }
        }

        // Find and update general group
        const generalGroupId = await this.findCommunityGeneralGroupId(
          communityId
        );
        if (generalGroupId) {
          for (const uid of membersToRemove) {
            updates[`/groups/${generalGroupId}/members/${uid}`] = null;
            updates[`/userchats/${uid}/${generalGroupId}`] = null;
          }
        }

        // Update community member count
        const newMemberCount = Math.max(
          0,
          Object.keys(existingCommMembers).length - removedMembersCount
        );
        updates[`/communities/${communityId}/membersCount`] = newMemberCount;
      } else {
        // Keep all members, just unlink the group
        // Members stay in community and in remaining groups
        remainingMembersSet.forEach((uid) => {
          updates[`/communities/${communityId}/members/${uid}`] =
            existingCommMembers[uid] || { isActive: true };
        });
      }

      // Apply all updates
      await this.chatBackendSocket.applySecuredBatchUpdates({ updates });

      return {
        success: true,
        message: 'Group removed from community successfully',
        removedMembersCount,
      };
    } catch (error) {
      console.error('removeGroupFromCommunity error:', error);
      return {
        success: false,
        message: 'Failed to remove group from community',
      };
    }
  }

  /**
   * Find announcement group ID in a community
   */
  async findCommunityAnnouncementGroupId(
    communityId: string
  ): Promise<string | null> {
    try {
      const groupIds = await this.getGroupsInCommunity(communityId);

      for (const groupId of groupIds) {
        const groupRef = rtdbRef(this.db, `groups/${groupId}`);
        const groupSnap = await rtdbGet(groupRef);

        if (groupSnap.exists()) {
          const groupData = groupSnap.val();
          if (
            groupData.title === 'Announcements' ||
            groupData.type === 'announcement'
          ) {
            return groupId;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('findCommunityAnnouncementGroupId error:', error);
      return null;
    }
  }

  /**
   * Find general group ID in a community
   */
  async findCommunityGeneralGroupId(
    communityId: string
  ): Promise<string | null> {
    try {
      const groupIds = await this.getGroupsInCommunity(communityId);

      for (const groupId of groupIds) {
        const groupRef = rtdbRef(this.db, `groups/${groupId}`);
        const groupSnap = await rtdbGet(groupRef);

        if (groupSnap.exists()) {
          const groupData = groupSnap.val();
          if (groupData.title === 'General' || groupData.type === 'general') {
            return groupId;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('findCommunityGeneralGroupId error:', error);
      return null;
    }
  }

  /**
   * Get community name/title
   */
  async getCommunityName(communityId: string): Promise<string> {
    try {
      const communityRef = rtdbRef(this.db, `communities/${communityId}`);
      const snapshot = await rtdbGet(communityRef);

      if (!snapshot.exists()) return '';

      const data = snapshot.val();
      return data.title || data.name || '';
    } catch (error) {
      console.error('getCommunityName error:', error);
      return '';
    }
  }

  async addGroupsToCommunity(params: {
    communityId: string;
    groupIds: string[];
    backendCommunityId?: string | null;
    currentUserId?: string;
  }): Promise<{
    success: boolean;
    message: string;
    addedMembersCount?: number;
    updatedAnnouncementGroup?: boolean;
  }> {
    try {
      const { communityId, groupIds, backendCommunityId, currentUserId } =
        params;

      if (!communityId || !groupIds?.length) {
        return { success: false, message: 'Community ID or group IDs missing' };
      }

      const updates: Record<string, any> = {};
      const membersMap = new Map<
        string,
        {
          username?: string;
          phoneNumber?: string;
          avatar?: string;
        }
      >();

      let communityInfo: any = null;
      try {
        communityInfo = await this.getCommunityInfo(communityId);
      } catch {}

      // 🔥 OPTIMIZATION: Fetch all group info in parallel
      const groupInfoPromises = groupIds.map((groupId) =>
        this.getGroupInfo(groupId).catch(() => null)
      );
      const groupInfos = await Promise.all(groupInfoPromises);

      // Process each group
      for (let i = 0; i < groupIds.length; i++) {
        const groupId = groupIds[i];
        const groupInfo = groupInfos[i];

        updates[`/communities/${communityId}/groups/${groupId}`] = true;
        updates[`/groups/${groupId}/communityId`] = communityId;

        // Backend sync (if needed)
        if (backendCommunityId && groupInfo) {
          const backendGroupId =
            groupInfo?.backendGroupId ?? groupInfo?.backend_group_id ?? null;
          if (backendGroupId && currentUserId) {
            try {
              await firstValueFrom(
                this.apiService.addGroupToCommunity(
                  backendCommunityId,
                  String(backendGroupId),
                  Number(currentUserId) || 0
                )
              );
            } catch {}
          }
        }

        // Collect members
        if (groupInfo?.members) {
          Object.entries(groupInfo.members).forEach(([userId, member]: any) => {
            if (!membersMap.has(userId)) {
              membersMap.set(userId, {
                username: member?.username || '',
                phoneNumber: member?.phoneNumber || '',
                avatar: member?.avatar || '',
              });
            }
          });
        }
      }

      // Merge existing members
      Object.entries(communityInfo?.members || {}).forEach(
        ([userId, member]: any) => {
          if (!membersMap.has(userId)) {
            membersMap.set(userId, {
              username: member?.username || '',
              phoneNumber: member?.phoneNumber || '',
              avatar: member?.avatar || '',
            });
          }
        }
      );

      // Get system groups
      const announcementGroupId = await this.findCommunityAnnouncementGroupId(
        communityId
      );
      const generalGroupId = await this.findCommunityGeneralGroupId(
        communityId
      );

      // Apply all updates via backend socket
      await this.chatBackendSocket.addGroupsToCommunity({
        communityId,
        groupIds
      });

      // Sync members to system groups
      await this.chatBackendSocket.syncCommunityMembers({
        communityId,
        memberIds: Array.from(membersMap.keys()),
        announcementGroupId: announcementGroupId || undefined,
        generalGroupId: generalGroupId || undefined,
      });

      return {
        success: true,
        message: `Successfully added ${groupIds.length} group(s) with ${membersMap.size} member(s)`,
        addedMembersCount: membersMap.size,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to add groups to community',
      };
    }
  }

  /**
   * Get backend community ID from Firebase community ID
   */
  async getBackendCommunityId(
    firebaseCommunityId: string
  ): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.apiService.getCommunityById(firebaseCommunityId)
      );
      return res?.community?.community_id != null
        ? String(res.community.community_id)
        : null;
    } catch (error) {
      console.error('getBackendCommunityId error:', error);
      return null;
    }
  }

  /**
   * Collect all unique members from multiple groups
   */
  async collectMembersFromGroups(groupIds: string[]): Promise<Set<string>> {
    const memberIds = new Set<string>();

    for (const groupId of groupIds) {
      try {
        const groupInfo = await this.getGroupInfo(groupId);
        if (groupInfo?.members) {
          Object.keys(groupInfo.members).forEach((memberId) => {
            if (memberId) memberIds.add(memberId);
          });
        }
      } catch (err) {
        console.warn(`Failed to collect members from group ${groupId}:`, err);
      }
    }

    return memberIds;
  }

  /**
   * Sync members to community announcement and general groups
   */
  async syncMembersToCommunitySystemGroups(
    communityId: string,
    memberIds: Set<string>
  ): Promise<{ announcementSynced: boolean; generalSynced: boolean }> {
    const result = { announcementSynced: false, generalSynced: false };
    const updates: Record<string, any> = {};

    try {
      // Sync to announcement group
      const announcementGroupId = await this.findCommunityAnnouncementGroupId(
        communityId
      );
      if (announcementGroupId) {
        const annInfo = await this.getGroupInfo(announcementGroupId);
        const existingMembers = annInfo?.members || {};
        const memberSet = new Set<string>(Object.keys(existingMembers));

        memberIds.forEach((userId) => {
          if (!memberSet.has(userId)) {
            updates[`/groups/${announcementGroupId}/members/${userId}`] = {
              isActive: true,
              username: '',
              phoneNumber: '',
            };
            updates[`/userchats/${userId}/${announcementGroupId}`] = {
              type: 'group',
              lastmessageAt: Date.now(),
              lastmessageType: 'text',
              lastmessage: '',
              unreadCount: 0,
              isArchived: false,
              isPinned: false,
              isLocked: false,
            };
            memberSet.add(userId);
          }
        });

        updates[`/groups/${announcementGroupId}/membersCount`] = memberSet.size;
        result.announcementSynced = true;
      }

      // Sync to general group
      const generalGroupId = await this.findCommunityGeneralGroupId(
        communityId
      );
      if (generalGroupId) {
        const genInfo = await this.getGroupInfo(generalGroupId);
        const existingMembers = genInfo?.members || {};
        const memberSet = new Set<string>(Object.keys(existingMembers));

        memberIds.forEach((userId) => {
          if (!memberSet.has(userId)) {
            updates[`/groups/${generalGroupId}/members/${userId}`] = {
              isActive: true,
              username: '',
              phoneNumber: '',
            };
            updates[`/userchats/${userId}/${generalGroupId}`] = {
              type: 'group',
              lastmessageAt: Date.now(),
              lastmessageType: 'text',
              lastmessage: '',
              unreadCount: 0,
              isArchived: false,
              isPinned: false,
              isLocked: false,
            };
            memberSet.add(userId);
          }
        });

        updates[`/groups/${generalGroupId}/membersCount`] = memberSet.size;
        result.generalSynced = true;
      }

      if (Object.keys(updates).length > 0) {
        await this.chatBackendSocket.syncCommunityMembers({
          communityId,
          memberIds: Array.from(memberIds),
          announcementGroupId: announcementGroupId || undefined,
          generalGroupId: generalGroupId || undefined,
        });
      }
    } catch (error) {
      console.error('syncMembersToCommunitySystemGroups error:', error);
    }

    return result;
  }

  // =====================
  // ====== QUERYING =====
  // Read-only helpers that fetch one-off data
  // =====================

  async getPinnedMessageOnce(roomId: string): Promise<PinnedMessage | null> {
    const pinnedMessages = await this.getPinnedMessages(roomId);
    return pinnedMessages.length > 0 ? pinnedMessages[0] : null;
  }

  async getGroupInfo(groupId: string): Promise<any> {
    const snapshot = await get(child(ref(this.db), `groups/${groupId}`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async getGroupsForUser(userId: string): Promise<string[]> {
    const snapshot = await get(child(ref(this.db), `userchats/${userId}`));
    if (!snapshot.exists()) return [];

    const userchats = snapshot.val();
    return Object.entries(userchats)
      .filter(([roomId, data]: any) => {
        return (
          data?.type === 'group' ||
          data?.chatType === 'group' ||
          roomId.startsWith('group_') ||
          roomId.startsWith('G-')
        );
      })
      .map(([roomId]) => roomId);
  }

  async fetchGroupWithProfiles(groupId: string): Promise<{
    groupName: string;
    groupMembers: Array<{
      user_id: string;
      username: string;
      phone: string;
      phoneNumber: string;
      avatar?: string;
      role?: string;
      isActive?: boolean;
      publicKeyHex?: string | null;
    }>;
  }> {
    // ✅ FIX 3: Full PouchDB fallback when offline — no Firebase calls
    if (!this.networkService.isOnline.value) {
      try {
        // Try group_details_ first
        const cached = await this.chatPouchDb.getCachedGroupDetails(groupId);
        if (cached?.members && cached.members.length > 0) {
          const groupDoc = await this.chatPouchDb.getGroup(groupId);
          const rawAdminIds = groupDoc?.adminIds || [];
          const adminIds: string[] = Array.isArray(rawAdminIds)
            ? rawAdminIds.map(String)
            : Object.keys(rawAdminIds);

          return {
            groupName: groupDoc?.title || groupId,
            groupMembers: cached.members.map((m: any) => ({
              user_id: m.user_id,
              username: m.username || m.contactName || m.user_id,
              phone: m.phoneNumber || '',
              phoneNumber: m.phoneNumber || '',
              avatar: m.avatar || 'assets/images/user.jfif',
              isActive: m.isActive ?? true,
              role: adminIds.includes(String(m.user_id)) ? 'admin' : 'member',
              publicKeyHex: null,
            })),
          };
        }

        // Try group_ doc
        const groupDoc = await this.chatPouchDb.getGroup(groupId);
        if (groupDoc) {
          const rawAdminIds = groupDoc.adminIds || [];
          const adminIds: string[] = Array.isArray(rawAdminIds)
            ? rawAdminIds.map(String)
            : Object.keys(rawAdminIds);

          const groupMembers = Object.entries(groupDoc.members || {}).map(
            ([userId, memberData]: [string, any]) => ({
              user_id: userId,
              username: memberData.username || userId,
              phone: memberData.phoneNumber || '',
              phoneNumber: memberData.phoneNumber || '',
              avatar: 'assets/images/user.jfif',
              isActive: memberData.isActive ?? true,
              role: adminIds.includes(userId) ? 'admin' : 'member',
              publicKeyHex: null,
            })
          );

          return {
            groupName: groupDoc.title || groupId,
            groupMembers,
          };
        }
      } catch (offlineErr) {
        console.warn('[fetchGroupWithProfiles] Offline PouchDB fallback failed:', offlineErr);
      }

      // Nothing in cache — return empty gracefully
      return { groupName: groupId, groupMembers: [] };
    }

    // ── Online path — original Firebase logic unchanged ──────────────
    const groupRef = ref(this.db, `groups/${groupId}`);

    try {
      const snapshot = await get(groupRef);
      if (!snapshot.exists()) {
        console.warn(`Group ${groupId} not found`);
        return { groupName: 'Unknown Group', groupMembers: [] };
      }

      const groupData = snapshot.val() as IGroup;
      const groupName = groupData.title || 'Unnamed Group';
      const members = groupData.members || {};
      const rawAdminIds = groupData.adminIds || [];
      const adminIds: string[] = Array.isArray(rawAdminIds)
        ? rawAdminIds.map(String)
        : Object.keys(rawAdminIds);

      const memberPromises = Object.entries(members).map(
        async ([userId, memberData]) => {
          try {
            const userProfileRes: any = await firstValueFrom(
              this.service.getUserProfilebyId(userId)
            );

            return {
              user_id: userId,
              username: memberData.username,
              phone: memberData.phoneNumber,
              phoneNumber: memberData.phoneNumber,
              avatar: userProfileRes?.profile || 'assets/images/user.jfif',
              isActive: memberData.isActive ?? true,
              role: adminIds.includes(userId) ? 'admin' : 'member',
              publicKeyHex: null,
            };
          } catch (err) {
            console.warn(`Failed to fetch profile for user ${userId}`, err);
            return {
              user_id: userId,
              username: memberData.username,
              phone: memberData.phoneNumber,
              phoneNumber: memberData.phoneNumber,
              avatar: 'assets/images/user.jfif',
              isActive: memberData.isActive ?? true,
              role: adminIds.includes(userId) ? 'admin' : 'member',
              publicKeyHex: null,
            };
          }
        }
      );

      const groupMembers = await Promise.all(memberPromises);

      return {
        groupName,
        groupMembers: groupMembers.filter((m) => m.isActive !== false),
      };
    } catch (error) {
      console.error('Error fetching group with profiles:', error);
      return { groupName: 'Error Loading Group', groupMembers: [] };
    }
  }

  async getGroupsInCommunity(communityId: string): Promise<string[]> {
    const snapshot = await get(
      child(ref(this.db), `communities/${communityId}/groups`)
    );
    const groups = snapshot.val();
    return groups ? Object.keys(groups) : [];
  }

  async getGroupsInCommunityWithInfo(communityId: string): Promise<any[]> {
    const groupIds = await this.getGroupsInCommunity(communityId);
    const result: any[] = [];

    for (const gid of groupIds) {
      const gSnap = await get(child(ref(this.db), `groups/${gid}`));
      if (gSnap.exists()) {
        const g = gSnap.val();
        result.push({
          id: gid,
          name: g.name,
          type: g.type || 'normal',
          createdBy: g.createdBy,
          createdAt: g.createdAt,
          membersCount:
            g.membersCount || (g.members ? Object.keys(g.members).length : 0),
        });
      }
    }

    return result;
  }

  async getUserCommunities(userId: string): Promise<string[]> {
    const snapshot = await get(
      child(ref(this.db), `usersInCommunity/${userId}/joinedCommunities`)
    );
    const communities = snapshot.val();
    return communities ? Object.keys(communities) : [];
  }

  async getCommunityInfo(communityId: string) {
    const snap = await get(child(ref(this.db), `communities/${communityId}`));
    return snap.exists() ? snap.val() : null;
  }

  async updateCommunityInfo(
    communityId: string,
    newName: string,
    newDescription: string
  ): Promise<boolean> {
    try {
      const db = getDatabase();
      const communityRef = ref(db, `communities/${communityId}`);

      await this.applySecuredBatchUpdates({
        [`communities/${communityId}/title`]: newName,
        [`communities/${communityId}/name`]: newName,
        [`communities/${communityId}/description`]: newDescription,
        [`communities/${communityId}/updatedAt`]: new Date().toISOString(),
      });

      console.log('✅ Community updated successfully:', communityId);

      // Optional: Update local cache if you maintain one
      // this.refreshCommunityInConversations(communityId, newName);

      return true;
    } catch (error) {
      console.error('❌ Error updating community info:', error);
      return false;
    }
  }

  async addMembersToCommunity(
    communityId: string,
    userIds: string[]
  ): Promise<void> {
    try {
      // 1. Get community data to find announcement group ID
      const communityRef = ref(this.db, `communities/${communityId}`);
      // const groupRef = ref(this.db, `groups`);
      const communitySnap = await get(communityRef);

      if (!communitySnap.exists()) {
        throw new Error('Community not found');
      }

      const communityData = communitySnap.val();

      // 2. Prepare updates object
      const updates: any = {};
      const timestamp = Date.now();

      // Build communityGroups array for ICommunityMeta
      const communityGroups: string[] = [];

      // Create community chat meta (similar to createCommunity)
      const communityChatMeta: ICommunityChatMeta = {
        type: 'community',
        lastmessageAt: timestamp,
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        communityGroups: communityGroups,
      };

      // Create announcement group chat meta
      const announcementChatMeta: IChatMeta = {
        type: 'group',
        lastmessageAt: timestamp,
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
      };

      // Add members to community and their userchats
      for (const userId of userIds) {
        // Add to community members
        updates[`communities/${communityId}/members/${userId}`] = {
          joinedAt: timestamp,
          role: 'member',
          userId: userId,
          isActive: true,
          username: '',
          phoneNumber: '',
        };

        // ✅ Add community chat meta to user's userchats (NOT users node)
        updates[`userchats/${userId}/${communityId}`] = communityChatMeta;
      }

      // Add members to announcement group and their userchats
      for (const userId of userIds) {
      }

      // Update member counts
      const currentCommunityMemberCount = communityData.memberCount || 0;
      updates[`communities/${communityId}/memberCount`] =
        currentCommunityMemberCount + userIds.length;

      // 3. Execute all updates atomically via secure socket proxy
      await this.applySecuredBatchUpdates(updates);


      console.log(
        `Successfully added ${userIds.length} members to community and announcement group`
      );
    } catch (error) {
      console.error('Error adding members to community:', error);
      throw error;
    }
  }

  async getGroupMembers(groupId: string): Promise<string[]> {
    const snapshot = await get(ref(this.db, `groups/${groupId}/members`));
    const membersObj = snapshot.val();
    return membersObj ? Object.keys(membersObj) : [];
  }

  // =====================
  // ====== UNREADS ======
  // Helpers for unread counters
  // =====================
  // (Unused legacy methods removed for security)


  // =====================
  // ====== MARKING ======
  // Delivery/read status helpers
  // =====================
  markDelivered(roomId: string, messageKey: string) {
    this.chatBackendSocket.updateReceipt({
      roomId,
      msgId: messageKey,
      receiptType: 'delivered'
    });
  }

  markRead(roomId: string, messageKey: string) {
    this.chatBackendSocket.updateReceipt({
      roomId,
      msgId: messageKey,
      receiptType: 'read'
    });
  }

  async markRoomAsRead(roomId: string, userId: string): Promise<number> {
    const db = getDatabase();
    const snap = await get(rtdbRef(db, `chats/${roomId}`));
    if (!snap.exists()) {
      try {
        await this.applySecuredBatchUpdates({
          [`unreadCounts/${roomId}/${userId}`]: 0,
        });
      } catch {}
      return 0;
    }

    const now = Date.now();
    const msgs = snap.val() || {};
    const multi: Record<string, any> = {};
    let changed = 0;

    Object.entries(msgs).forEach(([key, m]: any) => {
      const isForMe = String(m?.receiver_id) === String(userId);
      const alreadyRead = !!m?.read || (m?.readBy && m.readBy[userId]);

      if (isForMe && !alreadyRead) {
        multi[`chats/${roomId}/${key}/read`] = true;
        multi[`chats/${roomId}/${key}/readAt`] = now;
        multi[`chats/${roomId}/${key}/readBy/${userId}`] = now;
        changed++;
      }
    });

    multi[`unreadCounts/${roomId}/${userId}`] = 0;

    if (Object.keys(multi).length) {
      // ✅ SECURE UPDATE: Route batch unread/read updates through proxy
      await this.applySecuredBatchUpdates(multi);
    }
    return changed;
  }

  async markManyRoomsAsRead(
    roomIds: string[],
    userId: string
  ): Promise<number> {
    let total = 0;
    for (const rid of roomIds) {
      try {
        total += await this.markRoomAsRead(rid, userId);
      } catch {}
    }
    return total;
  }

  async markRoomAsUnread(
    roomId: string,
    userId: string,
    minCount: number = 1
  ): Promise<void> {
    const db = getDatabase();

    let current = 0;
    try {
      const snap = await get(rtdbRef(db, `unreadCounts/${roomId}/${userId}`));
      current = snap.exists() ? Number(snap.val() || 0) : 0;
    } catch {}

    const updates: Record<string, any> = {};
    updates[`unreadChats/${userId}/${roomId}`] = true;
    if (current < minCount) {
      updates[`unreadCounts/${roomId}/${userId}`] = minCount;
    }

    // ✅ SECURE UPDATE: Route unread status updates through proxy
    await this.applySecuredBatchUpdates(updates);
  }

  async markManyRoomsAsUnread(
    roomIds: string[],
    userId: string,
    minCount: number = 1
  ): Promise<void> {
    const db = getDatabase();
    const updates: Record<string, any> = {};
    const nowMin = Math.max(1, minCount);

    for (const roomId of roomIds) {
      updates[`unreadChats/${userId}/${roomId}`] = true;
      updates[`unreadCounts/${roomId}/${userId}`] = nowMin;
    }

    // ✅ SECURE UPDATE: Route batch unread updates through proxy
    await this.applySecuredBatchUpdates(updates);
  }

  async removeMarkAsUnread(roomId: string, userId: string): Promise<void> {
    const db = getDatabase();
    const updates: Record<string, any> = {};
    updates[`unreadChats/${userId}/${roomId}`] = null;
    updates[`unreadCounts/${roomId}/${userId}`] = 0;
    // ✅ SECURE UPDATE: Route unread clear updates through proxy
    await this.applySecuredBatchUpdates(updates);
  }

  async removeManyMarksAsUnread(
    roomIds: string[],
    userId: string
  ): Promise<void> {
    const db = getDatabase();
    const updates: Record<string, any> = {};
    for (const roomId of roomIds) {
      updates[`unreadChats/${userId}/${roomId}`] = null;
      updates[`unreadCounts/${roomId}/${userId}`] = 0;
    }
    // ✅ SECURE UPDATE: Route batch unread clear updates through proxy
    await this.applySecuredBatchUpdates(updates);
  }

  async getGroupDetails(groupId: string): Promise<{
    adminIds: string[];
    members: Array<Record<string, any>>;
  } | null> {
    try {
      if (!groupId) return null;
      const groupRef = ref(this.db, `groups/${groupId}`);
      const snap = await get(groupRef);
      if (!snap.exists()) return null;

      const groupData: any = snap.val() || {};

      // normalize adminIds (support array / object / single value)
      let adminIdsRaw = groupData.adminIds ?? groupData.adminIdsList ?? null;
      let adminIds: string[] = [];

      if (Array.isArray(adminIdsRaw)) {
        adminIds = adminIdsRaw.filter(Boolean).map((id) => String(id));
      } else if (adminIdsRaw && typeof adminIdsRaw === 'object') {
        // could be { "0": "78" } or { "78": true }
        const vals = Object.values(adminIdsRaw);
        // if values are booleans (true), fall back to keys
        const areValuesBoolean =
          vals.length && vals.every((v) => typeof v === 'boolean');
        if (areValuesBoolean) {
          adminIds = Object.keys(adminIdsRaw).map((k) => String(k));
        } else {
          adminIds = vals.filter(Boolean).map((v) => String(v));
        }
      } else if (adminIdsRaw !== null && adminIdsRaw !== undefined) {
        adminIds = [String(adminIdsRaw)];
      }

      // dedupe and return
      adminIds = Array.from(new Set(adminIds));

      // normalize members (object -> array of { user_id, ...data })
      const membersObj: Record<string, any> = groupData.members || {};
      const members = Object.keys(membersObj).map((userId) => ({
        user_id: String(userId),
        ...(membersObj[userId] || {}),
      }));

      return { adminIds, members };
    } catch (err) {
      console.error('getGroupDetails error', err);
      return null;
    }
  }

  /**
   * Get past members of a group
   */
  /**
   * Get past members of a group
   */
  async getPastMembers(groupId: string): Promise<
    Array<{
      user_id: string;
      username: string;
      phoneNumber: string;
      avatar?: string;
      isActive: boolean;
      removedAt: string;
    }>
  > {
    try {
      if (!groupId) {
        console.warn('getPastMembers: groupId is required');
        return [];
      }

      const pastMembersRef = rtdbRef(this.db, `groups/${groupId}/pastmembers`);
      const snapshot = await rtdbGet(pastMembersRef);

      if (!snapshot.exists()) {
        console.log(`No past members found for group ${groupId}`);
        return [];
      }

      const data = snapshot.val();
      const isWeb = this.isWeb();

      const pastMembers = await Promise.all(
        Object.keys(data).map(async (user_id) => {
          const memberData = data[user_id];

          const localUser = this._platformUsers$.value.find(
            (u) => u.userId == user_id
          );

          let profileResp: { profile: string | null } | null = null;

          if (isWeb || !localUser) {
            try {
              profileResp = await firstValueFrom(
                this.apiService.getUserProfilebyId(user_id)
              );
            } catch {}
          }

          const avatar =
            localUser?.avatar ??
            profileResp?.profile ??
            'assets/images/user.jfif';

          return {
            user_id,
            username: memberData.username || 'Unknown',
            phoneNumber: memberData.phoneNumber || '',
            avatar, // ✅ Avatar is now included
            isActive: memberData.isActive || false,
            removedAt: memberData.removedAt || '',
            ...memberData,
          };
        })
      );

      // Cache the complete data (including avatars) to PouchDB
      try {
        await this.chatPouchDb.cachePastMembers(groupId, pastMembers);
        console.log(
          `✅ Cached ${pastMembers.length} past members with avatars`
        );
      } catch (cacheErr) {
        console.warn('⚠️ Failed to cache past members:', cacheErr);
      }

      return pastMembers;
    } catch (error) {
      console.error('❌ Error loading past members:', error);

      // 🔥 FALLBACK: Try loading from cache if Firebase fails
      try {
        const cached = await this.chatPouchDb.getCachedPastMembers(groupId);
        if (cached.length > 0) {
          console.log(
            `✅ Loaded ${cached.length} past members from cache (fallback)`
          );
          return cached;
        }
      } catch (cacheErr) {
        console.warn('Cache fallback failed:', cacheErr);
      }

      return [];
    }
  }

  async addMembersToGroup(roomId: string, userIds: string[]) {
    try {
      const memberRef = rtdbRef(this.db, `groups/${roomId}/members`);
      const pastMemberRef = rtdbRef(this.db, `groups/${roomId}/pastmembers`);

      const memberSnap = await rtdbGet(memberRef);
      const pastMemberSnap = await rtdbGet(pastMemberRef);

      const members: IGroup['members'] = memberSnap.exists()
        ? memberSnap.val()
        : {};
      const pastMembers: IGroup['members'] = pastMemberSnap.exists()
        ? pastMemberSnap.val()
        : {};

      const groupSnap = await rtdbGet(rtdbRef(this.db, `groups/${roomId}`));
      const groupData = groupSnap.exists() ? groupSnap.val() : {};
      const now = Date.now();

      const updates: Record<string, any> = {};

      for (const userId of userIds) {
        // ✅ Try multiple sources for user info
        const user = this.currentUsers.find(
          (u) => String(u.userId) === String(userId)
        );

        let username = user?.username || '';
        // Backend intentionally omits phoneNumber for privacy.
        // Resolve from device contacts using device_contact_name as key.
        let phoneNumber = user?.phoneNumber || '';
        if (!phoneNumber && (user as any)?.device_contact_name) {
          const dcMatch = this.currentDeviceContacts.find(
            (dc: any) =>
              (dc.username || '').toLowerCase() ===
              ((user as any).device_contact_name as string).toLowerCase()
          );
          if (dcMatch?.phoneNumber) phoneNumber = dcMatch.phoneNumber;
        }

        // ✅ Fallback: fetch from API if still empty
        if (!username && !phoneNumber) {
          try {
            const profile: any = await firstValueFrom(
              this.apiService.getUserProfilebyId(userId)
            );
            username = profile?.name || '';
            phoneNumber = profile?.phone_number || '';
          } catch {
            console.warn(`Could not fetch profile for ${userId}`);
          }
        }

        // ✅ Add to members object
        updates[`groups/${roomId}/members/${userId}`] = {
          isActive: true,
          phoneNumber,
          username,
        };

        // ✅ Remove from pastmembers if present
        if (pastMembers && pastMembers[userId]) {
          updates[`groups/${roomId}/pastmembers/${userId}`] = null;
          console.log(`✅ Removed ${userId} from pastmembers`);
        }

        // ✅ Write full userchats metadata
        updates[`userchats/${userId}/${roomId}`] = {
          type: 'group',
          lastmessageAt: groupData.createdAt || now,
          lastmessageType: 'text',
          lastmessage: '',
          unreadCount: 0,
          isArchived: false,
          isPinned: false,
          isLocked: false,
          removedOrLeftAt: null,
        };
      }

      // ✅ Use rtdbUpdate instead of rtdbSet to avoid overwriting entire members node
      await this.chatBackendSocket.applySecuredBatchUpdates({ updates });

      // ✅ Update PouchDB cache
      try {
        const updatedMembers = { ...members };
        for (const userId of userIds) {
          const user = this.currentUsers.find(
            (u) => String(u.userId) === String(userId)
          );
          updatedMembers[userId] = {
            isActive: true,
            phoneNumber: user?.phoneNumber || '',
            username: user?.username || '',
          };
        }
        await this.chatPouchDb.updateGroupMembers(roomId, updatedMembers);
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB update failed:', cacheErr);
      }

      console.log(`✅ Added ${userIds.length} members to group ${roomId}`);
    } catch (error) {
      console.error('Error adding members in group', error);
      throw error;
    }
  }

  async removeMembersToGroup(roomId: string, userIds: string[]) {
    try {
      const now = Date.now();
      const memberRef = rtdbRef(this.db, `groups/${roomId}/members`);
      const pastMemberRef = rtdbRef(this.db, `groups/${roomId}/pastmembers`);

      // Fetch current members snapshot
      const snap = await rtdbGet(memberRef);
      const members: IGroup['members'] = snap.exists() ? snap.val() : {};

      if (!members || Object.keys(members).length === 0) {
        console.warn(`No members found for group ${roomId}`);
        return;
      }

      // Prepare updates
      const updates: Record<string, any> = {};

      for (const userId of userIds) {
        const member = members[userId];
        if (!member) {
          console.warn(`Member ${userId} not found in group ${roomId}`);
          continue;
        }

        // ✅ Remove from active members
        updates[`groups/${roomId}/members/${userId}`] = null;

        // ✅ Add to past members with removal timestamp
        updates[`groups/${roomId}/pastmembers/${userId}`] = {
          ...member,
          removedAt: new Date().toISOString(),
        };

        // ✅ Update userchats with removedOrLeftAt timestamp
        updates[`userchats/${userId}/${roomId}/removedOrLeftAt`] = now;
      }

      // Apply updates atomically
      await this.chatBackendSocket.applySecuredBatchUpdates({ updates });

      // 🔥 NEW: Update PouchDB
      try {
        const updatedMembers = { ...members };
        userIds.forEach((userId) => delete updatedMembers[userId]);
        await this.chatPouchDb.updateGroupMembers(roomId, updatedMembers);
        console.log('✅ Group members updated in PouchDB');
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB update failed:', cacheErr);
      }

      console.log(
        `✅ Successfully removed ${userIds.length} members from group ${roomId}`
      );
      console.log(`✅ Added removedOrLeftAt timestamp: ${now}`);
    } catch (error) {
      console.error('❌ Error removing members from group:', error);
      throw error;
    }
  }

  async getBackendGroupId(firebaseGroupId: string): Promise<number | null> {
    try {
      const db = getDatabase();
      const groupRef = ref(db, `groups/${firebaseGroupId}/backendGroupId`);
      const snapshot = await get(groupRef);
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      console.error('Error getting backend group ID:', error);
      return null;
    }
  }

  async exitGroup(roomId: string, userIds: string[]) {
    try {
      const now = Date.now();
      const memberRef = rtdbRef(this.db, `groups/${roomId}/members`);

      // Fetch current members snapshot
      const snap = await rtdbGet(memberRef);
      const members: IGroup['members'] = snap.exists() ? snap.val() : {};

      if (!members || Object.keys(members).length === 0) {
        console.warn(`No members found for group ${roomId}`);
        return;
      }

      // Prepare updates
      const updates: Record<string, any> = {};

      for (const userId of userIds) {
        const member = members[userId];
        if (!member) {
          console.warn(`Member ${userId} not found in group ${roomId}`);
          continue;
        }

        // Remove from members (set to null to delete)
        updates[`groups/${roomId}/members/${userId}`] = null;

        // Add to pastmembers with removedAt timestamp
        updates[`groups/${roomId}/pastmembers/${userId}`] = {
          ...member,
          removedAt: new Date().toISOString(),
        };

        // Add timestamp to userchats for message filtering
        updates[`userchats/${userId}/${roomId}/removedOrLeftAt`] = now;
      }

      // Apply updates atomically
      await this.chatBackendSocket.applySecuredBatchUpdates({ updates });

      // 🔥 NEW: Update PouchDB
      try {
        const updatedMembers = { ...members };
        userIds.forEach((userId) => delete updatedMembers[userId]);
        await this.chatPouchDb.updateGroupMembers(roomId, updatedMembers);

        // If current user is exiting, delete conversation from cache
        // if (userIds.includes(this.senderId as string)) {
        //   await this.chatPouchDb.deleteConversation(
        //     this.senderId as string,
        //     roomId
        //   );
        // }

        console.log('✅ Group exit cached to PouchDB');
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB update failed:', cacheErr);
      }

      console.log(
        `✅ Successfully exited ${userIds.length} members from group ${roomId}`
      );
    } catch (error) {
      console.error('❌ Error exiting group:', error);
      throw error;
    }
  }

  // =====================
  // ===== DELETIONS =====
  // Message / Chat / Group deletions (soft/hard)
  // =====================

  //this function is new
  async deleteMessage(msgId: string, forEveryone: boolean = true) {
    try {
      if (!this.currentChat?.roomId) return;
      const targetRoomId = this.currentChat.roomId;

      await this.chatBackendSocket.deleteMessage({
        roomId: targetRoomId,
        msgId,
        forEveryone
      });

      // 🔥 NEW: Update PouchDB optimistically
      try {
        const localMsg = await this.chatPouchDb.getMessageById(targetRoomId, msgId);
        if (localMsg) {
          let deletedForData: { everyone: boolean; users: string[] };
          if (forEveryone) {
            deletedForData = {
              everyone: true,
              users: localMsg.deletedFor?.users || [],
            };
          } else {
            deletedForData = {
              everyone: !!localMsg.deletedFor?.everyone,
              users: [...(localMsg.deletedFor?.users || []), this.senderId as string],
            };
          }

          await this.chatPouchDb.updateMessage(targetRoomId, msgId, { deletedFor: deletedForData } as any);
          console.log('✅ Message deletion optimistically cached to PouchDB');
        }
      } catch (cacheErr) {
        console.warn('⚠️ PouchDB update failed:', cacheErr);
      }
    } catch (error) {
      console.error('❌ Error deleting message:', error);
      throw error;
    }
  }

  /**
   * 🔥 Delete messages and update last message in userchats
   */
  async deleteMessagesWithLastMessageUpdate(
    messagesToDelete: IMessage[],
    roomId: string,
    senderId: string,
    receiverId: string,
    deleteForEveryone: boolean
  ): Promise<void> {
    try {
      const db = getDatabase();

      console.group('🗑️ DELETE MESSAGES WITH LAST MESSAGE UPDATE');
      console.log('Messages to delete:', messagesToDelete.length);
      console.log('Room ID:', roomId);
      console.log('Sender ID:', senderId);
      console.log('Receiver ID:', receiverId);
      console.log('Delete for everyone:', deleteForEveryone);

      // Guard: restrict delete-for-everyone to sender-only messages
      const allMine = messagesToDelete.every(
        (m) =>
          String((m as any).sender) === String(senderId) ||
          (m as any).isMe === true
      );
      if (deleteForEveryone && !allMine) {
        console.warn(
          'Delete for everyone requested but selection contains non-sender messages. Falling back to delete-for-me.'
        );
      }
      const effectiveDeleteForEveryone = deleteForEveryone && allMine;

      // ✅ Step 1: Get current last message timestamps from userchats
      const senderLastMsgAt = await this.getLastMessageAtFromUserchats(
        senderId,
        roomId
      );
      const receiverLastMsgAt = effectiveDeleteForEveryone
        ? await this.getLastMessageAtFromUserchats(receiverId, roomId)
        : null;

      console.log('Sender lastMessageAt from userchats:', senderLastMsgAt);
      if (effectiveDeleteForEveryone) {
        console.log(
          'Receiver lastMessageAt from userchats:',
          receiverLastMsgAt
        );
      }

      // ✅ Step 2: Check if any selected message is the last message
      const senderHasLastMessage = messagesToDelete.some((msg) => {
        const msgTs = this.normalizeTs(msg.timestamp);
        const match = msgTs === senderLastMsgAt;
        if (match) {
          console.log(`✓ Sender last message found: ${msg.msgId}`);
        }
        return match;
      });

      const receiverHasLastMessage = effectiveDeleteForEveryone && senderHasLastMessage;

      console.log('Sender has last message:', senderHasLastMessage);
      console.log('Receiver has last message (derived from sender):', receiverHasLastMessage);

      // ✅ Step 3: Get the HIGHEST timestamp from selected messages
      // (We need the message just above this timestamp)
      const selectedTimestamps = messagesToDelete.map((m) =>
        this.normalizeTs(m.timestamp)
      );
      const highestSelectedTs = Math.max(...selectedTimestamps);
      console.log('Highest selected message timestamp:', highestSelectedTs);
      console.log('All selected timestamps:', selectedTimestamps);

      // ✅ Step 4: Delete each message
      for (const msg of messagesToDelete) {
        const key = msg.msgId;
        if (!key) continue;

        console.log(`Deleting message: ${key}`);
        if (effectiveDeleteForEveryone) {
          await this.deleteMessage(key, true);
        } else {
          await this.deleteMessage(key, false);
        }
      }

      let freshSenderLastMsgAt = 0;
      if (senderHasLastMessage || receiverHasLastMessage) {
        freshSenderLastMsgAt = await this.getLastMessageAtFromUserchats(senderId, roomId);
      }
      const newerMsgExistsAfterDelete =
        freshSenderLastMsgAt > 0 && freshSenderLastMsgAt > highestSelectedTs;

      if (newerMsgExistsAfterDelete) {
        console.log(
          '⏭️ New message sent during delete — skipping preview update to avoid overwriting newer lastmessage'
        );
        console.groupEnd();
        return;
      }

      // For sender - update only if sender's last message was in deleted messages
      if (senderHasLastMessage) {
        console.log('🔄 Sender last message was deleted, updating...');
        if (deleteForEveryone) {
          const placeholder = {
            msgId: 'deleted-placeholder',
            text: 'This message was deleted',
            type: 'text',
            timestamp: highestSelectedTs,
          } as any;
          await this.updateUserChatLastMessage(
            senderId,
            roomId,
            placeholder,
            'sender'
          );
          await this.updateLastMessageInCache(roomId, senderId, placeholder);
        } else {
          const newLastMessage = await this.getMessageJustAbove(
            roomId,
            senderId,
            highestSelectedTs
          );
          await this.updateUserChatLastMessage(
            senderId,
            roomId,
            newLastMessage,
            'sender'
          );
          await this.updateLastMessageInCache(roomId, senderId, newLastMessage);
        }
      } else {
        console.log('⏭️ Sender last message NOT deleted - no update needed');
      }

      // For receiver - update only if receiver's last message was in deleted messages
      if (effectiveDeleteForEveryone && receiverHasLastMessage) {
        console.log('🔄 Receiver last message was deleted, updating...');
        const placeholder = {
          msgId: 'deleted-placeholder',
          text: 'This message was deleted',
          type: 'text',
          timestamp: highestSelectedTs,
        } as any;
        await this.updateUserChatLastMessage(
          receiverId as any,
          roomId,
          placeholder,
          'receiver'
        );
        await this.updateLastMessageInCache(
          roomId,
          receiverId as any,
          placeholder
        );
      } else if (effectiveDeleteForEveryone) {
        console.log('⏭️ Receiver last message NOT deleted - no update needed');
      }

      console.log('✅ Messages deleted and last message updated successfully');
      console.groupEnd();
    } catch (error) {
      console.error('❌ Error in deleteMessagesWithLastMessageUpdate:', error);
      console.groupEnd();
      throw error;
    }
  }

  /**
   * 🔥 Get lastmessageAt from userchats/{userId}/{roomId}
   */
  private async getLastMessageAtFromUserchats(
    userId: string,
    roomId: string
  ): Promise<number> {
    try {
      const snapshot = await rtdbGet(
        rtdbRef(this.db, `userchats/${userId}/${roomId}`)
      );

      if (!snapshot.exists()) {
        console.warn(`⚠️ No userchat found for ${userId}/${roomId}`);
        return 0;
      }

      const data = snapshot.val();
      const lastmessageAt = data?.lastmessageAt;

      return this.normalizeTs(lastmessageAt);
    } catch (error) {
      console.error('Error getting lastmessageAt from userchats:', error);
      return 0;
    }
  }

  private async getMessageJustAbove(
    roomId: string,
    userId: string,
    aboveTimestamp: number
  ): Promise<IMessage | null> {
    try {
      console.group('🔍 FINDING MESSAGE JUST ABOVE');
      console.log('Looking for messages with timestamp <', aboveTimestamp);

      // ✅ OPTIMIZED: Use Firebase query with timestamp index
      const messagesRef = rtdbRef(this.db, `chats/${roomId}`);

      // Get the message just before the deleted timestamp
      const q = query(
        messagesRef,
        orderByChild('timestamp'),
        endAt(aboveTimestamp - 1),
        limitToLast(1)
      );

      const snapshot = await rtdbGet(q);

      if (!snapshot.exists()) {
        console.log('⚠️ No messages found below deleted timestamp');
        console.groupEnd();
        return null;
      }

      const data = snapshot.val();
      const messages: IMessage[] = Object.values(data);

      console.log('Valid messages found:', messages.length);

      // Check if message is visible to user
      const validMessage = messages.find((msg) =>
        this.isMessageVisible(msg, userId)
      );

      if (validMessage) {
        console.log('✓ New last message:', {
          msgId: validMessage.msgId,
          timestamp: this.normalizeTs(validMessage.timestamp),
          text: validMessage.text?.substring(0, 50) || `[${validMessage.type}]`,
        });
      } else {
        console.log('⚠️ No valid message found - conversation will be empty');
      }

      console.groupEnd();
      return validMessage || null;
    } catch (error) {
      console.error('Error getting message just above:', error);
      console.groupEnd();
      return null;
    }
  }

  /**
   * ✅ Normalize timestamp to milliseconds
   */
  private normalizeTs(ts: string | number | Date | undefined | null): number {
    if (!ts) return 0;

    if (typeof ts === 'number') {
      // Handle seconds vs milliseconds
      // Timestamps before year 2000 in milliseconds are likely in seconds
      return ts < 10000000000 ? ts * 1000 : ts;
    }

    if (typeof ts === 'string') {
      const parsed = new Date(ts);
      if (isNaN(parsed.getTime())) {
        console.warn('⚠️ Invalid date string:', ts);
        return 0;
      }
      return parsed.getTime();
    }

    if (ts instanceof Date) {
      return ts.getTime();
    }

    return 0;
  }

  /**
   * ✅ Check if message is visible to user
   */
  private isMessageVisible(msg: IMessage, userId: string): boolean {
    // Blocked messages should not be visible to blocked receiver.
    if (msg.blockedSend === true && msg.sender !== userId) {
      return false;
    }

    // No deletion info: visible
    if (!msg.deletedFor) return true;

    // Show globally deleted messages so the placeholder can render
    if ((msg as any)?.deletedFor?.everyone === true) return true;

    // Hide only if this user is explicitly in the deleted-for-users list
    if (Array.isArray((msg as any)?.deletedFor?.users)) {
      return !(msg as any).deletedFor.users.includes(userId);
    }

    return true;
  }

  /**
   * ✅ Update userchats last message
   */
  private async updateUserChatLastMessage(
    userId: string,
    roomId: string,
    lastMessage: IMessage | null,
    updateType: 'sender' | 'receiver' | 'both'
  ): Promise<void> {
    const db = getDatabase();
    const userChatPath = `userchats/${userId}/${roomId}`;

    if (!lastMessage) {
      console.log(`📝 Clearing last message for user: ${userId}`);
      const ts = this.normalizeTs(new Date().toISOString());
      await this.applySecuredBatchUpdates({
        [`userchats/${userId}/${roomId}/lastmessage`]: '',
        [`userchats/${userId}/${roomId}/lastmessageType`]: 'text',
        [`userchats/${userId}/${roomId}/lastmessageAt`]: 0,
        [`userchats/${userId}/${roomId}/updatedAt`]: ts,
      });
      return;
    }

    const lastmessageAt = this.normalizeTs(lastMessage.timestamp);

    console.log(`📝 Updating userchats for user: ${userId}`, {
      msgId: lastMessage.msgId,
      lastmessageAt,
      preview: this.getMessagePreviewText(lastMessage).substring(0, 30),
    });

    const previewText = this.getMessagePreviewText(lastMessage);
    await this.applySecuredBatchUpdates({
      [`userchats/${userId}/${roomId}/lastmessage`]: previewText,
      [`userchats/${userId}/${roomId}/lastmessageType`]: lastMessage.type,
      [`userchats/${userId}/${roomId}/lastmessageAt`]: lastmessageAt,
    });
  }

  /**
   * ✅ Update PouchDB cache
   */
  private async updateLastMessageInCache(
    roomId: string,
    userId: string,
    newLastMessage: IMessage | null
  ): Promise<void> {
    const lastMessageText = this.getMessagePreviewText(newLastMessage);
    const lastMessageAt = newLastMessage
      ? this.normalizeTs(newLastMessage.timestamp)
      : 0;

    console.log(`💾 Updating PouchDB cache for user: ${userId}`, {
      roomId,
      lastMessageText: lastMessageText.substring(0, 30),
      lastMessageAt,
    });

    await this.chatPouchDb.updateConversationLastMessage(
      userId,
      roomId,
      lastMessageText,
      newLastMessage?.type || 'text',
      lastMessageAt
    );
  }

  /**
   * ✅ Get message preview text
   */
  private getMessagePreviewText(msg: IMessage | null): string {
    if (!msg) return '';

    if (msg.text && msg.text.trim()) {
      return msg.text;
    }

    switch (msg.type) {
      case 'image':
        return '📷 Photo';
      case 'video':
        return '🎥 Video';
      case 'audio':
        return '🎵 Audio';
      case 'pdf':
        return '📄 Document';
      default:
        return '📎 Attachment';
    }
  }

  // for deleteion in local on background

  /**
   * 🔥 Method 1: Initialize Background Deletion Sync
   * Call this from app.component.ts after login
   */
  async initializeBackgroundDeletionSync(userId: string) {
    try {
      console.log('🚀 [BG Sync] Initializing background deletion sync...');

      // Get all active conversations from PouchDB
      const conversations = await this.chatPouchDb.getAllConversations();

      // Setup listeners for each conversation
      for (const conv of conversations) {
        await this.setupBackgroundDeletionListener(conv.roomId, userId);
      }

      console.log(`✅ [BG Sync] Initialized for ${conversations.length} chats`);
    } catch (error) {
      console.error('❌ [BG Sync] Initialization failed:', error);
    }
  }

  /**
   * 🔥 Method 2: Setup Background Deletion Listener for a Room
   */
  private async setupBackgroundDeletionListener(
    roomId: string,
    userId: string
  ) {
    // Skip if listener already exists
    if (this.backgroundDeletionListeners.has(roomId)) {
      return;
    }

    const db = getDatabase();
    const messagesRef = ref(db, `chats/${roomId}`);

    // Listen for CHANGED messages (deletedFor updates)
    const onChangedUnsubscribe = onChildChanged(
      messagesRef,
      async (snapshot) => {
        await this.handleBackgroundDeletion(snapshot, roomId, userId);
      }
    );

    // Listen for REMOVED messages (complete deletion)
    const onRemovedUnsubscribe = onChildRemoved(
      messagesRef,
      async (snapshot) => {
        await this.handleBackgroundRemoval(snapshot, roomId, userId);
      }
    );

    // Store cleanup function
    this.backgroundDeletionListeners.set(roomId, () => {
      onChangedUnsubscribe();
      onRemovedUnsubscribe();
    });

    console.log(`🎧 [BG Sync] Listener active for: ${roomId}`);
  }

  /**
   * 🔥 Method 3: Handle Background Deletion
   */
  // private async handleBackgroundDeletion(
  //   snapshot: any,
  //   roomId: string,
  //   userId: string
  // ) {
  //   const msgId = snapshot.key;
  //   const messageData = snapshot.val();

  //   // Only process if deleted for everyone
  //   if (messageData?.deletedFor?.everyone !== true) {
  //     return;
  //   }

  //   console.log(`🗑️ [BG Sync] Deletion detected: ${msgId} in ${roomId}`);

  //   if (this.networkService.isOnline.value) {
  //     await this.syncBackgroundDeletionToLocal(roomId, msgId, userId, messageData);
  //     this._recentEveryoneDeletes.add(msgId);
  //     await this.refreshCurrentRoomMessages(roomId);
  //     setTimeout(async () => {
  //       this._recentEveryoneDeletes.delete(msgId);
  //       await this.refreshCurrentRoomMessages(roomId);
  //     }, 1300);
  //   } else {
  //     this.queueDeletionForOfflineSync(roomId, msgId, messageData);
  //   }
  // }
  private async handleBackgroundDeletion(
    snapshot: any,
    roomId: string,
    userId: string
  ) {
    const msgId = snapshot.key;
    const messageData = snapshot.val();

    if (messageData?.deletedFor?.everyone !== true) return;

    console.log(`🗑️ [BG Sync] Deletion detected: ${msgId} in ${roomId}`);

    // If this room is currently open, changedHandler + updateMessageLocally already owns
    // the UI animation and PouchDB update with decrypted text. Running
    // refreshCurrentRoomMessages here races with it and causes an empty bubble
    // (raw/encrypted PouchDB text rendered during the uiHoldEveryone phase).
    if (this.currentChat?.roomId === roomId) {
      // Only silently sync PouchDB — let changedHandler own the UI.
      try {
        await this.chatPouchDb.updateMessageDeletionStatus(
          roomId, msgId, true, messageData.deletedFor?.users || []
        );
      } catch (e) {}
      return;
    }

    if (this.networkService.isOnline.value) {
      await this.syncBackgroundDeletionToLocal(
        roomId,
        msgId,
        userId,
        messageData
      );

      // Phase 1: mark as "animating" and show fade-out
      this._recentEveryoneDeletes.add(msgId);
      await this.refreshCurrentRoomMessages(roomId);

      // Phase 2: after animation, mark as "completed" so placeholder stays
      setTimeout(async () => {
        this._recentEveryoneDeletes.delete(msgId);
        this._animationCompletedDeletes.add(msgId); // ← MARK ANIMATION DONE
        await this.refreshCurrentRoomMessages(roomId);
      }, 1300);
    } else {
      this.queueDeletionForOfflineSync(roomId, msgId, messageData);
    }
  }
  /**
   * 🔥 Method 4: Handle Background Removal
   */
  private async handleBackgroundRemoval(
    snapshot: any,
    roomId: string,
    userId: string
  ) {
    const msgId = snapshot.key;
    console.log(`🗑️ [BG Sync] Removal detected: ${msgId} in ${roomId}`);

    if (this.networkService.isOnline.value) {
      await this.removeMessageFromLocalCache(roomId, msgId, userId);
    } else {
      this.queueRemovalForOfflineSync(roomId, msgId);
    }
  }

  /**
   * 🔥 Method 5: Sync Background Deletion to Local
   */
  private async syncBackgroundDeletionToLocal(
    roomId: string,
    msgId: string,
    userId: string,
    messageData: any
  ) {
    try {
      console.log(`📥 [BG Sync] Syncing deletion: ${msgId}`);

      // ✅ Update PouchDB using your new method
      await this.chatPouchDb.updateMessageDeletionStatus(
        roomId,
        msgId,
        true,
        messageData.deletedFor?.users || []
      );

      // ✅ Update last message if needed
      await this.updateLastMessageAfterDeletion(roomId, msgId, userId);

      // ✅ Refresh if room is currently open
      if (this.currentChat?.roomId === roomId) {
        await this.refreshCurrentRoomMessages(roomId);
      }

      console.log(`✅ [BG Sync] Deletion synced: ${msgId}`);
    } catch (error) {
      console.error('❌ [BG Sync] Sync failed:', error);
    }
  }

  /**
   * 🔥 Method 6: Remove Message from Local Cache
   */
  private async removeMessageFromLocalCache(
    roomId: string,
    msgId: string,
    userId: string
  ) {
    try {
      console.log(`🗑️ [BG Sync] Removing from cache: ${msgId}`);

      // Remove from PouchDB using your new method
      await this.chatPouchDb.removeMessageFromCache(roomId, msgId);

      // Update last message
      await this.updateLastMessageAfterDeletion(roomId, msgId, userId);

      // Refresh if room is open
      if (this.currentChat?.roomId === roomId) {
        await this.refreshCurrentRoomMessages(roomId);
      }

      console.log(`✅ [BG Sync] Removed from cache: ${msgId}`);
    } catch (error) {
      console.error('❌ [BG Sync] Removal failed:', error);
    }
  }

  private async updateLastMessageAfterDeletion(
    roomId: string,
    deletedMsgId: string,
    userId: string
  ) {
    try {
      const conversation = await this.chatPouchDb.getCachedConversation(roomId);

      if (!conversation) return;

      // Check if deleted message was the last message
      const isLastMessage =
        conversation.lastMessage &&
        typeof conversation.lastMessage === 'object' &&
        (conversation.lastMessage as any).msgId === deletedMsgId;

      if (!isLastMessage) return;

      // Set last message preview to deleted tag for everyone
      const ts =
        typeof (conversation as any).lastMessageAt === 'number'
          ? (conversation as any).lastMessageAt
          : (conversation as any).timestamp || Date.now();

      await this.chatPouchDb.updateConversationAfterDeletion(userId, roomId, {
        text: 'This message was deleted',
        type: 'text',
        timestamp: ts,
        msgId: deletedMsgId,
      });

      const allConversations = this._conversations$.value;
      const updatedList = allConversations.map((conv) => {
        if (conv.roomId === roomId) {
          return {
            ...conv,
            lastMessage: 'This message was deleted',
            lastMessageType: 'text',
            lastMessageAt: new Date(ts),
            timestamp: ts,
          };
        }
        return conv;
      });

      this._conversations$.next(updatedList);
    } catch (err) {
      console.error('❌ Hybrid last message update failed', err);
    }
  }

  /**
   * 🔥 Get last visible message from Firebase (PRIMARY)
   */
  private async getLastVisibleMessageFromFirebase(
    roomId: string,
    userId: string
  ): Promise<IMessage | null> {
    try {
      const messagesRef = rtdbRef(this.db, `chats/${roomId}`);

      const q = query(
        messagesRef,
        orderByChild('timestamp'),
        limitToLast(30) // safe window
      );

      const snapshot = await rtdbGet(q);
      if (!snapshot.exists()) return null;

      const messages: IMessage[] = Object.values(snapshot.val());

      const visible = messages
        .filter((msg) => this.isMessageVisible(msg, userId))
        .sort(
          (a, b) =>
            this.normalizeTs(b.timestamp) - this.normalizeTs(a.timestamp)
        );

      return visible[0] || null;
    } catch (err) {
      console.warn('⚠️ Firebase last message fetch failed', err);
      return null;
    }
  }

  /**
   * 🔥 Method 8: Refresh Current Room Messages
   */
  // private async refreshCurrentRoomMessages(roomId: string) {
  //   try {
  //     // Get fresh messages from PouchDB
  //     const cachedMessages = await this.chatPouchDb.getMessages(roomId);

  //     // Preserve any existing UI flags (fade / uiHoldEveryone) already applied in-memory
  //     const existingList = this._messages$.value.get(roomId) || [];
  //     const existingFlags = new Map<
  //       string,
  //       { uiHoldEveryone?: boolean; fadeOut?: boolean }
  //     >(
  //       existingList.map((m: any) => [
  //         m.msgId as string,
  //         {
  //           uiHoldEveryone: m.uiHoldEveryone,
  //           fadeOut: m.fadeOut,
  //         },
  //       ])
  //     );

  //     // Include globally deleted for placeholder; hide only per-user deletions
  //     const visibleMessages = cachedMessages
  //       .filter((msg) => {
  //         if (
  //           msg.deletedFor?.users?.includes(
  //             this.authService.authData?.userId as string
  //           )
  //         )
  //           return false;
  //         return true;
  //       })
  //       .map((m) => {
  //         const key = m.msgId as string;
  //         const flags = existingFlags.get(key);

  //         // If we already have UI flags for this message in memory, keep them
  //         if (
  //           flags &&
  //           (flags.uiHoldEveryone !== undefined || flags.fadeOut !== undefined)
  //         ) {
  //           return { ...(m as any), ...flags };
  //         }

  //         // For fresh loads (e.g. app restart), optionally play the fade animation
  //         if (
  //           m.deletedFor?.everyone &&
  //           this._recentEveryoneDeletes.has(key)
  //         ) {
  //           return { ...(m as any), uiHoldEveryone: true, fadeOut: true };
  //         }

  //         return m;
  //       });

  //     // Update BehaviorSubject
  //     const messagesMap = this._messages$.value;
  //     messagesMap.set(roomId, visibleMessages);
  //     this._messages$.next(messagesMap);

  //     console.log(`✅ [BG Sync] Room refreshed: ${roomId}`);
  //   } catch (error) {
  //     console.error('❌ [BG Sync] Room refresh failed:', error);
  //   }
  // }
  private async refreshCurrentRoomMessages(roomId: string) {
    try {
      const cachedMessages = await this.chatPouchDb.getMessages(roomId);

      const existingList = this._messages$.value.get(roomId) || [];
      const existingFlags = new Map<
        string,
        { uiHoldEveryone?: boolean; fadeOut?: boolean }
      >(
        existingList.map((m: any) => [
          m.msgId as string,
          { uiHoldEveryone: m.uiHoldEveryone, fadeOut: m.fadeOut },
        ])
      );

      const visibleMessages = cachedMessages
        .filter((msg) => {
          if (
            msg.deletedFor?.users?.includes(
              this.authService.authData?.userId as string
            )
          )
            return false;
          return true;
        })
        .map((m) => {
          const key = m.msgId as string;

          // ✅ Animation fully done — show placeholder directly, no animation
          if (this._animationCompletedDeletes.has(key)) {
            return { ...(m as any), uiHoldEveryone: false, fadeOut: false };
          }

          // ✅ Animation still in progress — preserve fade-out
          if (m.deletedFor?.everyone && this._recentEveryoneDeletes.has(key)) {
            return { ...(m as any), uiHoldEveryone: true, fadeOut: true };
          }

          // ✅ For all other messages: use existing in-memory flags if present,
          //    but ONLY if the message is not a completed delete
          const flags = existingFlags.get(key);
          if (
            flags &&
            (flags.uiHoldEveryone !== undefined || flags.fadeOut !== undefined)
          ) {
            // Don't propagate stale uiHoldEveryone:true for non-recent, non-completed deletes
            if (m.deletedFor?.everyone && flags.uiHoldEveryone === true) {
              // Animation was interrupted or stale — show placeholder
              return { ...(m as any), uiHoldEveryone: false, fadeOut: false };
            }
            return { ...(m as any), ...flags };
          }

          return m;
        });

      const messagesMap = new Map(this._messages$.value);
      messagesMap.set(roomId, visibleMessages);
      this._messages$.next(new Map(messagesMap));

      console.log(`✅ [BG Sync] Room refreshed: ${roomId}`);
    } catch (error) {
      console.error('❌ [BG Sync] Room refresh failed:', error);
    }
  }
  /**
   * 🔥 Method 9: Queue Methods for Offline
   */
  private queueDeletionForOfflineSync(
    roomId: string,
    msgId: string,
    messageData: any
  ) {
    if (!this.pendingOfflineDeletes.has(roomId)) {
      this.pendingOfflineDeletes.set(roomId, []);
    }

    this.pendingOfflineDeletes.get(roomId)!.push({
      msgId,
      messageData,
      action: 'delete',
      timestamp: Date.now(),
    });

    console.log(`📦 [BG Sync] Queued deletion: ${msgId}`);
  }

  private queueRemovalForOfflineSync(roomId: string, msgId: string) {
    if (!this.pendingOfflineDeletes.has(roomId)) {
      this.pendingOfflineDeletes.set(roomId, []);
    }

    this.pendingOfflineDeletes.get(roomId)!.push({
      msgId,
      action: 'remove',
      timestamp: Date.now(),
    });

    console.log(`📦 [BG Sync] Queued removal: ${msgId}`);
  }

  /**
   * 🔥 Method 10: Initialize Offline Delete Sync
   */
  private initializeOfflineDeleteSync() {
    this.networkService.isOnline.subscribe(async (isOnline) => {
      if (isOnline && this.pendingOfflineDeletes.size > 0) {
        console.log(
          `🌐 [BG Sync] Processing ${this.pendingOfflineDeletes.size} offline deletions`
        );
        await this.processOfflineDeletions();
      }
    });
  }

  /**
   * 🔥 Method 11: Process Offline Deletions
   */
  private async processOfflineDeletions() {
    const userId = this.authService.authData?.userId || '';

    for (const [roomId, deletions] of this.pendingOfflineDeletes.entries()) {
      for (const deletion of deletions) {
        try {
          if (deletion.action === 'delete') {
            await this.syncBackgroundDeletionToLocal(
              roomId,
              deletion.msgId,
              userId,
              deletion.messageData
            );
          } else if (deletion.action === 'remove') {
            await this.removeMessageFromLocalCache(
              roomId,
              deletion.msgId,
              userId
            );
          }

          console.log(
            `✅ [BG Sync] Processed offline deletion: ${deletion.msgId}`
          );
        } catch (error) {
          console.error(`❌ [BG Sync] Failed to process:`, error);
        }
      }
    }

    this.pendingOfflineDeletes.clear();
    console.log(`✅ [BG Sync] All offline deletions processed`);
  }

  /**
   * 🔥 Method 12: Cleanup Background Listeners
   */
  cleanupBackgroundListeners() {
    console.log('🧹 [BG Sync] Cleaning up listeners');

    for (const [
      roomId,
      unsubscribe,
    ] of this.backgroundDeletionListeners.entries()) {
      try {
        unsubscribe();
        console.log(`✅ [BG Sync] Cleaned up: ${roomId}`);
      } catch (error) {
        console.warn(`⚠️ [BG Sync] Cleanup error for ${roomId}:`, error);
      }
    }

    this.backgroundDeletionListeners.clear();
  }

  async updateLastMessageInMeta(msg: IMessage & { attachment: IAttachment }) {
    // This is now handled entirely by the backend socket service on 'sendMessage'.
    // Direct RTDB writes from the client are deprecated for security.
    console.log('ℹ️ updateLastMessageInMeta called - skipping direct RTDB write (backend authoritative).');
  }

  /**
   * Refactored deleteMessageForMe to use backend socket
   */
  async deleteMessageForMe(roomId: string, msgId: string): Promise<void> {
    await this.chatBackendSocket.deleteMessage({ roomId, msgId });
  }

  /**
   * Refactored deleteMessageForEveryone to use backend socket
   */
  async deleteMessageForEveryone(roomId: string, msgId: string): Promise<void> {
    await this.chatBackendSocket.deleteMessage({ roomId, msgId, forEveryone: true });
  }

  /**
   * Refactored deleteChatForUser (Clear for me) to use backend socket
   */
  async deleteChatForUser(roomId: string): Promise<void> {
    await this.chatBackendSocket.clearChatForMe(roomId);
  }

  /**
   * Refactored deleteChatPermanently (Global clear) to use backend socket
   */
  async deleteChatPermanently(roomId: string): Promise<void> {
    await this.chatBackendSocket.clearChat(roomId);
  }

  //new delete chats functions

  async deleteChats(roomIds: string[]): Promise<void> {
    try {
      if (!this.senderId) {
        throw new Error('senderId not set');
      }

      if (!Array.isArray(roomIds) || roomIds.length === 0) {
        console.error('RoomIds is not an array or empty');
        return;
      }

      // 🔥 NEW: DELEGATE TO BACKEND TO AVOID CLIENT OOM FOR LARGE CHATS
      // This will zero unreadCounts, nullify userchats, and invoke softDeleteAll
      await this.chatBackendSocket.deleteChatsForMe({ roomIds });

      // 🔥 NEW: Update PouchDB
      for (const roomId of roomIds) {
        try {
          await this.chatPouchDb.deleteConversation(
            this.senderId as string,
            roomId
          );
        } catch (cacheErr) {
          console.warn(`⚠️ PouchDB delete failed for ${roomId}:`, cacheErr);
        }
      }

      const existingConvs = this._conversations$.value.filter(
        (c) => !roomIds.includes(c.roomId)
      );
      this._conversations$.next(existingConvs);
    } catch (error) {
      console.error('❌ Error deleting chats:', error);
      throw error;
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    try {
      if (!groupId) throw new Error('groupId is required');
      
      // ✅ Perform a soft delete for the current user (removes from view & marks messages deleted)
      await this.deleteChats([groupId]);

      const existingConvs = this._conversations$.value.filter((c) => c.roomId !== groupId);
      this._conversations$.next(existingConvs);

      const messageMap = new Map(this._messages$.value);
      messageMap.delete(groupId);
      this._messages$.next(messageMap);
    } catch (error) {
      console.error('❌ Error deleting group:', error);
      throw error;
    }
  }

  async softDeleteChannelPosts(channelId: number | string): Promise<void> {
    try {
      if (!channelId) return;
      await this.chatBackendSocket.deleteChannelPosts({ channelId });
    } catch (error) {
      console.error('❌ Error soft deleting channel posts:', error);
      throw error;
    }
  }

    async sendMessageDirectly(
    msg: Partial<IMessage & { attachment?: any }>,
    receiverId: string
  ): Promise<void> {
    try {
      console.log('this message is called', msg.attachment);
      const { attachment, translations, ...message } = msg || {};
      const { localUrl, ...restAttachment } = attachment || { localUrl: null };
      const hasAttachment = !!attachment && Object.keys(restAttachment || {}).length > 0;

      // const roomId = this.getRoomIdFor1To1(this.senderId as string, receiverId);
      const roomId = this.getCanonicalRoomId(
        this.senderId as string,
        receiverId
      );
      const members = [this.senderId, receiverId];

      // Encrypt text
      const encryptedText = await this.encryptionService.encrypt(
        msg.text as string
      );

      // ✅ 1. BLOCK CHECK (Check if receiver has blocked current user)
      let isBlockedByReceiver = false;
      if (receiverId && this.senderId && receiverId !== this.senderId) {
        isBlockedByReceiver = await this.isUserBlockedBy(
          receiverId,
          this.senderId
        );
      }

      // ✅ 2. CDN URL FETCHING (needed for socket payload)
      let cdnUrl = '';
      if (hasAttachment && restAttachment.mediaId) {
        const res: any = await firstValueFrom(
          this.apiService.getDownloadUrl(restAttachment.mediaId)
        );
        cdnUrl = res?.status ? res.downloadUrl : '';
      }

      // Build the canonical message payload for RTDB
      const messagePayload: Record<string, any> = {
        ...message,
        ...(hasAttachment ? { attachment: { ...restAttachment, cdnUrl } } : {}),
        text: encryptedText,
        ...(translations ? { translations } : {}),
        ...(msg.channel_invite ? { channel_invite: msg.channel_invite } : {}),
        blockedSend: isBlockedByReceiver,
      };

      // ✅ 3. SOCKET SEND — best-effort real-time delivery only.
      // The participant check on the backend may fail for brand-new private rooms,
      // so we never let this throw and abort the reliable write path below.
      try {
        await this.chatBackendSocket.sendMessage({
          roomId,
          msgId: message.msgId as string,
          content: encryptedText || '',
          type: hasAttachment && restAttachment.type ? restAttachment.type : ((message.type as string) || 'text'),
          replyToMsgId: (message.replyToMsgId as string) || '',
          translations: translations || undefined,
          timestamp: message.timestamp || Date.now(),
          attachment: hasAttachment ? { ...restAttachment, cdnUrl } : undefined,
          receiverId,
          blockedSend: isBlockedByReceiver,
        } as any);
      } catch (socketErr: any) {
        // Non-fatal: real-time broadcast failed but the reliable write path continues.
        console.warn('⚠️ sendMessage socket failed (non-fatal):', socketErr?.message);
      }

      // Prepare chat meta
      const meta: Partial<IChatMeta> = {
        type: 'private',
        lastmessageAt: message.timestamp as string,
        lastmessageType: attachment ? restAttachment.type : 'text',
        lastmessage: encryptedText || '',
      };

      // ✅ 4. RELIABLE WRITE via backend socket (applySecuredBatchUpdates).
      // Only read SENDER's userchats from the app (RTDB rules allow auth.uid === senderId).
      // Receiver's entry is written via deep field-paths — no read required.
      const batchUpdates: Record<string, any> = {};

      // Message write — chats/ is whitelisted, no ownership check on backend
      batchUpdates[`chats/${roomId}/${message.msgId}`] = messagePayload;

      // ── Sender's userchats: read → merge (allowed by RTDB rules) ──
      const senderRef = rtdbRef(this.db, `userchats/${this.senderId}/${roomId}`);
      const senderSnap = await rtdbGet(senderRef);
      const isNewChat = !senderSnap.exists();

      if (isNewChat) {
        batchUpdates[`userchats/${this.senderId}/${roomId}`] = {
          ...meta,
          isArchived: false,
          isPinned: false,
          isLocked: false,
          unreadCount: 0,
        };
      } else {
        // Use deep paths to preserve existing isPinned / isArchived / isLocked
        batchUpdates[`userchats/${this.senderId}/${roomId}/lastmessage`] = meta.lastmessage;
        batchUpdates[`userchats/${this.senderId}/${roomId}/lastmessageAt`] = meta.lastmessageAt;
        batchUpdates[`userchats/${this.senderId}/${roomId}/lastmessageType`] = meta.lastmessageType;
      }

      // ── Receiver's userchats: NO app-side read (blocked by RTDB rules) ──
      if (!isBlockedByReceiver) {
        if (isNewChat) {
          // New chat — initialize receiver entry with defaults.
          // Backend's User.updateUnreadCount() (called from sendMessage handler) will
          // increment unreadCount; we start at 0 to avoid double-counting.
          batchUpdates[`userchats/${receiverId}/${roomId}`] = {
            ...meta,
            isArchived: false,
            isPinned: false,
            isLocked: false,
            unreadCount: 0,
          };
        } else {
          // Existing chat — update only meta fields via deep paths (preserves isPinned etc.)
          batchUpdates[`userchats/${receiverId}/${roomId}/lastmessage`] = meta.lastmessage;
          batchUpdates[`userchats/${receiverId}/${roomId}/lastmessageAt`] = meta.lastmessageAt;
          batchUpdates[`userchats/${receiverId}/${roomId}/lastmessageType`] = meta.lastmessageType;
        }
      }

      await this.chatBackendSocket.applySecuredBatchUpdates({ updates: batchUpdates });

      let previewUrl: string | null = null;
      if (hasAttachment) {
        console.log('yes local url exist before', localUrl);
        if (localUrl) {
          console.log('yes local url exist after');
          previewUrl = await this.fileSystemService.getFilePreview(localUrl);
        }
      }
      console.log({ previewUrl });

      // Mark as delivered if receiver online and NOT blocked
      const isReceiverOnline = !!this.membersPresence.get(receiverId)?.isOnline;
      if (isReceiverOnline && !isBlockedByReceiver) {
        this.markAsDelivered(message.msgId as string, receiverId, roomId);
      } else if (isBlockedByReceiver) {
        console.log(
          '🚫 Skipping markAsDelivered in direct send (user has blocked you)'
        );
      }
    } catch (error) {
      console.error('❌ Error in sendMessageDirectly:', error);
      throw error;
    }
  }

  /**
   * Send a plain text message to a group room directly
   * (Used for sending invite links to group chats)
   */
  async sendGroupInviteMessage(
    roomId: string,
    senderId: string,
    senderName: string,
    senderPhone: string,
    text: string,
    msgId: string,
    timestamp: number
  ): Promise<void> {
    try {
      // Use backend socket for group invite messages to ensure shared state / lastmessage is updated
      await this.chatBackendSocket.sendMessage({
        roomId,
        msgId,
        content: text,
        timestamp,
        type: 'text'
      });
      console.log(`✅ Group invite message delegated to backend for room ${roomId}`);
    } catch (err) {
      console.error('sendGroupInviteMessage error:', err);
      throw err;
    }
  }

  /**
   * Get message receipts from Firebase
   * @param roomId - The room/conversation ID
   * @param messageKey - The message key
   * @returns Promise with receipts data
   */
  async getMessageReceipts(roomId: string, messageKey: string): Promise<any> {
    try {
      const db = getDatabase();
      const receiptsRef = ref(db, `messages/${roomId}/${messageKey}/receipts`);
      const snapshot = await get(receiptsRef);

      if (snapshot.exists()) {
        return snapshot.val();
      }
      return null;
    } catch (error) {
      console.error('Error fetching message receipts:', error);
      throw error;
    }
  }

  /**
   * Get user name by user ID
   * @param userId - The user ID
   * @returns Promise with user name
   */
  async getUserName(userId: string): Promise<string> {
    try {
      const db = getDatabase();
      const userRef = ref(db, `users/${userId}/name`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        return snapshot.val();
      }
      return userId; // Return userId if name not found
    } catch (error) {
      console.error('Error fetching user name:', error);
      return userId; // Return userId on error
    }
  }

  /**
   * Alternative: Get multiple user names at once (more efficient for group chats)
   * @param userIds - Array of user IDs
   * @returns Promise with map of userId -> userName
   */
  async getUserNames(userIds: string[]): Promise<Map<string, string>> {
    const userNames = new Map<string, string>();

    try {
      const db = getDatabase();

      // Fetch all users in parallel
      const promises = userIds.map(async (userId) => {
        const userRef = ref(db, `users/${userId}/name`);
        const snapshot = await get(userRef);
        const name = snapshot.exists() ? snapshot.val() : userId;
        userNames.set(userId, name);
      });

      await Promise.all(promises);
      return userNames;
    } catch (error) {
      console.error('Error fetching user names:', error);
      // Return map with userIds as fallback
      userIds.forEach((id) => userNames.set(id, id));
      return userNames;
    }
  }

  //mute notifications chatwise

  /**
   * Mute a specific chat for the current user
   * @param roomId - The chat room ID to mute
   * @param userId - The current user ID
   * @returns Promise<void>
   */
  async muteChat(roomId: string, userId: string): Promise<void> {
    try {
      if (!roomId || !userId) {
        throw new Error('roomId and userId are required');
      }

      const db = getDatabase();
      const mutedChatsRef = ref(db, `users/${userId}/mutedChats`);

      // Get current muted chats
      const snapshot = await get(mutedChatsRef);
      const mutedChats: string[] = snapshot.exists() ? snapshot.val() : [];

      // Check if chat is already muted
      if (mutedChats.includes(roomId)) {
        console.log(`⚠️ Chat ${roomId} is already muted for user ${userId}`);
        return;
      }

      // Add room to muted chats
      mutedChats.push(roomId);

      // ✅ SECURE UPDATE: Use socket proxy to update mutedChats list
      await this.applySecuredBatchUpdates({
        [`users/${userId}/mutedChats`]: mutedChats,
      });

      console.log(`✅ Chat ${roomId} muted for user ${userId}`);
    } catch (error) {
      console.error('❌ Error muting chat:', error);
      throw error;
    }
  }

  /**
   * Unmute a specific chat for the current user
   * @param roomId - The chat room ID to unmute
   * @param userId - The current user ID
   * @returns Promise<void>
   */
  async unmuteChat(roomId: string, userId: string): Promise<void> {
    try {
      if (!roomId || !userId) {
        throw new Error('roomId and userId are required');
      }

      const db = getDatabase();
      const mutedChatsRef = ref(db, `users/${userId}/mutedChats`);

      // Get current muted chats
      const snapshot = await get(mutedChatsRef);

      if (!snapshot.exists()) {
        console.log(`⚠️ No muted chats found for user ${userId}`);
        return;
      }

      const mutedChats: string[] = snapshot.val();

      // Check if chat is actually muted
      if (!mutedChats.includes(roomId)) {
        console.log(`⚠️ Chat ${roomId} is not muted for user ${userId}`);
        return;
      }

      // Remove room from muted chats
      const updatedChats = mutedChats.filter((id) => id !== roomId);

      // ✅ SECURE UPDATE: Use socket proxy to update/remove mutedChats node
      const updates: Record<string, any> = {};
      if (updatedChats.length > 0) {
        updates[`users/${userId}/mutedChats`] = updatedChats;
      } else {
        updates[`users/${userId}/mutedChats`] = null;
      }
      await this.applySecuredBatchUpdates(updates);

      console.log(`✅ Chat ${roomId} unmuted for user ${userId}`);
    } catch (error) {
      console.error('❌ Error unmuting chat:', error);
      throw error;
    }
  }

  /**
   * Check if a specific chat is muted for the current user
   * @param roomId - The chat room ID to check
   * @param userId - The current user ID
   * @returns Promise<boolean> - True if chat is muted, false otherwise
   */
  async isChatMuted(roomId: string, userId: string): Promise<boolean> {
    try {
      if (!roomId || !userId) {
        return false;
      }

      const db = getDatabase();
      const mutedChatsRef = ref(db, `users/${userId}/mutedChats`);

      const snapshot = await get(mutedChatsRef);

      if (!snapshot.exists()) {
        return false;
      }

      const mutedChats: string[] = snapshot.val();
      return mutedChats.includes(roomId);
    } catch (error) {
      console.error('❌ Error checking if chat is muted:', error);
      return false;
    }
  }

  /**
   * Get all muted chats for the current user
   * @param userId - The current user ID
   * @returns Promise<string[]> - Array of muted room IDs
   */
  async getMutedChats(userId: string): Promise<string[]> {
    try {
      if (!userId) {
        return [];
      }

      const db = getDatabase();
      const mutedChatsRef = ref(db, `users/${userId}/mutedChats`);

      const snapshot = await get(mutedChatsRef);

      if (!snapshot.exists()) {
        return [];
      }

      return snapshot.val() || [];
    } catch (error) {
      console.error('❌ Error getting muted chats:', error);
      return [];
    }
  }

  // =====================
  // ====== STATE ========
  // Forward message storage and selected message info used by UI
  // =====================
  setForwardMessage(messages: IMessage[]) {
    this.forwardMessages = messages;
  }

  getForwardMessages() {
    return this.forwardMessages;
  }

  clearForwardMessages() {
    this.forwardMessages = [];
  }

  setSelectedAttachment(msg: any) {
    this._selectedAttachment = msg;
    console.log('set selected attachment', this._selectedAttachment);
  }
  getSelectedAttachment() {
    return this._selectedAttachment;
  }
  clearSelectedAttachment() {
    this._selectedAttachment = null;
  }
  setSelectedMessageInfo(msg: any) {
    this._selectedMessageInfo = msg;
  }

  getSelectedMessageInfo(clearAfterRead = false): any {
    const m = this._selectedMessageInfo;
    if (clearAfterRead) this._selectedMessageInfo = null;
    return m;
  }

  setInitialGroupMember(member: any) {
    this.selectedMembersForGroup = [member];
  }

  getInitialGroupMembers() {
    return this.selectedMembersForGroup;
  }

  clearInitialGroupMembers() {
    this.selectedMembersForGroup = [];
  }

  // SET
  setSelectedGroupMembers(members: any[]) {
    this.selectedGroupMembers = members;
    console.log('selected group members are :', this.selectedGroupMembers);
  }

  // GET
  getSelectedGroupMembers() {
    return this.selectedGroupMembers;
  }

  // CLEAR (optional but recommended)
  clearSelectedGroupMembers() {
    this.selectedGroupMembers = [];
  }

  private currentCommunityContext: {
    communityId: string;
    communityName: string | null;
  } | null = null;

  setCurrentCommunityContext(context: any): void {
    this.currentCommunityContext = context;
  }

  getCurrentCommunityContext(): any {
    return this.currentCommunityContext;
  }

  clearCurrentCommunityContext(): void {
    this.currentCommunityContext = null;
  }

  /**
   * Get current sync status
   */
  async getSyncStatus(): Promise<any> {
    const queue = await this.chatPouchDb.getQueue();
    const stats = await this.chatPouchDb.getStats();

    return {
      isOnline: this.networkService.isOnline.value,
      isSyncing: this._isSyncing$.value,
      lastSyncTime: Date.now(),
      pendingActions: queue.length,
      cacheStats: stats,
    };
  }

  /**
   * Force sync all data
   */
  async forceSyncAll(): Promise<void> {
    if (!this.networkService.isOnline.value) {
      console.warn('Cannot sync - offline');
      return;
    }

    console.log('🔄 Force syncing all data...');

    try {
      await this.processPendingActions();
      await this.syncConversationWithServer();
      await this.syncPlatformUsersInBackground();

      console.log('✅ Force sync completed');
    } catch (error) {
      console.error('❌ Force sync failed:', error);
    }
  }

  // ✅ Clear native stored messages to fix badge notification issue
  private async clearNativeStoredMessages(roomId: string): Promise<void> {
    if (!roomId) {
      console.warn('⚠️ clearNativeStoredMessages: roomId is required');
      return;
    }

    if (Capacitor.getPlatform() === 'android') {
      try {
        console.log(
          `🧹 [ChatService] Clearing native storage for room: ${roomId}`
        );
        console.log(
          `🔧 [ChatService] About to call ChatNotification.clearRoom...`
        );

        const result = await ChatNotification.clearRoom({ roomId });

        console.log(`📦 [ChatService] Native clearRoom result:`, result);

        if (result.success) {
          console.log(
            `✅ [ChatService] Native messages cleared successfully for room: ${roomId}`
          );
        } else {
          console.error(
            `❌ [ChatService] Native clear returned false for room: ${roomId}`
          );
        }
      } catch (e) {
        console.error(
          '❌ [ChatService] Exception calling native clearRoom:',
          e
        );
        console.error('❌ [ChatService] Error details:', JSON.stringify(e));
      }
    } else {
      console.log('ℹ️ Native message clearing only available on Android');
    }
  }

  // ================================================================
  // DISAPPEARING MESSAGES — START
  // ================================================================

  async setDisappearingMessages(
    roomId: string,
    duration: '2' | '24' | '7' | '90' | 'off'
  ): Promise<void> {

    const enabled = duration !== 'off';
    
    // 1. Emit to backend socket
    this.chatBackendSocket.setDisappearingSettings({
      roomId,
      enabled,
      duration: enabled ? duration : ''
    });

    // 2. Local PouchDB update for quick UI sync
    try {
      await this.chatPouchDb.updateConversationField(
        this.senderId as string,
        roomId,
        { disappearingDuration: enabled ? duration : null } as any
      );
    } catch (e) {
      console.warn('PouchDB disappearing update failed:', e);
    }

    // NOTE: System message is now written by the backend setDisappearingSettings handler.
    // Do NOT call _sendDisappearingSystemMessage here to avoid duplicate system messages.
  }

  async getDisappearingSetting(roomId: string): Promise<{
    duration: '2' | '24' | '7' | '90' | 'off';
    enabledAt: number;
    enabledBy: string;
    expiresInMs: number;
  } | null> {
    try {
      const db = getDatabase();
      const snap = await rtdbGet(rtdbRef(db, `disappearingSettings/${roomId}`));
      return snap.exists() ? snap.val() : null;
    } catch (err) {
      console.error('getDisappearingSetting error:', err);
      return null;
    }
  }

  async getExpiresAtForRoom(roomId: string): Promise<number | null> {
    try {
      const setting = await this.getDisappearingSetting(roomId);
      if (!setting?.expiresInMs) return null;
      return Date.now() + setting.expiresInMs;
    } catch {
      return null;
    }
  }

  /**
   * App open / room open hone par call karo
   * Expired messages ko isDisappeared: true set karta hai — hard delete NAHI
   */
  async cleanupExpiredMessages(roomId?: string): Promise<void> {
    try {
      const now = Date.now();
      const db = getDatabase();
      const roomsToCheck = roomId
        ? [roomId]
        : this._conversations$.value.map((c) => c.roomId);

      for (const rid of roomsToCheck) {
        const cachedMessages = await this.chatPouchDb.getMessages(rid);

        for (const msg of cachedMessages) {
          const m = msg as IMessage;

          if (m.isDisappeared) continue;
          if (!m.expiresAt) continue;
          if (m.expiresAt > now) continue;

          console.log(`✅ [Cleanup] EXPIRING MSG ${m.msgId}`);

          const fbUpdates: Record<string, any> = {
            [`chats/${rid}/${m.msgId}/isDisappeared`]: true,
          };
          await this.chatBackendSocket.applySecuredBatchUpdates({ updates: fbUpdates });

          try {
            await this.chatPouchDb.updateMessage(
              rid,
              m.msgId as string,
              {
                isDisappeared: true,
              } as any
            );
          } catch {}

          await this.updateMessageLocally({
            ...m,
            isDisappeared: true,
          } as any);

          // ✅ YEH LINE ADD KARO — lastMessage update karo
          await this.updateLastMessageAfterDisappear(rid, m.msgId as string);
        }
      }
    } catch (err) {
      console.error('cleanupExpiredMessages error:', err);
    }
  }

  // NEW: Start a real-time interval timer for a room
  startDisappearingTimer(roomId: string): void {
    // Clear existing timer if any
    this.stopDisappearingTimer(roomId);

    const timer = setInterval(async () => {
      await this.cleanupExpiredMessages(roomId);
    }, 10_000);

    this._disappearingTimers.set(roomId, timer);
    console.log(`⏱️ Disappearing timer started for room: ${roomId}`);
  }

  // NEW: Stop the timer when chat is closed
  stopDisappearingTimer(roomId: string): void {
    const existing = this._disappearingTimers.get(roomId);
    if (existing) {
      clearInterval(existing);
      this._disappearingTimers.delete(roomId);
      console.log(`⏹️ Disappearing timer stopped for room: ${roomId}`);
    }
  }

  // NEW: Stop all timers (call on logout)
  stopAllDisappearingTimers(): void {
    this._disappearingTimers.forEach((timer, roomId) => {
      clearInterval(timer);
      console.log(`⏹️ Stopped timer for room: ${roomId}`);
    });
    this._disappearingTimers.clear();
  }

  private async _sendDisappearingSystemMessage(
    roomId: string,
    duration: '2' | '24' | '7' | '90' | 'off'
  ): Promise<void> {
    try {
      const db = getDatabase();
      const msgId = `system_disappear_${Date.now()}`;
      const senderPhone = this.authService?.authData?.phone_number || 'Someone';

      const label: Record<string, string> = {
        '2': '2 minutes',
        '24': '24 hours',
        '7': '7 days',
        '90': '90 days',
      };

      const systemText =
        duration === 'off'
          ? `${senderPhone} turned off disappearing messages. Tap to change your default timer.`
          : `${senderPhone} set messages to disappear after ${label[duration]}. New messages will disappear from this chat ${label[duration]} after they're sent. Tap to set your own default timer.`;

      const systemMsg: any = {
        msgId,
        roomId,
        sender: 'system',
        type: 'system',
        text: systemText,
        disappearingAction: duration,
        timestamp: Date.now(),
        isSystemMessage: true,
        receipts: {
          read: { status: false, readBy: [] },
          delivered: { status: false, deliveredTo: [] },
        },
      };

      await this.applySecuredBatchUpdates({
        [`chats/${roomId}/${msgId}`]: systemMsg,
      });

      // Immediate local feedback before RTDB onChildAdded propagates
      this.pushMsgToChat({ ...systemMsg, isMe: false });
    } catch (err) {
      console.warn('_sendDisappearingSystemMessage failed:', err);
    }
  }

  private async updateLastMessageAfterDisappear(
    roomId: string,
    disappearedMsgId: string
  ): Promise<void> {
    try {
      if (!this.senderId) return;

      const db = getDatabase();

      const userChatRef = rtdbRef(db, `userchats/${this.senderId}/${roomId}`);
      const userChatSnap = await rtdbGet(userChatRef);
      if (!userChatSnap.exists()) return;

      const userChatData = userChatSnap.val();
      const currentLastMsgAt = userChatData?.lastmessageAt;

      // PouchDB se current messages lo
      const cachedMessages = await this.chatPouchDb.getMessages(roomId);

      // Expired message ka timestamp nikalo
      const expiredMsg = cachedMessages.find(
        (m) => m.msgId === disappearedMsgId
      );
      const expiredTs = expiredMsg
        ? this.normalizeTs((expiredMsg as any).timestamp)
        : null;

      const currentLastTs = this.normalizeTs(currentLastMsgAt);

      // Agar expired message lastMessage nahi tha toh kuch nahi karna
      // null = message PouchDB mein nahi mila, proceed anyway (safe)
      if (expiredTs !== null && expiredTs < currentLastTs) return;

      // Step 2: Baaki visible messages mein se latest dhundo
      const visibleMessages = cachedMessages
        .filter(
          (m) =>
            m.msgId !== disappearedMsgId &&
            !m.isDisappeared &&
            !this.isMessageHiddenInService(m)
        )
        .sort(
          (a, b) =>
            this.normalizeTs((b as any).timestamp) -
            this.normalizeTs((a as any).timestamp)
        );

      const newLastMsg = visibleMessages[0] || null;

      // Step 3: userchats update karo
      const updates: Record<string, any> = {};

      if (newLastMsg) {
        let decryptedText = (newLastMsg as any).text || '';
        try {
          if (decryptedText) {
            decryptedText = await this.encryptionService.decrypt(decryptedText);
          }
        } catch {
          // already decrypted hoga cache mein
        }

        const encryptedText = decryptedText
          ? await this.encryptionService.encrypt(decryptedText)
          : '';

        const newTs = this.normalizeTs((newLastMsg as any).timestamp);

        updates[`userchats/${this.senderId}/${roomId}/lastmessage`] =
          encryptedText;
        updates[`userchats/${this.senderId}/${roomId}/lastmessageAt`] = newTs;
        updates[`userchats/${this.senderId}/${roomId}/lastmessageType`] =
          (newLastMsg as any).attachment?.type || 'text';

        // Step 4: Local conversations$ bhi update karo
        const convs = this._conversations$.value;
        const idx = convs.findIndex((c) => c.roomId === roomId);
        if (idx >= 0) {
          const updated = [...convs];
          updated[idx] = {
            ...updated[idx],
            lastMessage: decryptedText,
            lastMessageType:
              ((newLastMsg as any).attachment?.type as any) || 'text',
            lastMessageAt: new Date(newTs),
            updatedAt: new Date(newTs),
          };
          this._conversations$.next(updated);
        }

        // PouchDB bhi update karo
        try {
          await this.chatPouchDb.updateConversationLastMessage(
            this.senderId as string,
            roomId,
            decryptedText,
            (newLastMsg as any).attachment?.type || 'text',
            newTs
          );
        } catch {}
      } else {
        // Koi visible message nahi — lastmessage clear karo
        updates[`userchats/${this.senderId}/${roomId}/lastmessage`] = '';
        updates[`userchats/${this.senderId}/${roomId}/lastmessageAt`] = 0;
        updates[`userchats/${this.senderId}/${roomId}/lastmessageType`] =
          'text';

        const convs = this._conversations$.value;
        const idx = convs.findIndex((c) => c.roomId === roomId);
        if (idx >= 0) {
          const updated = [...convs];
          updated[idx] = {
            ...updated[idx],
            lastMessage: undefined,
            lastMessageType: undefined,
            lastMessageAt: undefined,
            updatedAt: new Date(),
          };
          this._conversations$.next(updated);
        }

        try {
          await this.chatPouchDb.updateConversationLastMessage(
            this.senderId as string,
            roomId,
            '',
            'text',
            0
          );
        } catch {}
      }

      if (Object.keys(updates).length > 0) {
        await this.chatBackendSocket.applySecuredBatchUpdates({ updates });
        console.log(
          `✅ lastMessage updated after disappear for room: ${roomId}`
        );
      }
    } catch (err) {
      console.error('updateLastMessageAfterDisappear error:', err);
    }
  }

  // Helper — service ke andar deletion check ke liye (same logic, no component dependency)
  private isMessageHiddenInService(msg: any): boolean {
    if (!msg) return true;
    if (msg.isDisappeared === true) return true;
    // ✅ System messages hide karo
    if (msg.isSystemMessage === true) return true;
    if (msg.type === 'system') return true;
    if (msg.deletedFor && Array.isArray(msg.deletedFor.users)) {
      return msg.deletedFor.users
        .map((u: any) => String(u))
        .includes(String(this.senderId));
    }
    return false;
  }
  // ================================================================
  // DISAPPEARING MESSAGES — END
  // ================================================================

  async getGroupPermissions(groupId: string): Promise<GroupPermissions> {
    const defaults: GroupPermissions = {
      editGroupSettings: true,
      sendMessages: true,
      addMembers: true,
      inviteViaLink: false,
      approveNewMembers: false,
    };

    try {
      // Return from cache if available
      if (this._groupPermissionsCache.has(groupId)) {
        return this._groupPermissionsCache.get(groupId)!;
      }

      const db = getDatabase();
      const snap = await rtdbGet(rtdbRef(db, `groups/${groupId}/permissions`));

      const perms: GroupPermissions = snap.exists()
        ? { ...defaults, ...snap.val() }
        : defaults;

      // Cache it
      this._groupPermissionsCache.set(groupId, perms);
      return perms;
    } catch (err) {
      console.error('getGroupPermissions error:', err);
      return defaults;
    }
  }

  async saveGroupPermissions(
    groupId: string,
    permissions: GroupPermissions
  ): Promise<void> {
    const updates: Record<string, any> = {};
    for (const [key, val] of Object.entries(permissions)) {
      updates[`groups/${groupId}/permissions/${key}`] = val;
    }
    updates[`groups/${groupId}/permissions/updatedAt`] = Date.now();
    updates[`groups/${groupId}/permissions/updatedBy`] = this.senderId;

    await this.applySecuredBatchUpdates(updates);

    // Update cache
    this._groupPermissionsCache.set(groupId, permissions);
  }

  async checkGroupPermission(
    groupId: string,
    permission: keyof GroupPermissions
  ): Promise<boolean> {
    try {
      // Admins always bypass restrictions
      const isAdmin = await this.isUserAdmin(groupId, this.senderId || '');
      if (isAdmin) return true;

      const perms = await this.getGroupPermissions(groupId);
      return !!perms[permission];
    } catch (err) {
      console.error('checkGroupPermission error:', err);
      return true; // fail open
    }
  }

  clearGroupPermissionsCache(groupId?: string): void {
    if (groupId) {
      this._groupPermissionsCache.delete(groupId);
    } else {
      this._groupPermissionsCache.clear();
    }
  }
  //community settings methods
  // Pending group suggestion save karo
  async savePendingGroupSuggestion(
    communityId: string,
    suggestion: {
      groupId?: string; // existing group ke liye
      groupName: string;
      suggestedBy: string; // userId
      suggestedByName: string;
      type: 'new' | 'existing'; // new group ya existing group
      groupData?: any; // create-new-group ka saara data
      existingGroupId?: string; // add-existing ke liye
      avatar?: string;
      membersCount?: number;
    }
  ): Promise<string> {
    const db = getDatabase();
    const suggestionId = `suggestion_${Date.now()}`;
    const suggestionData = {
      ...suggestion,
      suggestionId,
      communityId,
      status: 'pending',
      createdAt: Date.now(),
    };

    await rtdbSet(
      rtdbRef(db, `communities/${communityId}/pendingGroups/${suggestionId}`),
      suggestionData
    );

    return suggestionId;
  }

  // Pending suggestions fetch karo
  async getPendingGroupSuggestions(communityId: string): Promise<any[]> {
    const db = getDatabase();
    const snap = await rtdbGet(
      rtdbRef(db, `communities/${communityId}/pendingGroups`)
    );
    if (!snap.exists()) return [];

    const data = snap.val();
    return Object.values(data).filter((s: any) => s.status === 'pending');
  }

  // Suggestion approve karo
  async approvePendingGroupSuggestion(
    communityId: string,
    suggestionId: string,
    suggestion: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const db = getDatabase();

      if (suggestion.type === 'existing' && suggestion.existingGroupId) {
        // Existing group ko community mein link karo
        const result = await this.addGroupsToCommunity({
          communityId,
          groupIds: [suggestion.existingGroupId],
          backendCommunityId: null,
          currentUserId: this.senderId || undefined,
        });
        if (!result.success) return result;
      } else if (suggestion.type === 'new' && suggestion.groupData) {
        // Group already ban chuka hai (pending state mein), sirf community se link karo
        const groupId = suggestion.groupData.groupId;
        const updates: Record<string, any> = {};
        updates[`/communities/${communityId}/groups/${groupId}`] = true;
        updates[`/groups/${groupId}/communityId`] = communityId;
        updates[`/groups/${groupId}/pendingApproval`] = false;
        // ✅ SECURE UPDATE: Route group community link through proxy
        await this.applySecuredBatchUpdates(updates);
      }

      // Status update karo
      // ✅ SECURE UPDATE: Route approval status update through proxy
      await this.applySecuredBatchUpdates({
        [`communities/${communityId}/pendingGroups/${suggestionId}`]: {
          status: 'approved',
          resolvedAt: Date.now(),
        },
      });

      return { success: true, message: 'Group approved successfully' };
    } catch (err: any) {
      console.error('approvePendingGroupSuggestion error:', err);
      return { success: false, message: err?.message || 'Failed to approve' };
    }
  }

  // Suggestion reject karo
  async rejectPendingGroupSuggestion(
    communityId: string,
    suggestionId: string,
    suggestion: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const db = getDatabase();

      // Agar new group tha toh usse bhi delete karo
      if (suggestion.type === 'new' && suggestion.groupData?.groupId) {
        const groupId = suggestion.groupData.groupId;
        const updates: Record<string, any> = {};
        updates[`/groups/${groupId}`] = null;

        // Saare members ke userchats se bhi remove karo
        const memberIds: string[] = suggestion.groupData.memberIds || [];
        for (const memberId of memberIds) {
          updates[`/userchats/${memberId}/${groupId}`] = null;
        }
        // ✅ SECURE UPDATE: Route group rejection cleanup through proxy
        await this.applySecuredBatchUpdates(updates);
      }

      // Status update karo
      // ✅ SECURE UPDATE: Route rejection status update through proxy
      await this.applySecuredBatchUpdates({
        [`communities/${communityId}/pendingGroups/${suggestionId}`]: {
          status: 'rejected',
          resolvedAt: Date.now(),
        },
      });

      return { success: true, message: 'Group rejected' };
    } catch (err: any) {
      console.error('rejectPendingGroupSuggestion error:', err);
      return { success: false, message: err?.message || 'Failed to reject' };
    }
  }

  // Pending count get karo (community-detail ke liye)
  async getPendingGroupsCount(communityId: string): Promise<number> {
    const suggestions = await this.getPendingGroupSuggestions(communityId);
    return suggestions.length;
  }

  /**
   * ✅ ONE-TIME MIGRATION: Fix all non-canonical roomIds in Firebase
   * Call this ONCE after user logs in.
   * It detects duplicates like "17_4" and "4_17" and merges them.
   */
  async migrateNonCanonicalRoomIds(): Promise<void> {
    if (!this.senderId) return;

    const migrationKey = `roomId_migration_done_${this.senderId}`;
    if (localStorage.getItem(migrationKey)) {
      console.log('✅ RoomId migration already done, skipping');
      return;
    }

    try {
      console.log('🔄 Starting roomId migration...');
      const db = getDatabase();
      const userChatsRef = rtdbRef(db, `userchats/${this.senderId}`);
      const snap = await rtdbGet(userChatsRef);

      if (!snap.exists()) return;

      const userChats = snap.val() as Record<string, any>;
      const roomIds = Object.keys(userChats);

      const updates: Record<string, any> = {};
      const processed = new Set<string>();

      for (const roomId of roomIds) {
        if (processed.has(roomId)) continue;

        // Skip non-private rooms
        if (roomId.startsWith('group_') || roomId.startsWith('community_'))
          continue;

        const parts = roomId.split('_');
        if (parts.length !== 2) continue;

        const canonical = this.getCanonicalRoomId(parts[0], parts[1]);

        if (canonical === roomId) {
          processed.add(roomId);
          continue; // Already canonical
        }

        // Found non-canonical! e.g., "17_4" when canonical is "4_17"
        console.warn(`🔧 Migrating non-canonical: ${roomId} → ${canonical}`);

        const nonCanonicalMeta = userChats[roomId];
        const canonicalMeta = userChats[canonical];

        // Merge: prefer the one with more recent lastmessageAt
        const nonCanonicalTs = Number(nonCanonicalMeta?.lastmessageAt || 0);
        const canonicalTs = Number(canonicalMeta?.lastmessageAt || 0);

        const mergedMeta =
          nonCanonicalTs > canonicalTs
            ? { ...canonicalMeta, ...nonCanonicalMeta }
            : { ...nonCanonicalMeta, ...canonicalMeta };

        // Write canonical, delete non-canonical
        updates[`userchats/${this.senderId}/${canonical}`] = mergedMeta;
        updates[`userchats/${this.senderId}/${roomId}`] = null; // delete

        // Also fix PouchDB
        try {
          const cachedConvs = await this.chatPouchDb.getConversations(
            this.senderId as string
          );
          const nonCanIdx = cachedConvs.findIndex((c) => c.roomId === roomId);
          const canIdx = cachedConvs.findIndex((c) => c.roomId === canonical);

          if (nonCanIdx >= 0) {
            if (canIdx >= 0) {
              // Both exist — remove non-canonical
              cachedConvs.splice(nonCanIdx, 1);
            } else {
              // Only non-canonical — rename it
              cachedConvs[nonCanIdx] = {
                ...cachedConvs[nonCanIdx],
                roomId: canonical,
              };
            }
            await this.chatPouchDb.saveConversations(
              this.senderId as string,
              cachedConvs as any,
              true
            );
          }
        } catch (pouchErr) {
          console.warn('PouchDB migration failed:', pouchErr);
        }

        processed.add(roomId);
        processed.add(canonical);
      }

      if (Object.keys(updates).length > 0) {
        // ✅ SECURE UPDATE: Route migration batch through proxy
        await this.applySecuredBatchUpdates(updates);
        console.log(
          `✅ Migration complete: fixed ${
            Object.keys(updates).length / 2
          } non-canonical roomIds`
        );
      } else {
        console.log('✅ No non-canonical roomIds found');
      }

      localStorage.setItem(migrationKey, 'true');
    } catch (err) {
      console.error('❌ Migration failed:', err);
    }
  }
}