// src/app/pages/services/post.ts
import { Injectable } from '@angular/core';
import {
  Database,
  ref,
  push,
  set,
  onValue,
  get,
  remove,
  off,
  DatabaseReference
} from '@angular/fire/database';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment.prod';
import { AuthService } from 'src/app/auth/auth.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { ChannelPouchDbService, CachedPost, PendingAction } from './pouch-db';
import { FileStorageService } from './file-storage';
import { ChatBackendSocketService } from 'src/app/services/chat-backend-socket.service';

export interface UserReaction {
  emoji: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class PostService {
  private currentUserId!: any;
  private postsRefMap = new Map<string, DatabaseReference>();
  private baseUrl = environment.apiBaseUrl;
  private UPLOAD_API = `${this.baseUrl}/api/media/channel_media/upload-url`;
  private DOWNLOAD_API_BASE = `${this.baseUrl}/api/media/download-url`;

  // Connection status
  private isOnlineSubject = new BehaviorSubject<boolean>(true);

  // ✨ NEW: Refresh triggers for each channel
  private refreshTriggers = new Map<string, BehaviorSubject<void>>();

  constructor(
    private db: Database,
    private http: HttpClient,
    private authService: AuthService,
    private pouchDb: ChannelPouchDbService,
    private fileStorage: FileStorageService,
    private firebaseChatService: FirebaseChatService,
    private chatSocket: ChatBackendSocketService
  ) {
    this.currentUserId = this.authService.authData?.userId || 0;
    this.monitorConnection();
  }

  /* =========================
     CONNECTION MONITORING
     ========================= */

  private monitorConnection() {
    const connectedRef = ref(this.db, '.info/connected');
    
    onValue(connectedRef, (snapshot) => {
      const isConnected = snapshot.val() === true;
      this.isOnlineSubject.next(isConnected);

      if (isConnected) {
        console.log('🟢 Firebase connected, flushing queue...');
        this.flushQueue();
      } else {
        console.log('📴 Firebase disconnected');
      }
    });

    window.addEventListener('online', () => {
      console.log('🟢 Browser online');
      this.flushQueue();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Browser offline');
    });
  }

  getConnectionStatus(): Observable<boolean> {
    return this.isOnlineSubject.asObservable();
  }

  /* =========================
     ✨ NEW: REFRESH POSTS
     ========================= */

  /**
   * Force refresh posts from server
   * @param channelId - Channel to refresh
   */
  async refreshPosts(channelId: string): Promise<void> {
    if (!this.isOnlineSubject.value) {
      throw new Error('Cannot refresh while offline');
    }

    try {
      console.log(`🔄 Refreshing posts for channel ${channelId}...`);

      const postsRef = ref(this.db, `channels/${channelId}/posts`);
      const snapshot = await get(postsRef);
      
      const data = snapshot.val() || {};
      const firebasePosts: CachedPost[] = Object.keys(data)
        .map(id => ({ id, ...data[id] }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      console.log(`✅ Refreshed ${firebasePosts.length} posts`);

      // Update cache
      await this.pouchDb.savePosts(channelId, firebasePosts);

      // ✅ Download any missing server images
      for (const post of firebasePosts) {
        if (post.media_id && !post.isPending) {
          const serverFileId = `server_${post.media_id}`;
          const exists = await this.fileStorage.fileExists(serverFileId);
          
          if (!exists) {
            // Download in background
            this.downloadAndCacheServerImage(post.media_id, channelId);
          }
        }
      }

      // Trigger refresh for observers
      const trigger = this.refreshTriggers.get(channelId);
      if (trigger) {
        trigger.next();
      }

      console.log('✅ Posts refreshed successfully');

    } catch (error) {
      console.error('❌ Failed to refresh posts:', error);
      throw error;
    }
  }

  /* =========================
     CREATE POST - UPDATED
     ========================= */

  async createPost(
    channelId: string,
    body: string,
    file?: File,
    senderId?: number,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    const tempPostId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tempImageId = file ? `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : undefined;

    console.log('🚀 createPost called:', {
      channelId,
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      tempPostId,
      tempImageId
    });

    // 1️⃣ ✅ ALWAYS Store file in IndexedDB (even when online!)
    let objectURL: string | undefined;
    if (file && tempImageId) {
      try {
        await this.fileStorage.storeFile(tempImageId, file);
        const url = await this.fileStorage.getFileURL(tempImageId);
        objectURL = url ?? undefined;
        console.log(`✅ Image stored in IndexedDB: ${tempImageId}`);
      } catch (error) {
        console.error('❌ Failed to store image:', error);
      }
    }

    // 2️⃣ Create optimistic post
    const optimisticPost: CachedPost = {
      id: tempPostId,
      body,
      created_by: senderId || this.currentUserId,
      timestamp: Date.now(),
      user_reactions: {},
      isPending: true,
      pendingImageId: tempImageId,
      image: objectURL,
      media_id: tempImageId ? 'pending_upload' : undefined
    };

    // 3️⃣ Add to cache
    const existingPosts = await this.pouchDb.getPosts(channelId);
    await this.pouchDb.savePosts(channelId, [...existingPosts, optimisticPost], true);
    console.log('✅ Optimistic post added to cache');

    // 4️⃣ Queue the action
    const action: PendingAction = {
      type: 'post_create',
      channelId,
      data: {
        body,
        fileId: tempImageId,
        senderId,
        tempPostId,
        tempImageId
      },
      timestamp: Date.now()
    };

    await this.pouchDb.enqueueAction(action);
    console.log(`📝 Post queued: ${tempPostId}`);

    // 5️⃣ Try immediate execution if online
    if (this.isOnlineSubject.value) {
      try {
        // Retrieve file from IndexedDB
        let fileToUpload: File | undefined;
        
        if (tempImageId) {
          const storedBlob = await this.fileStorage.getFile(tempImageId);
          
          if (storedBlob) {
            const fileInfo = await this.fileStorage.getFileInfo(tempImageId);
            fileToUpload = new File(
              [storedBlob], 
              fileInfo?.fileName || `image_${tempImageId}.jpg`, 
              { type: storedBlob.type || 'image/jpeg' }
            );
            
            console.log('✅ File retrieved from IndexedDB:', {
              name: fileToUpload.name,
              size: fileToUpload.size,
              type: fileToUpload.type
            });
          } else {
            console.error('❌ File not found in IndexedDB:', tempImageId);
          }
        }

        // ✅ Execute with callback to get real post data
        const realPost = await this.executeCreatePost(
          { ...action, data: { ...action.data, file: fileToUpload } },
          progressCallback
        );
        
        // ✅ Download server image for offline access
        if (realPost?.media_id) {
          await this.downloadAndCacheServerImage(realPost.media_id, channelId);
        }
        
        // Clean up
        await this.removeActionFromQueue(tempPostId);
        await this.removeOptimisticPost(channelId, tempPostId);
        
        // ✅ Keep temp file until server image is downloaded
        // Delete in background after delay
        if (tempImageId) {
          setTimeout(async () => {
            await this.fileStorage.deleteFile(tempImageId);
            console.log(`🧹 Deleted temp file: ${tempImageId}`);
          }, 5000); // 5 second delay
        }
        
        console.log(`✅ Post created: ${tempPostId}`);
        
      } catch (error: any) {
        console.error('❌ Failed to create post:', error);
      }
    } else {
      console.log('📴 Offline: Post queued');
    }
  }

  /* =========================
     ✅ DOWNLOAD SERVER IMAGE
     ========================= */

  /**
   * Download server image and store in IndexedDB for offline access
   */
  private async downloadAndCacheServerImage(
    mediaId: string,
    channelId: string
  ): Promise<void> {
    try {
      console.log(`⬇️ Downloading server image: ${mediaId}`);
      
      // Get download URL
      const response = await this.getFreshMediaUrl(mediaId);
      
      if (!response?.downloadUrl) {
        console.error('❌ No download URL available');
        return;
      }

      // Download image as blob
      const imageResponse = await fetch(response.downloadUrl);
      if (!imageResponse.ok) {
        throw new Error('Failed to download image');
      }

      const blob = await imageResponse.blob();
      
      // Store in IndexedDB with server media_id
      const serverFileId = `server_${mediaId}`;
      await this.fileStorage.storeFile(
        serverFileId,
        new File([blob], `${mediaId}.jpg`, { type: blob.type })
      );
      
      console.log(`✅ Downloaded and cached server image: ${mediaId}`);

      // ✅ Update cached posts to use local file
      const posts = await this.pouchDb.getPosts(channelId);
      const updated = posts.map(post => {
        if (post.media_id === mediaId) {
          return {
            ...post,
            pendingImageId: serverFileId // Now points to local copy
          };
        }
        return post;
      });

      await this.pouchDb.savePosts(channelId, updated, true);

    } catch (error) {
      console.error('⚠️ Failed to download server image:', error);
      // Don't throw - this is optimization only
    }
  }

  /* =========================
     HELPER METHODS
     ========================= */

  private async removeActionFromQueue(tempPostId: string): Promise<void> {
    const queue = await this.pouchDb.getQueue();
    const index = queue.findIndex(
      action => action.type === 'post_create' && action.data.tempPostId === tempPostId
    );
    
    if (index !== -1) {
      await this.pouchDb.removeFromQueue(index);
    }
  }

  private async removeOptimisticPost(channelId: string, tempPostId: string): Promise<void> {
    try {
      const posts = await this.pouchDb.getPosts(channelId);
      const filteredPosts = posts.filter(p => p.id !== tempPostId);
      
      if (filteredPosts.length !== posts.length) {
        await this.pouchDb.savePosts(channelId, filteredPosts, true);
      }
    } catch (error) {
      console.error('❌ Failed to remove optimistic post:', error);
    }
  }

  /* =========================
     QUEUE MANAGEMENT
     ========================= */

  private async flushQueue() {
    const queue = await this.pouchDb.getQueue();
    
    if (queue.length === 0) return;

    console.log(`🔄 Flushing ${queue.length} queued actions...`);

    for (let i = queue.length - 1; i >= 0; i--) {
      const action = queue[i];

      try {
        switch (action.type) {
          case 'post_create':
            // Retrieve file from IndexedDB
            let fileToUpload: File | undefined;
            
            if (action.data.fileId) {
              const storedBlob = await this.fileStorage.getFile(action.data.fileId);
              
              if (storedBlob) {
                const fileInfo = await this.fileStorage.getFileInfo(action.data.fileId);
                fileToUpload = new File(
                  [storedBlob], 
                  fileInfo?.fileName || `image_${action.data.fileId}.jpg`, 
                  { type: storedBlob.type || 'image/jpeg' }
                );
                console.log(`✅ File retrieved for queue: ${action.data.fileId}`);
              }
            }

            const realPost = await this.executeCreatePost({
              ...action,
              data: { ...action.data, file: fileToUpload }
            });
            
            // ✅ Download server image
            if (realPost?.media_id) {
              await this.downloadAndCacheServerImage(realPost.media_id, action.channelId!);
            }
            
            // Clean up
            await this.pouchDb.removeFromQueue(i);
            await this.removeOptimisticPost(action.channelId!, action.data.tempPostId);
            
            if (action.data.fileId) {
              setTimeout(async () => {
                await this.fileStorage.deleteFile(action.data.fileId);
              }, 5000);
            }
            
            console.log(`✅ Synced post: ${action.data.tempPostId}`);
            break;

          case 'reaction_add':
            await this.firebaseChatService.applySecuredBatchUpdates({
              [`channels/${action.channelId}/posts/${action.postId}/user_reactions/${action.data.userId}`]: {
                emoji: action.data.emoji,
                timestamp: Date.now()
              }
            });
            await this.pouchDb.removeFromQueue(i);
            break;

            await this.firebaseChatService.applySecuredBatchUpdates({
              [`channels/${action.channelId}/posts/${action.postId}/user_reactions/${action.data.userId}`]: null
            });
            await this.pouchDb.removeFromQueue(i);
            break;
        }

      } catch (error: any) {
        console.error(`❌ Failed to sync ${action.type}:`, error);
        
        action.retryCount = (action.retryCount || 0) + 1;
        
        if (action.retryCount > 3) {
          console.error(`❌ Removing after 3 retries`);
          await this.pouchDb.removeFromQueue(i);
          
          if (action.type === 'post_create') {
            await this.removeOptimisticPost(action.channelId!, action.data.tempPostId);
            if (action.data.fileId) {
              await this.fileStorage.deleteFile(action.data.fileId);
            }
          }
        }
        break;
      }
    }
  }

  /* =========================
     EXECUTE CREATE POST
     ========================= */

  private async executeCreatePost(
    action: PendingAction,
    progressCallback?: (progress: number) => void
  ): Promise<any> {
    const { body, file, senderId } = action.data;
    let mediaId: string | null = null;

    console.log('🔄 Executing createPost:', {
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      channelId: action.channelId
    });

    try {
      // 1️⃣ Upload file if exists
      if (file) {
        console.log('📤 Starting file upload...');

        const uploadPayload = {
          channel_id: parseInt(action.channelId!),
          sender_id: senderId || this.currentUserId,
          media_type: file.type.startsWith('image/') ? 'image' : 'video',
          file_size: file.size,
          content_type: file.type,
          metadata: { caption: body }
        };

        console.log('📤 Upload payload:', uploadPayload);

        const uploadResponse = await this.http
          .post<any>(this.UPLOAD_API, uploadPayload)
          .toPromise();

        console.log('✅ Upload response:', uploadResponse);

        if (!uploadResponse?.status) {
          throw new Error('Failed to get upload URL');
        }

        if (!uploadResponse.media_id) {
          throw new Error('No media_id in response');
        }

        if (!uploadResponse.upload_url) {
          throw new Error('No upload_url in response');
        }

        mediaId = uploadResponse.media_id;
        console.log(`✅ Got media_id: ${mediaId}`);

        // Upload to signed URL
        console.log('📤 Uploading to signed URL...');
        
        await new Promise<void>((resolve, reject) => {
          this.http.put(uploadResponse.upload_url, file, {
            observe: 'events',
            reportProgress: true,
            headers: {
              'Content-Type': file.type
            }
          }).subscribe({
            next: (event: any) => {
              if (event.type === HttpEventType.UploadProgress) {
                const progress = Math.round(100 * event.loaded / (event.total || 1));
                console.log(`📊 Upload progress: ${progress}%`);
                if (progressCallback) {
                  progressCallback(progress);
                }
              } else if (event.type === HttpEventType.Response) {
                console.log('✅ File uploaded');
                resolve();
              }
            },
            error: (err) => {
              console.error('❌ Upload failed:', err);
              reject(err);
            }
          });
        });

        console.log(`✅ File uploaded with media_id: ${mediaId}`);
      }

      const postData: any = {
        body,
        created_by: senderId || this.currentUserId,
        timestamp: Date.now(),
        user_reactions: {}
      };

      // Only add media_id if it exists
      if (mediaId) {
        postData.media_id = mediaId;
      }

      console.log('📝 Post data:', postData);

      // ✅ SECURE ID GENERATION: Generate a unique ID purely client-side
      const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // ✅ Switch RTDB direct write to backend Socket Command (CQRS)
      await this.chatSocket.createChannelPost({
        channelId: String(action.channelId),
        postId: postId,
        postData: postData
      });

      console.log(`✅ Post created in Firebase: ${postId}`);

      // ✅ Return post data for further processing
      return {
        id: postId,
        ...postData
      };

    } catch (error: any) {
      console.error('❌ Failed to create post:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /* =========================
     GET POSTS - UPDATED
     ========================= */

  getPosts(channelId: string): Observable<CachedPost[]> {
    const postsRef = ref(this.db, `channels/${channelId}/posts`);
    this.postsRefMap.set(channelId, postsRef);

    // ✨ Create refresh trigger if doesn't exist
    if (!this.refreshTriggers.has(channelId)) {
      this.refreshTriggers.set(channelId, new BehaviorSubject<void>(undefined));
    }

    return new Observable((observer) => {
      let hasEmitted = false;

      // Load from cache first
      this.pouchDb.getPosts(channelId).then(cachedPosts => {
        if (cachedPosts.length > 0) {
          console.log(`📱 Loaded ${cachedPosts.length} posts from cache`);
          observer.next(cachedPosts);
          hasEmitted = true;
        }
      });

      // Setup Firebase listener
      onValue(postsRef, async (snapshot) => {
        const data = snapshot.val() || {};
        const firebasePosts: CachedPost[] = Object.keys(data)
          .map(id => ({ id, ...data[id] }))
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        console.log(`🔥 Firebase: ${firebasePosts.length} posts`);

        // ✅ Download any missing server images in background
        for (const post of firebasePosts) {
          if (post.media_id && !post.isPending) {
            const serverFileId = `server_${post.media_id}`;
            const exists = await this.fileStorage.fileExists(serverFileId);
            
            if (!exists && this.isOnlineSubject.value) {
              // Download in background
              this.downloadAndCacheServerImage(post.media_id, channelId);
            }
          }
        }

        await this.pouchDb.savePosts(channelId, firebasePosts);
        observer.next(firebasePosts);
        hasEmitted = true;

      }, (error) => {
        console.error('❌ Firebase error:', error);
        
        if (!hasEmitted) {
          this.pouchDb.getPosts(channelId).then(cachedPosts => {
            observer.next(cachedPosts);
          });
        }
      });
    });
  }

  cleanupPostsListener(channelId: string) {
    const ref = this.postsRefMap.get(channelId);
    if (ref) {
      off(ref);
      this.postsRefMap.delete(channelId);
    }

    // ✨ Clean up refresh trigger
    const trigger = this.refreshTriggers.get(channelId);
    if (trigger) {
      trigger.complete();
      this.refreshTriggers.delete(channelId);
    }
  }

  /* =========================
     MEDIA & REACTIONS
     ========================= */

  async getFreshMediaUrl(mediaId: string): Promise<{ downloadUrl: string }> {
    const cachedUrl = await this.pouchDb.getMediaUrl(mediaId);
    if (cachedUrl) {
      return { downloadUrl: cachedUrl };
    }

    try {
      const response = await this.http.get<any>(
        `${this.DOWNLOAD_API_BASE}/${mediaId}`
      ).toPromise();

      if (response?.downloadUrl) {
        await this.pouchDb.cacheMediaUrl(mediaId, response.downloadUrl);
      }

      return response;
    } catch (error) {
      console.error('❌ Failed to get media URL:', error);
      throw error;
    }
  }

  /* =========================
     REACTIONS
     ========================= */

  async addOrUpdateReaction(
    channelId: string,
    postId: string,
    emoji: string,
    userId?: number
  ) {
    const uid = userId || this.currentUserId;
    const userReactionRef = ref(
      this.db,
      `channels/${channelId}/posts/${postId}/user_reactions/${uid}`
    );

    const snapshot = await get(userReactionRef);
    const existingReaction = snapshot.val() as UserReaction | null;

    if (existingReaction?.emoji === emoji) {
      await this.removeReaction(channelId, postId, userId);
      return;
    }

    const tempActionId = `reaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const action: PendingAction = {
      type: 'reaction_add',
      channelId,
      postId,
      data: { emoji, userId: uid, tempActionId },
      timestamp: Date.now()
    };

    await this.pouchDb.enqueueAction(action);

    if (this.isOnlineSubject.value) {
      try {
        await this.firebaseChatService.applySecuredBatchUpdates({
          [`channels/${channelId}/posts/${postId}/user_reactions/${uid}/emoji`]: emoji,
          [`channels/${channelId}/posts/${postId}/user_reactions/${uid}/timestamp`]: Date.now()
        });

        await this.removeActionFromQueue(tempActionId);
        console.log('✅ Reaction added and removed from queue');

      } catch (error) {
        console.error('❌ Failed to add reaction, will retry later:', error);
      }
    } else {
      console.log('📴 Offline: Reaction queued');
    }
  }

  async removeReaction(channelId: string, postId: string, userId?: number) {
    const uid = userId || this.currentUserId;
    const userReactionRef = ref(
      this.db,
      `channels/${channelId}/posts/${postId}/user_reactions/${uid}`
    );

    const tempActionId = `reaction_remove_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const action: PendingAction = {
      type: 'reaction_remove',
      channelId,
      postId,
      data: { userId: uid, tempActionId },
      timestamp: Date.now()
    };

    await this.pouchDb.enqueueAction(action);

    if (this.isOnlineSubject.value) {
      try {
        await this.firebaseChatService.applySecuredBatchUpdates({
          [`channels/${channelId}/posts/${postId}/user_reactions/${uid}`]: null
        });
        await this.removeActionFromQueue(tempActionId);
        console.log('✅ Reaction removed and removed from queue');

      } catch (error) {
        console.error('❌ Failed to remove reaction, will retry later:', error);
      }
    } else {
      console.log('📴 Offline: Reaction removal queued');
    }
  }

  async getUserReaction(
    channelId: string,
    postId: string,
    userId?: number
  ): Promise<string | null> {
    const uid = userId || this.currentUserId;
    const userReactionRef = ref(
      this.db,
      `channels/${channelId}/posts/${postId}/user_reactions/${uid}`
    );

    return new Promise((resolve) => {
      onValue(userReactionRef, (snapshot) => {
        const val = snapshot.val();
        resolve(val ? val.emoji : null);
      }, { onlyOnce: true });
    });
  }

  aggregateReactions(
    userReactions: { [userId: string]: UserReaction } | null
  ): { [emoji: string]: number } {
    if (!userReactions) return {};

    const aggregated: { [emoji: string]: number } = {};
    Object.values(userReactions).forEach(reaction => {
      aggregated[reaction.emoji] = (aggregated[reaction.emoji] || 0) + 1;
    });

    return aggregated;
  }

  /* =========================
     UTILITY
     ========================= */

  async clearCache() {
    await this.pouchDb.clearAll();
    console.log('✅ Post cache cleared');
  }

  async getQueueStatus() {
    const queue = await this.pouchDb.getQueue();

    const postActions = queue.filter(a =>
      a.type === 'post_create' ||
      a.type === 'reaction_add' ||
      a.type === 'reaction_remove'
    );

    return {
      pending: postActions.length,
      actions: postActions
    };
  }

  async getAllQueuedActions() {
    const queue = await this.pouchDb.getQueue();
    return queue;
  }

  async getStorageStatus() {
    const [fileUsage, queueStatus] = await Promise.all([
      this.fileStorage.getStorageUsage(),
      this.getQueueStatus()
    ]);

    return {
      files: fileUsage,
      queue: queueStatus
    };
  }

  async clearAllOfflineData() {
    await Promise.all([
      this.fileStorage.clearAllFiles(),
      this.pouchDb.clearAll()
    ]);
    console.log('✅ Cleared all offline data');
  }

  async cleanupOldData(daysOld: number = 7) {
    const [deletedFiles] = await Promise.all([
      this.fileStorage.clearOldFiles(daysOld),
      this.pouchDb.clearOldMediaCache(daysOld)
    ]);

    console.log(`🧹 Cleaned up ${deletedFiles} old files`);
    return { deletedFiles };
  }
}