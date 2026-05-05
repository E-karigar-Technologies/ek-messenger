import { Injectable } from '@angular/core';
import { ApiService } from './api/api.service';
import { Observable, of, timer } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PresenceService {
  private lastOnlineCallTs = 0;
  private onlineCooldownMs = 3000;

  constructor(private api: ApiService) {}

  /**
   * Mark current user online (safe-guarded)
   */
  setOnline(userId: number) {
    const now = Date.now();
    if (now - this.lastOnlineCallTs < this.onlineCooldownMs) return of(null);
    this.lastOnlineCallTs = now;

    return this.api.markUserOnline(userId).pipe(
      // retry up to 3 times, waiting 1s between retries
      retry({ count: 3, delay: () => timer(1000) }),
      catchError(err => {
        console.warn('markUserOnline failed', err);
        return of(null);
      })
    );
  }

  /**
   * Mark current user offline
   */
  setOffline(userId: number) {
    return this.api.markUserOffline(userId).pipe(
      retry({ count: 3, delay: () => timer(1000) }),
      catchError(err => {
        console.warn('markUserOffline failed', err);
        return of(null);
      })
    );
  }

  /**
   * Get status for a user id
   */
  // getStatus(userId: number) {
  //   return this.api.getUserStatus(userId).pipe(
  //     catchError(err => {
  //       console.warn('getUserStatus failed', err);
  //       // align with expected return shape
  //       return of({ status: false, data: { is_online: 0, last_seen: null } });
  //     })
  //   );
  // }
   getStatus(userId: number): Observable<{ status: boolean; data: { is_online: number; last_seen: string | null } }> {
    if (!userId) {
      return of({ status: false, data: { is_online: 0, last_seen: null } });
    }

    const timezone = this.getDeviceTimezone();

    return this.api.setUserTimezone(userId, timezone).pipe(
      catchError(err => {
        console.warn('PresenceService.getStatus failed', err);
        // keep return shape consistent with previous usage
        return of({ status: false, data: { is_online: 0, last_seen: null } });
      })
    );
  }

  /**
   * Best-effort device timezone detection.
   * Falls back to 'UTC' if timezone cannot be determined.
   */
  private getDeviceTimezone(): string {
    try {
      if (typeof Intl !== 'undefined' && (Intl as any).DateTimeFormat) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz && typeof tz === 'string' && tz.length > 0) return tz;
      }
    } catch (e) {
      console.warn('Intl timezone detection failed', e);
    }
    return 'UTC';
  }
}
