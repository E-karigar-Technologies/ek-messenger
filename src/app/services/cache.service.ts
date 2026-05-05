import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

@Injectable({
  providedIn: 'root',
})
export class CacheService {
  private _storage: Storage | null = null;
  private _readyResolve!: () => void;
  public ready: Promise<void>;

  constructor(private storage: Storage) {
    // create a ready promise so others can wait for storage to be created
    this.ready = new Promise((resolve) => {
      this._readyResolve = resolve;
    });
    this.init();
  }

  private async init() {
    try {
      const s = await this.storage.create();
      this._storage = s;
    } catch (e) {
      console.warn('CacheService.init failed', e);
    } finally {
      // always resolve ready so callers don't hang
      this._readyResolve();
    }
  }

  /**
   * set value. ttlSeconds optional (number of seconds)
   */
  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this._storage) {
      await this.ready;
    }
    const data = {
      value,
      expiry: typeof ttlSeconds === 'number' ? Date.now() + ttlSeconds * 1000 : null,
    };
    try {
      await this._storage?.set(key, data);
    } catch (e) {
      console.error('CacheService.set error', e);
    }
  }

  /**
   * get typed value (returns null when expired / not present)
   */
  public async get<T = any>(key: string): Promise<T | null> {
    if (!this._storage) {
      await this.ready;
    }
    try {
      const data = await this._storage?.get(key);
      if (!data) return null;
      if (data.expiry && Date.now() > data.expiry) {
        await this._storage?.remove(key);
        return null;
      }
      return data.value as T;
    } catch (e) {
      console.error('CacheService.get error', e);
      return null;
    }
  }

  /**
   * remove single key or clear all
   */
  public async clear(key?: string): Promise<void> {
    if (!this._storage) {
      await this.ready;
    }
    try {
      if (key) await this._storage?.remove(key);
      else await this._storage?.clear();
    } catch (e) {
      console.error('CacheService.clear error', e);
    }
  }
}
