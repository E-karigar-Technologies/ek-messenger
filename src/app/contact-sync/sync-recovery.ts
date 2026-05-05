import { Injectable } from '@angular/core';
import { App, AppState } from '@capacitor/app';
import { Network, ConnectionStatus } from '@capacitor/network';
import { firstValueFrom } from 'rxjs';
import { SyncQueueService } from './sync-queue';
import { SyncApiService } from './sync-api';
import { SyncState } from './sync-state';
import { SyncQueueDoc } from './model/sync-queue.model';
import { AuthService } from '../auth/auth.service';


@Injectable({ providedIn: 'root' })
export class SyncRecoveryService {

  private isOnline = true;
  private listenerHandles: any[] = [];
  private readonly maxHashesPerRequest = 10000;

  constructor(
    private queueService: SyncQueueService,
    private apiService: SyncApiService,
    private syncState: SyncState,
    private authService: AuthService
  ) {
    this.initialize();
  }

  private async initialize() {
    // 1. Initial check on app boot
    await this.checkAndResume();

    // 2. App resume / foreground
    const appListener = App.addListener('appStateChange', async (state: AppState) => {
      if (state.isActive) { // foreground
        await this.checkAndResume();
      }
    });
    this.listenerHandles.push(appListener);

    // 3. Network changes
    const netListener = Network.addListener('networkStatusChange', async (status: ConnectionStatus) => {
      this.isOnline = status.connected;

      if (this.isOnline) {
        await this.checkAndResume();
      }
    });
    this.listenerHandles.push(netListener);

    // Optional: initial network status
    const initialStatus = await Network.getStatus();
    this.isOnline = initialStatus.connected;
  }

  async checkAndResume(): Promise<void> {
    if (!this.isOnline) return;
    if (!this.authService.isAuthenticated || !this.authService.authData?.app_token) return;

    const pending = await this.queueService.getPendingBatches();

    if (pending.length === 0) {
      // Nothing to do
      this.syncState.setPhase('idle');
      return;
    }

    // We have work (from older batch-based flow) → resume using new stateless match API
    this.syncState.setPhase('resuming_sync');

    // Combine hashes across all pending docs; we don't need per-sync_id anymore.
    const allHashes = pending.flatMap((b) => b.hashes ?? []);
    const uniqueHashes = Array.from(new Set(allHashes.map((h) => String(h).toLowerCase())));
    const sentHashSet = new Set(uniqueHashes);

    if (uniqueHashes.length === 0) {
      // Nothing useful in queue; clear it.
      for (const batch of pending) {
        await this.queueService.markCompleted(batch);
      }
      this.syncState.setPhase('idle');
      return;
    }

    const chunks: string[][] = [];
    for (let i = 0; i < uniqueHashes.length; i += this.maxHashesPerRequest) {
      chunks.push(uniqueHashes.slice(i, i + this.maxHashesPerRequest));
    }

    const byUserId = new Map<number, any>();

    try {
      for (let i = 0; i < chunks.length; i++) {
        this.syncState.setPhase('matching_contacts');
        this.syncState.setProgress(i + 1, chunks.length);

        const resp = await firstValueFrom(
          this.apiService.matchContacts({ hashes: chunks[i] })
        );

        for (const m of resp?.matches ?? []) {
          const phoneHash = String((m as any).phone_hash ?? '').toLowerCase();
          if (!phoneHash || !sentHashSet.has(phoneHash)) continue;
          if (!byUserId.has(m.user_id)) {
            byUserId.set(m.user_id, {
              ...m,
              phone_hash: phoneHash,
            });
          }
        }
      }

      this.syncState.setMatchedContacts(Array.from(byUserId.values()));
      this.syncState.setPhase('completed');

      // Best time to clear legacy queue: immediately after a successful matchContacts resume.
      // Bulk delete is faster + avoids retaining hashes on-device longer than needed.
      await this.queueService.clearAllPendingBatches();
    } catch (err) {
      console.error('Resume failed (matchContacts)', err);
      // Stop on failure → will retry next time app resumes / network returns
      return;
    }
  }

private async clearBatchesForSyncId(syncId: string) {
  const all = await this.queueService.getPendingBatches();
  for (const doc of all.filter(d => d.sync_id === syncId)) {
    await (this.queueService as any).db.remove(doc);
  }
}

  // Call this in ngOnDestroy / app shutdown if needed (rare)
  async destroy() {
    for (const h of this.listenerHandles) {
      await h.remove();
    }
  }
}