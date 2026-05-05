import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { AuthService } from '../auth/auth.service';
import { FcmService } from './fcm-service';
import { SqliteService } from './sqlite.service';
import { FirebaseChatService } from './firebase-chat.service';
import { ChannelPouchDbService } from '../pages/channels/services/pouch-db';
import { ChatPouchDb } from './chat-pouch-db';
// import { App } from '@capacitor/app';
// import { CapacitorSQLite } from '@capacitor-community/sqlite';

@Injectable({
  providedIn: 'root',
})
export class Resetapp {
  constructor(
    private authService: AuthService,
    private fcmService: FcmService,
    private sqliteService: SqliteService,
    private firebasechatservice : FirebaseChatService,
    private channelPouchDb:ChannelPouchDbService,
    private chatPouchDb : ChatPouchDb
  ) {}

  /** Clear LocalStorage */
  private clearLocalStorage() {
    try {
      localStorage.clear();
    } catch (err) {
      console.warn('LocalStorage clear failed', err);
    }
  }

  /** Clear Capacitor Preferences */
  private async clearCapacitorStorage() {
    try {
      await Preferences.clear();
    } catch (err) {
      console.warn('Preferences clear failed', err);
    }
  }

  /** Clear Secure Storage */
  private async clearSecureStorage() {
    try {
      await SecureStoragePlugin.clear();
    } catch (err) {
      console.warn('SecureStorage clear failed', err);
    }
  }

  /** Clear SQLite (optional) */
  private async clearSQLite() {
    // Same as before...
  }

  /** Clear app files (sub-folder only) */
  private async clearFileSystem() {
    try {
      await Filesystem.rmdir({
        path: 'appdata',
        directory: Directory.Documents,
        recursive: true,
      });
    } catch (err) {
      console.warn('FileSystem clear failed', err);
    }
  }

  /** Reload app */
  private reloadApp() {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }

  /** Reset everything */
async resetApp() {
  const userId = await this.authService.authData?.userId;

  // Step 1: Firebase cleanup
  if (userId) {
    try {
      await this.fcmService.deleteFcmToken(userId);
      console.log('✅ FCM token deleted');
    } catch (err) {
      console.warn('⚠️ Failed to delete FCM token', err);
    }
    try {
      await this.fcmService.setUserOffline(userId);
      console.log('✅ User set offline');
    } catch (err) {
      console.warn('⚠️ Failed to set user offline', err);
    }
  }

  // Step 2: Clear all storage
  console.log('🗑️ Clearing storage...');
  await this.clearLocalStorage();
  await this.clearCapacitorStorage();
  await this.clearSecureStorage();
  await this.clearFileSystem();

  await this.chatPouchDb.clearAll();

    // 🔥 Step 3: Clear PouchDB
  console.log('🗑️ Clearing PouchDB...');
  await this.channelPouchDb.clearAll();

  // console.log('🗑️ Resetting SQLite database...');
  // await this.sqliteService.resetDB();
  
  // console.log('🔌 Closing SQLite connection...');
  // await this.sqliteService.closeConnection();

  console.log('🔄 Reloading app...');
  this.reloadApp();
}
}
