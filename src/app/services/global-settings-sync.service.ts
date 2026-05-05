import { Injectable } from '@angular/core';
import { Database } from '@angular/fire/database';
import { ref, set } from 'firebase/database';
import { AuthService } from '../auth/auth.service';
import {
  ChatBackendSocketService,
  GlobalSettingsSectionKey,
} from './chat-backend-socket.service';

type SettingsQueueItem = {
  id: string;
  section: GlobalSettingsSectionKey;
  settings: any;
  queuedAt: number;
};

const QUEUE_STORAGE_KEY = 'settings.global.queue.v1';
const GLOBAL_SETTINGS_LOCAL_UPDATED_EVENT = 'global-settings:local-updated';

const LOCAL_KEYS: Record<GlobalSettingsSectionKey, string> = {
  accessibility: 'settings.accessibility',
  chats: 'settings.chats',
  notifications: 'settings.notifications',
  storageData: 'settings.storageData',
  appUpdates: 'settings.appUpdates',
  appLanguage: 'app_language',
  chatTheme: 'settings.chatTheme',
  avatarOptions: 'avatar_opts:current_user',
};

@Injectable({ providedIn: 'root' })
export class GlobalSettingsSyncService {
  private initialized = false;
  private initializedForUserId: string | null = null;
  private initializing: Promise<void> | null = null;
  private flushing = false;
  private onlineListenerAttached = false;

  constructor(
    private chatSocket: ChatBackendSocketService,
    private authService: AuthService,
    private db: Database
  ) {}

  async initialize(forceRefresh = false): Promise<void> {
    const currentUserId = String(this.authService.authData?.userId || '');
    if (
      !forceRefresh &&
      this.initialized &&
      this.initializedForUserId === currentUserId
    ) {
      return;
    }

    if (this.initializing) return this.initializing;

    this.initializing = this.bootstrap().finally(() => {
      this.initializing = null;
    });

    return this.initializing;
  }

  async getSection<T>(
    section: GlobalSettingsSectionKey,
    fallback: T
  ): Promise<T> {
    const localValue = this.readLocalSection<T>(section);

    if (localValue !== null && localValue !== undefined) {
      this.initialize().catch(() => undefined);
      return localValue;
    }

    await this.initialize();
    const hydratedValue = this.readLocalSection<T>(section);

    if (hydratedValue !== null && hydratedValue !== undefined) {
      return hydratedValue;
    }

    return fallback;
  }

  saveSection(section: GlobalSettingsSectionKey, settings: any): void {
    this.writeLocalSection(section, settings);
    this.enqueueLatest(section, settings);

    this.initialize()
      .then(() => this.flushQueue())
      .catch(() => undefined);
  }

  private async bootstrap(): Promise<void> {
    this.attachOnlineListener();

    if (!this.isAuthenticated()) {
      this.initialized = false;
      this.initializedForUserId = null;
      return;
    }

    this.initializedForUserId = String(this.authService.authData?.userId || '');

    await this.hydrateFromRemote();
    await this.flushQueue();
    this.initialized = true;
  }

  private async hydrateFromRemote(): Promise<void> {
    if (!this.isOnline()) return;
    try {
      const remote = await this.chatSocket.getGlobalSettings();
      const queue = this.readQueue();
      const pendingSections = new Set(queue.map((item) => item.section));

      for (const section of Object.keys(LOCAL_KEYS) as GlobalSettingsSectionKey[]) {
        if (pendingSections.has(section)) continue;
        if (!Object.prototype.hasOwnProperty.call(remote, section)) continue;
        this.writeLocalSection(section, remote[section]);
      }
    } catch (error) {
      console.warn('[GlobalSettingsSyncService] Remote hydration failed', error);
    }
  }

  private async flushQueue(): Promise<void> {
    if (this.flushing) return;
    if (!this.isAuthenticated()) return;
    if (!this.isOnline()) return;

    this.flushing = true;

    try {
      let queue = this.readQueue();
      const userId = String(this.authService.authData?.userId || '');

      for (const item of queue) {
        try {
          await this.chatSocket.saveGlobalSettings({
            section: item.section,
            settings: item.settings,
          });

          queue = queue.filter((entry) => entry.id !== item.id);
          this.writeQueue(queue);
        } catch (error) {
          try {
            // Fallback for older backends where saveGlobalSettings socket event is missing.
            await this.chatSocket.applySecuredBatchUpdates({
              updates: {
                [`globalSettings/${userId}/${item.section}`]: {
                  value: item.settings,
                  updatedAt: Date.now(),
                  updatedBy: userId,
                },
              },
            });

            queue = queue.filter((entry) => entry.id !== item.id);
            this.writeQueue(queue);
          } catch (fallbackError) {
            try {
              await this.writeDirectToFirebase(userId, item.section, item.settings);
              queue = queue.filter((entry) => entry.id !== item.id);
              this.writeQueue(queue);
            } catch (directError) {
              console.warn(
                `[GlobalSettingsSyncService] Queue flush failed for ${item.section}`,
                directError
              );
              break;
            }
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private enqueueLatest(section: GlobalSettingsSectionKey, settings: any): void {
    const queue = this.readQueue().filter((item) => item.section !== section);

    queue.push({
      id: `${section}_${Date.now()}`,
      section,
      settings,
      queuedAt: Date.now(),
    });

    this.writeQueue(queue);
  }

  private readQueue(): SettingsQueueItem[] {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  private writeQueue(queue: SettingsQueueItem[]): void {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.warn('[GlobalSettingsSyncService] Could not persist settings queue', error);
    }
  }

  private readLocalSection<T>(section: GlobalSettingsSectionKey): T | null {
    const key = LOCAL_KEYS[section];

    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;

      if (section === 'appLanguage') {
        return raw as unknown as T;
      }

      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private writeLocalSection(section: GlobalSettingsSectionKey, settings: any): void {
    const key = LOCAL_KEYS[section];

    try {
      if (section === 'appLanguage') {
        localStorage.setItem(key, String(settings));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(GLOBAL_SETTINGS_LOCAL_UPDATED_EVENT, {
              detail: { section },
            })
          );
        }
        return;
      }

      localStorage.setItem(key, JSON.stringify(settings));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(GLOBAL_SETTINGS_LOCAL_UPDATED_EVENT, {
            detail: { section },
          })
        );
      }
    } catch (error) {
      console.warn(`[GlobalSettingsSyncService] Local write failed for ${section}`, error);
    }
  }

  private attachOnlineListener(): void {
    if (this.onlineListenerAttached) return;

    this.onlineListenerAttached = true;
    window.addEventListener('online', () => {
      // Re-hydrate from remote now that we're back online (was skipped offline)
      this.hydrateFromRemote().catch(() => undefined);
      this.flushQueue().catch(() => undefined);
    });
  }

  private isAuthenticated(): boolean {
    return !!this.authService.authData?.app_token && !!this.authService.authData?.userId;
  }

  private isOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }

  private async writeDirectToFirebase(
    userId: string,
    section: GlobalSettingsSectionKey,
    settings: any
  ): Promise<void> {
    if (!userId) {
      throw new Error('Missing userId for direct firebase write');
    }

    await set(ref(this.db, `globalSettings/${userId}/${section}`), {
      value: settings,
      updatedAt: Date.now(),
      updatedBy: userId,
    });
  }
}
