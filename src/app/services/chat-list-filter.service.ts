import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { getDatabase, ref, get } from 'firebase/database';
import { AuthService } from '../auth/auth.service';
import { ChatBackendSocketService } from './chat-backend-socket.service';
import { NetworkService } from './network-connection/network.service';

export interface ChatCustomList {
  listId: string;
  name: string;
  roomIds: string[];
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class ChatListFilterService {
  // ── In-memory reactive state ─────────────────────────────
  private _favouriteRoomIds$ = new BehaviorSubject<string[]>([]);
  readonly favouriteRoomIds$ = this._favouriteRoomIds$.asObservable();

  private _customLists$ = new BehaviorSubject<ChatCustomList[]>([]);
  readonly customLists$ = this._customLists$.asObservable();

  constructor(
    private authService: AuthService,
    private chatBackendSocket: ChatBackendSocketService,
    private networkService: NetworkService
  ) {}

  // ── Helpers ──────────────────────────────────────────────
  private get userId(): string {
    return this.authService.authData?.userId || '';
  }

  private get favBasePath(): string {
    return `userFilters/${this.userId}/favourites`;
  }

  private listsBasePath(listId?: string): string {
    const base = `userFilters/${this.userId}/lists`;
    return listId ? `${base}/${listId}` : base;
  }

  // ── Expose current snapshot (non-reactive read) ──────────
  get currentFavouriteIds(): string[] {
    return this._favouriteRoomIds$.value;
  }

  get currentLists(): ChatCustomList[] {
    return this._customLists$.value;
  }

  // ════════════════════════════════════════════════════════
  // INIT — app start pe ek baar call karo
  // ════════════════════════════════════════════════════════
  async loadFromFirebase(): Promise<void> {
    if (!this.userId) return;
    if (!this.networkService.isOnline.value) return; // skip offline — BehaviorSubjects keep cached state
    const db = getDatabase();

    try {
      // Load favourites
      const favSnap = await get(ref(db, this.favBasePath));
      if (favSnap.exists()) {
        const raw = favSnap.val() as Record<string, boolean>;
        const ids = Object.keys(raw).filter((k) => raw[k] === true);
        this._favouriteRoomIds$.next(ids);
      } else {
        this._favouriteRoomIds$.next([]);
      }

      // Load custom lists
      const listsSnap = await get(ref(db, this.listsBasePath()));
      if (listsSnap.exists()) {
        const raw = listsSnap.val() as Record<string, any>;
        const lists: ChatCustomList[] = Object.entries(raw).map(
          ([listId, v]) => ({
            listId,
            name: v.name || '',
            createdAt: v.createdAt || 0,
            roomIds: v.roomIds
              ? Object.keys(v.roomIds).filter((k) => v.roomIds[k] === true)
              : [],
          })
        );
        // Sort by creation time
        lists.sort((a, b) => a.createdAt - b.createdAt);
        this._customLists$.next(lists);
      } else {
        this._customLists$.next([]);
      }
    } catch (err) {
      console.warn('[ChatListFilterService] loadFromFirebase error:', err);
    }
  }

  // ════════════════════════════════════════════════════════
  // FAVOURITES
  // ════════════════════════════════════════════════════════

  isFavourite(roomId: string): boolean {
    if (!roomId) return false;
    return this._favouriteRoomIds$.value.includes(roomId);
  }

  async addToFavourites(roomId: string): Promise<void> {
    if (!this.userId || !roomId) return;
    await this.chatBackendSocket.applySecuredBatchUpdates({
      updates: { [`${this.favBasePath}/${roomId}`]: true }
    });

    const current = this._favouriteRoomIds$.value;
    if (!current.includes(roomId)) {
      this._favouriteRoomIds$.next([...current, roomId]);
    }
  }

  async removeFromFavourites(roomId: string): Promise<void> {
    if (!this.userId || !roomId) return;
    await this.chatBackendSocket.applySecuredBatchUpdates({
      updates: { [`${this.favBasePath}/${roomId}`]: null }
    });

    this._favouriteRoomIds$.next(
      this._favouriteRoomIds$.value.filter((id) => id !== roomId)
    );
  }

  /** Returns true if NOW favourite, false if removed */
  async toggleFavourite(roomId: string): Promise<boolean> {
    if (this.isFavourite(roomId)) {
      await this.removeFromFavourites(roomId);
      return false;
    } else {
      await this.addToFavourites(roomId);
      return true;
    }
  }

  // ════════════════════════════════════════════════════════
  // CUSTOM LISTS
  // ════════════════════════════════════════════════════════

  async createList(name: string): Promise<ChatCustomList> {
    if (!this.userId) throw new Error('User not authenticated');

    const listId = `list_${Date.now()}`;
    const newList: ChatCustomList = {
      listId,
      name: name.trim(),
      roomIds: [],
      createdAt: Date.now(),
    };

    await this.chatBackendSocket.applySecuredBatchUpdates({
      updates: {
        [this.listsBasePath(listId)]: {
          name: newList.name,
          createdAt: newList.createdAt,
          roomIds: {},
        }
      }
    });

    this._customLists$.next([...this._customLists$.value, newList]);
    return newList;
  }

  async deleteList(listId: string): Promise<void> {
    if (!this.userId || !listId) return;
    await this.chatBackendSocket.applySecuredBatchUpdates({
      updates: { [this.listsBasePath(listId)]: null }
    });

    this._customLists$.next(
      this._customLists$.value.filter((l) => l.listId !== listId)
    );
  }

  async addRoomToList(listId: string, roomId: string): Promise<void> {
    if (!this.userId || !listId || !roomId) return;
    await this.chatBackendSocket.applySecuredBatchUpdates({
      updates: { [`${this.listsBasePath(listId)}/roomIds/${roomId}`]: true }
    });

    this._customLists$.next(
      this._customLists$.value.map((l) => {
        if (l.listId !== listId) return l;
        const roomIds = l.roomIds.includes(roomId)
          ? l.roomIds
          : [...l.roomIds, roomId];
        return { ...l, roomIds };
      })
    );
  }

  async removeRoomFromList(listId: string, roomId: string): Promise<void> {
    if (!this.userId || !listId || !roomId) return;
    await this.chatBackendSocket.applySecuredBatchUpdates({
      updates: { [`${this.listsBasePath(listId)}/roomIds/${roomId}`]: null }
    });

    this._customLists$.next(
      this._customLists$.value.map((l) => {
        if (l.listId !== listId) return l;
        return { ...l, roomIds: l.roomIds.filter((id) => id !== roomId) };
      })
    );
  }

  /** Konsi lists mein yeh roomId hai */
  getListsContainingRoom(roomId: string): ChatCustomList[] {
    if (!roomId) return [];
    return this._customLists$.value.filter((l) => l.roomIds.includes(roomId));
  }

  /** Duplicate name check */
  listNameExists(name: string, excludeListId?: string): boolean {
    const trimmed = name.trim().toLowerCase();
    return this._customLists$.value.some(
      (l) => l.name.toLowerCase() === trimmed && l.listId !== excludeListId
    );
  }
  async renameList(listId: string, newName: string): Promise<void> {
    // Firebase mein list name update karo
  }
}
