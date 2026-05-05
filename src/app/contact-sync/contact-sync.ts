import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ContactFetchService } from './contact-fetch';
import { ContactHashService } from './contact-hash';
import { SyncApiService } from './sync-api';
import { SyncQueueService } from './sync-queue';
import { SyncState } from './sync-state';
import { MatchedContact } from './model/sync-queue.model';


@Injectable({ providedIn: 'root' })
export class ContactSyncService_new {

  // Client-side chunking: keeps requests reasonable on poor networks.
  // Backend supports up to 15k per request; 10k is a safe default.
  private readonly maxHashesPerRequest = 10000;

  constructor(
    private fetchService: ContactFetchService,
    private hashService: ContactHashService,
    // kept for backward compatibility; no longer used by new stateless flow
    private queueService: SyncQueueService,
    private apiService: SyncApiService,
    private syncState: SyncState,
  ) {}

  /**
   * Full flow:
   * fetch → hash → queue → API → state → get matched contacts
   */
  async startFullSync(): Promise<void> {
    this.syncState.reset();

    try {
      // 1. Fetch contacts
      this.syncState.setPhase('fetching_contacts');
      const contacts = await this.fetchService.fetchAllWithNames();
      const numbers = contacts.map((c) => c.phone);

      if (!numbers || numbers.length === 0) {
        this.syncState.setDebugContactHashes([]);
        this.syncState.setPhase('completed');
        this.syncState.setMatchedContacts([]);
        return;
      }

      // Map phone_hash -> device contact display name (local only, for UI).
      // If multiple contacts share the same phone_hash, we keep the first non-empty name.
      const deviceNameByHash = new Map<string, string>();
      for (const c of contacts) {
        const name = (c.name || '').trim();
        if (!name) continue;
        const h = this.hashService.hashPhone(c.phone).toLowerCase();
        if (!deviceNameByHash.has(h)) {
          deviceNameByHash.set(h, name);
        }
      }

      // Debug: all contacts with phone -> hash for page display & network inspect
      const debugList = numbers.map((phone) => ({
        phone,
        hash: this.hashService.hashPhone(phone),
      }));
      this.syncState.setDebugContactHashes(debugList);

      // 2. Hash all contacts
      this.syncState.setPhase('hashing_contacts');
      const allHashes = numbers.map((n) => this.hashService.hashPhone(n));
      const uniqueHashes = Array.from(new Set(allHashes.map((h) => h.toLowerCase())));
      const sentHashSet = new Set(uniqueHashes);

      // 3. Match (1..N requests, no sessions/polling)
      this.syncState.setPhase('matching_contacts');
      const chunks: string[][] = [];
      for (let i = 0; i < uniqueHashes.length; i += this.maxHashesPerRequest) {
        chunks.push(uniqueHashes.slice(i, i + this.maxHashesPerRequest));
      }

      const byUserId = new Map<number, MatchedContact>();

      for (let i = 0; i < chunks.length; i++) {
        this.syncState.setProgress(i + 1, chunks.length);

        const resp = await firstValueFrom(
          this.apiService.matchContacts({ hashes: chunks[i] })
        );

        // Client-side validation:
        // Only accept matches whose returned phone_hash is in the set we actually sent.
        for (const m of resp?.matches ?? []) {
          const phoneHash = String((m as any).phone_hash ?? '').toLowerCase();
          if (!phoneHash || !sentHashSet.has(phoneHash)) continue;

          if (!byUserId.has(m.user_id)) {
            byUserId.set(m.user_id, {
              user_id: m.user_id,
              name: m.name,
              profile_picture_url: m.profile_picture_url ?? null,
              phone_hash: phoneHash,
              device_contact_name: deviceNameByHash.get(phoneHash) || undefined,
            });
          }
        }
      }

      this.syncState.setMatchedContacts(Array.from(byUserId.values()));
      this.syncState.setPhase('completed');
    } catch (error: any) {
      const message =
        error && typeof error.message === 'string'
          ? error.message
          : 'Unknown sync error';
      this.syncState.setError(message);
      throw error;
    }
  }

  
}