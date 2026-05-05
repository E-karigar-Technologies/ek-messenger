// import { Injectable } from '@angular/core';
// import {
//   getDatabase,
//   ref,
//   update,
//   remove,
//   onValue,
//   onDisconnect,
//   DatabaseReference,
//   Unsubscribe
// } from 'firebase/database';
// import { TypingEntry } from 'src/types';


// @Injectable({ providedIn: 'root' })
// export class TypingService {
//   private db = getDatabase();

//   // Start typing: create/update node with timestamp
//   async startTyping(roomId: string, userId: string): Promise<void> {
//     const r = ref(this.db, `typing/${roomId}/${userId}`);
//     // update keeps node idempotent
//     await update(r, { typing: true, lastUpdated: Date.now() });
//     // Ensure onDisconnect removal if possible
//     try {
//       onDisconnect(r).remove();
//     } catch (e) {
//       // ignore if environment doesn't support onDisconnect
//       // (most web/capacitor support it if firebase initialized)
//       console.warn('onDisconnect not available', e);
//     }
//   }

//   // Stop typing: remove node
//   async stopTyping(roomId: string, userId: string): Promise<void> {
//     const r = ref(this.db, `typing/${roomId}/${userId}`);
//     await remove(r);
//   }

//   // Listen typing entries for a room. callback called with array of entries.
//   // Returns unsubscribe function to stop listening.
//   listenTyping(roomId: string, callback: (entries: TypingEntry[]) => void): Unsubscribe {
//     const r = ref(this.db, `typing/${roomId}`);
//     const unsubscribe = onValue(r, (snap) => {
//       const val = snap.val() || {};
//       const entries: TypingEntry[] = Object.keys(val).map(k => ({
//         userId: k,
//         typing: val[k]?.typing ?? false,
//         lastUpdated: val[k]?.lastUpdated ?? 0
//       }));
//       callback(entries);
//     });
//     return unsubscribe;
//   }

//   // Return DB ref for manual onDisconnect if caller wants it
//   getRef(roomId: string, userId: string): DatabaseReference {
//     return ref(this.db, `typing/${roomId}/${userId}`);
//   }
// }



import { Injectable } from '@angular/core';
import {
  getDatabase,
  ref,
  update,
  remove,
  onValue,
  onDisconnect,
  DatabaseReference,
  Unsubscribe
} from 'firebase/database';
import { TypingEntry } from 'src/types';
import { ChatBackendSocketService } from './chat-backend-socket.service';

@Injectable({ providedIn: 'root' })
export class TypingService {
  private db = getDatabase();

  constructor(private chatBackendSocket: ChatBackendSocketService) {}

  /**
   * Start typing (or refresh typing). Writes:
   * typing/{roomId}/{userId} => { typing: true, name?: string|null, lastUpdated: <ms> }
   *
   * Pass optional `name` so others can show "Rahul is typing..."
   */
  async startTyping(roomId: string, userId: string, name?: string | null): Promise<void> {
    if (!roomId || !userId) return;
    
    try {
      this.chatBackendSocket.setTypingStatus(roomId, true);
    } catch (err) {
      console.warn('TypingService.startTyping error', err);
    }
  }

  /**
   * Stop typing: remove node
   */
  async stopTyping(roomId: string, userId: string): Promise<void> {
    if (!roomId || !userId) return;
    try {
      this.chatBackendSocket.setTypingStatus(roomId, false);
    } catch (err) {
      console.warn('TypingService.stopTyping error', err);
    }
  }

  /**
   * Update lastUpdated (and optionally name) without changing typing boolean.
   * Useful if you want to "touch" the node to keep it fresh while user continues typing.
   */
  async touchTyping(roomId: string, userId: string, name?: string | null): Promise<void> {
    if (!roomId || !userId) return;
    // For now, touchTyping just calls startTyping again via socket
    this.startTyping(roomId, userId, name);
  }

  /**
   * Listen typing entries for a room. callback receives array of TypingEntry:
   * { userId, typing: boolean, lastUpdated: number, name?: string | null }
   *
   * Returns unsubscribe function to stop listening.
   */
  listenTyping(roomId: string, callback: (entries: TypingEntry[]) => void): Unsubscribe {
    const r = ref(this.db, `typing/${roomId}`);

    // onValue returns an unsubscribe function (firebase modular). We return that directly.
    const unsubscribe = onValue(r, (snap) => {
      const val = snap.val() || {};
      const entries: TypingEntry[] = Object.keys(val).map(k => ({
        userId: k,
        typing: val[k]?.typing ?? false,
        lastUpdated: val[k]?.lastUpdated ?? 0,
        name: val[k]?.name ?? null
      }));
      callback(entries);
    });

    return unsubscribe;
  }

  /**
   * Return DB ref for manual onDisconnect if caller wants it
   */
  getRef(roomId: string, userId: string): DatabaseReference {
    return ref(this.db, `typing/${roomId}/${userId}`);
  }
}
