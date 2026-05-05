import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import {
  StatusDoc,
  StatusDraft,
  StatusFeedPayload,
  StatusPrivacyDefault,
  StatusPrivacyMode,
} from '../models/status.model';

@Injectable({
  providedIn: 'root',
})
export class StatusCacheService {
  private readonly mediaCacheFolder = 'status-media-cache';

  private feedKey(uid: string): string {
    return `status_feed_${uid}`;
  }

  private myKey(uid: string): string {
    return `status_my_${uid}`;
  }

  private seenQueueKey(uid: string): string {
    return `status_seen_queue_${uid}`;
  }

  private mediaKey(uid: string): string {
    return `status_media_cache_${uid}`;
  }

  private mediaFileIndexKey(uid: string): string {
    return `status_media_file_index_${uid}`;
  }

  private draftKey(uid: string): string {
    return `status_drafts_${uid}`;
  }

  private privacyDefaultKey(uid: string): string {
    return `status_privacy_default_${uid}`;
  }

  private async setJson(key: string, value: unknown): Promise<void> {
    await Preferences.set({ key, value: JSON.stringify(value) });
  }

  private async getJson<T>(key: string, fallback: T): Promise<T> {
    const { value } = await Preferences.get({ key });
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private isActiveStatus(status: StatusDoc): boolean {
    return !status.isDeleted && Number(status.expiresAt || 0) > Date.now();
  }

  private canUseFilesystemCache(): boolean {
    return Capacitor.getPlatform() !== 'web';
  }

  private hashString(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  private getMediaExtension(
    mediaUrl: string,
    contentType = '',
    mediaType?: StatusDoc['mediaType']
  ): string {
    const cleanUrl = String(mediaUrl || '').split('?')[0];
    const extFromUrl = cleanUrl.includes('.')
      ? cleanUrl.split('.').pop()?.toLowerCase() || ''
      : '';

    if (extFromUrl) {
      return extFromUrl;
    }

    const contentMap: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'image/heif': 'heif',
    };

    const fromContentType = contentMap[String(contentType).toLowerCase()] || '';
    if (fromContentType) {
      return fromContentType;
    }

    // Keep image/video extensions stable for offline rendering in WebView.
    if (mediaType === 'image') {
      return 'jpg';
    }
    if (mediaType === 'video') {
      return 'mp4';
    }

    return 'bin';
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });
  }

  private async getMediaFileIndex(uid: string): Promise<Record<string, string>> {
    return this.getJson<Record<string, string>>(this.mediaFileIndexKey(uid), {});
  }

  private async saveMediaFileIndex(uid: string, index: Record<string, string>): Promise<void> {
    await this.setJson(this.mediaFileIndexKey(uid), index);
  }

  async getCachedMediaUri(uid: string, mediaUrl: string): Promise<string | null> {
    if (!uid || !mediaUrl || !this.canUseFilesystemCache()) {
      return null;
    }

    const index = await this.getMediaFileIndex(uid);
    const path = index[mediaUrl];
    if (!path) {
      return null;
    }

    try {
      const uriResult = await Filesystem.getUri({
        directory: Directory.Data,
        path,
      });
      return uriResult?.uri || null;
    } catch {
      delete index[mediaUrl];
      await this.saveMediaFileIndex(uid, index);
      return null;
    }
  }

  async cacheMediaFromUrl(
    uid: string,
    mediaUrl: string,
    mediaType?: StatusDoc['mediaType']
  ): Promise<string | null> {
    if (!uid || !mediaUrl || !this.canUseFilesystemCache()) {
      return null;
    }

    const existing = await this.getCachedMediaUri(uid, mediaUrl);
    if (existing) {
      return existing;
    }

    const extension = this.getMediaExtension(mediaUrl, '', mediaType);
    const fileName = `${this.hashString(mediaUrl)}.${extension}`;
    const relativePath = `${this.mediaCacheFolder}/${uid}/${fileName}`;

    try {
      await Filesystem.downloadFile({
        url: mediaUrl,
        path: relativePath,
        directory: Directory.Data,
        recursive: true,
      });

      const index = await this.getMediaFileIndex(uid);
      index[mediaUrl] = relativePath;
      await this.saveMediaFileIndex(uid, index);
      await this.markMediaCached(uid, mediaUrl);

      const uriResult = await Filesystem.getUri({
        directory: Directory.Data,
        path: relativePath,
      });

      return uriResult?.uri || null;
    } catch {
      // Fallback for environments where downloadFile is unavailable/blocked.
    }

    try {
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      const fallbackContentType =
        blob.type || (mediaType === 'video' ? 'video/mp4' : mediaType === 'image' ? 'image/jpeg' : '');
      const fallbackExtension = this.getMediaExtension(mediaUrl, fallbackContentType, mediaType);
      const fallbackFileName = `${this.hashString(mediaUrl)}.${fallbackExtension}`;
      const fallbackRelativePath = `${this.mediaCacheFolder}/${uid}/${fallbackFileName}`;
      const data = await this.blobToBase64(blob);

      await Filesystem.writeFile({
        directory: Directory.Data,
        path: fallbackRelativePath,
        data,
        recursive: true,
      });

      const index = await this.getMediaFileIndex(uid);
      index[mediaUrl] = fallbackRelativePath;
      await this.saveMediaFileIndex(uid, index);
      await this.markMediaCached(uid, mediaUrl);

      const uriResult = await Filesystem.getUri({
        directory: Directory.Data,
        path: fallbackRelativePath,
      });

      return uriResult?.uri || null;
    } catch {
      return null;
    }
  }

  private normalizeFeed(payload: StatusFeedPayload): StatusFeedPayload {
    const cleanGroup = (group: any) => {
      const rawStatuses: StatusDoc[] = Array.isArray(group?.statuses)
        ? (group.statuses as StatusDoc[])
        : [];
      const statuses: StatusDoc[] = rawStatuses.filter((status: StatusDoc) =>
        this.isActiveStatus(status)
      );
      const unseenCount = statuses.filter((status: StatusDoc) => !status.seen).length;

      return {
        ownerUid: String(group?.ownerUid || ''),
        ownerName: String(group?.ownerName || ''),
        ownerAvatar: String(group?.ownerAvatar || ''),
        latestCreatedAt: Number(group?.latestCreatedAt || 0),
        unseenCount,
        statuses,
      };
    };

    return {
      generatedAt: Number(payload?.generatedAt || Date.now()),
      recentUpdates: (payload?.recentUpdates || [])
        .map(cleanGroup)
        .filter((group: any) => group.ownerUid && group.statuses.length > 0),
      mutedUpdates: (payload?.mutedUpdates || [])
        .map(cleanGroup)
        .filter((group: any) => group.ownerUid && group.statuses.length > 0),
      hiddenUpdates: (payload?.hiddenUpdates || [])
        .map(cleanGroup)
        .filter((group: any) => group.ownerUid && group.statuses.length > 0),
    };
  }

  async saveFeed(uid: string, payload: StatusFeedPayload): Promise<void> {
    const normalized = this.normalizeFeed(payload);
    await this.setJson(this.feedKey(uid), normalized);
  }

  async getFeed(uid: string): Promise<StatusFeedPayload | null> {
    const payload = await this.getJson<StatusFeedPayload | null>(
      this.feedKey(uid),
      null
    );

    if (!payload) {
      return null;
    }

    return this.normalizeFeed(payload);
  }

  async saveMyStatuses(uid: string, statuses: StatusDoc[]): Promise<void> {
    const filtered = (statuses || []).filter((status) => this.isActiveStatus(status));
    await this.setJson(this.myKey(uid), filtered);
  }

  async getMyStatuses(uid: string): Promise<StatusDoc[]> {
    const statuses = await this.getJson<StatusDoc[]>(this.myKey(uid), []);
    return (statuses || []).filter((status) => this.isActiveStatus(status));
  }

  async enqueueSeen(uid: string, statusId: string): Promise<void> {
    const queue = new Set(await this.getJson<string[]>(this.seenQueueKey(uid), []));
    queue.add(statusId);
    await this.setJson(this.seenQueueKey(uid), Array.from(queue));
  }

  async dequeueSeen(uid: string, statusId: string): Promise<void> {
    const queue = new Set(await this.getJson<string[]>(this.seenQueueKey(uid), []));
    queue.delete(statusId);
    await this.setJson(this.seenQueueKey(uid), Array.from(queue));
  }

  async getSeenQueue(uid: string): Promise<string[]> {
    return this.getJson<string[]>(this.seenQueueKey(uid), []);
  }

  async markMediaCached(uid: string, mediaUrl: string): Promise<void> {
    if (!mediaUrl) return;

    const cached = new Set(await this.getJson<string[]>(this.mediaKey(uid), []));
    cached.add(mediaUrl);
    await this.setJson(this.mediaKey(uid), Array.from(cached));
  }

  async isMediaCached(uid: string, mediaUrl: string): Promise<boolean> {
    if (!mediaUrl) return false;

    const cached = await this.getJson<string[]>(this.mediaKey(uid), []);
    if (!cached.includes(mediaUrl)) {
      return false;
    }

    if (!this.canUseFilesystemCache()) {
      return true;
    }

    const uri = await this.getCachedMediaUri(uid, mediaUrl);
    return !!uri;
  }

  async saveDraft(uid: string, draft: Omit<StatusDraft, 'draftId' | 'createdAt'>): Promise<StatusDraft> {
    const drafts = await this.getDrafts(uid);
    const saved: StatusDraft = {
      draftId: crypto.randomUUID(),
      createdAt: Date.now(),
      ...draft,
    };

    drafts.unshift(saved);
    await this.setJson(this.draftKey(uid), drafts);
    return saved;
  }

  async getDrafts(uid: string): Promise<StatusDraft[]> {
    return this.getJson<StatusDraft[]>(this.draftKey(uid), []);
  }

  async deleteDraft(uid: string, draftId: string): Promise<void> {
    const drafts = await this.getDrafts(uid);
    const filtered = drafts.filter((draft) => draft.draftId !== draftId);
    await this.setJson(this.draftKey(uid), filtered);
  }

  async savePrivacyDefault(uid: string, value: StatusPrivacyDefault): Promise<void> {
    await this.setJson(this.privacyDefaultKey(uid), value);
  }

  async getPrivacyDefault(uid: string): Promise<StatusPrivacyDefault | null> {
    return this.getJson<StatusPrivacyDefault | null>(this.privacyDefaultKey(uid), null);
  }

  getFallbackPrivacy(uid: string): StatusPrivacyDefault {
    return {
      uid,
      privacyMode: 'my_contacts',
      privacyUsers: {},
    };
  }
}
