import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { environment } from 'src/environments/environment';
import {
  StatusDoc,
  StatusFeedPayload,
  StatusPrivacyDefault,
  StatusPrivacyMode,
  StatusViewDoc,
} from '../models/status.model';

interface ApiResponse<T = unknown> {
  status: boolean;
  message?: string;
  data?: T;
}

interface StatusPresignResponse extends ApiResponse {
  uploadUrl?: string;
  upload_url?: string;
  fileKey?: string;
  file_key?: string;
  mediaType?: 'image' | 'video';
  contentType?: string;
  maxSizeBytes?: number;
  expiresInSeconds?: number;
}

interface StatusFeedResponse extends ApiResponse<StatusFeedPayload> {
  generatedAt?: number;
  recentUpdates?: StatusFeedPayload['recentUpdates'];
  mutedUpdates?: StatusFeedPayload['mutedUpdates'];
  hiddenUpdates?: StatusFeedPayload['hiddenUpdates'];
}

interface StatusMyResponse extends ApiResponse<{ statuses?: StatusDoc[] }> {
  statuses?: StatusDoc[];
}

interface StatusPrivacyResponse extends ApiResponse<{ privacy?: StatusPrivacyDefault }> {
  privacy?: StatusPrivacyDefault;
}

interface StatusViewsResponse extends ApiResponse<{ views?: StatusViewDoc[] }> {
  statusId?: string;
  viewCount?: number;
  views?: StatusViewDoc[];
}

@Injectable({
  providedIn: 'root',
})
export class StatusApiService {
  private readonly baseUrl = environment.chatBackendSocketUrl;

  constructor(private http: HttpClient) {}

  private resolveBackendBaseUrl(rawBaseUrl: string): string {
    const platform = Capacitor.getPlatform();
    if (platform !== 'android') {
      return rawBaseUrl;
    }

    try {
      const parsed = new URL(rawBaseUrl);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        parsed.hostname = '10.0.2.2';
      }
      return parsed.toString();
    } catch {
      return rawBaseUrl
        .replace('://localhost', '://10.0.2.2')
        .replace('://127.0.0.1', '://10.0.2.2');
    }
  }

  private url(path: string): string {
    const resolved = this.resolveBackendBaseUrl(this.baseUrl);
    const base = resolved.endsWith('/')
      ? resolved.slice(0, -1)
      : resolved;
    return `${base}/status${path}`;
  }

  presignUpload(file: File): Observable<StatusPresignResponse> {
    return this.http.post<StatusPresignResponse>(this.url('/presign'), {
      contentType: file.type,
      fileSize: file.size,
    });
  }

  createStatus(payload: {
    ownerName?: string;
    ownerAvatar?: string;
    mediaType: 'image' | 'video';
    caption?: string;
    fileKey: string;
    thumbnailKey?: string;
    mediaUrl?: string;
    thumbnailUrl?: string;
    allowReplies?: boolean;
    privacyMode?: StatusPrivacyMode;
    privacyUsers?: Record<string, true>;
  }): Observable<ApiResponse<{ statusDoc: StatusDoc }>> {
    return this.http.post<ApiResponse<{ statusDoc: StatusDoc }>>(
      this.url('/create'),
      payload
    );
  }

  getFeed(limit = 250): Observable<StatusFeedResponse> {
    return this.http.get<StatusFeedResponse>(this.url('/feed'), {
      params: { limit: String(limit) },
    });
  }

  markViewed(statusId: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(this.url('/view'), { statusId });
  }

  getStatusViews(statusId: string, limit = 200): Observable<StatusViewsResponse> {
    return this.http.get<StatusViewsResponse>(this.url(`/views/${statusId}`), {
      params: { limit: String(limit) },
    });
  }

  replyToStatus(
    statusId: string,
    payload: { replyText?: string; reaction?: string }
  ): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(this.url('/reply'), {
      statusId,
      ...payload,
    });
  }

  muteOwner(ownerUid: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(this.url('/mute'), { ownerUid });
  }

  unmuteOwner(ownerUid: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(this.url('/unmute'), { ownerUid });
  }

  hideOwner(ownerUid: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(this.url('/hide'), { ownerUid });
  }

  unhideOwner(ownerUid: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(this.url('/unhide'), { ownerUid });
  }

  getMyStatuses(includeExpired = false): Observable<StatusMyResponse> {
    return this.http.get<StatusMyResponse>(this.url('/my'), {
      params: {
        includeExpired: includeExpired ? 'true' : 'false',
      },
    });
  }

  deleteStatus(statusId: string): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(this.url(`/${statusId}`));
  }

  savePrivacyDefault(payload: {
    privacyMode: StatusPrivacyMode;
    privacyUsers: Record<string, true>;
  }): Observable<StatusPrivacyResponse> {
    const privacyUsersMap = payload.privacyUsers || {};
    const privacyUsersArray = Object.keys(privacyUsersMap).filter(
      (uid) => !!privacyUsersMap[uid]
    );

    return this.http.post<StatusPrivacyResponse>(
      this.url('/privacy-default'),
      {
        privacyMode: payload.privacyMode,
        privacyUsers: privacyUsersMap,
        privacyUsersMap,
        privacyUsersArray,
      }
    );
  }

  getPrivacyDefault(): Observable<StatusPrivacyResponse> {
    return this.http.get<StatusPrivacyResponse>(
      this.url('/privacy-default')
    );
  }

  putFileToPresignedUrl(uploadUrl: string, file: File): Promise<Response> {
    return fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });
  }
}
