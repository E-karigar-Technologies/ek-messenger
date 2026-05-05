import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IUser } from './sqlite.service';
import { ContactSyncService_new } from '../contact-sync/contact-sync';
import { SyncState } from '../contact-sync/sync-state';
import { ContactFetchService } from '../contact-sync/contact-fetch';

/**
 * Facade: Uses new contact-sync module (hash-based, server-side matching).
 * Replaces old client-side matching for consistent country-code handling.
 */
@Injectable({ providedIn: 'root' })
export class ContactSyncService {
  contacts: any;

  constructor(
    private contactSyncNew: ContactSyncService_new,
    private syncState: SyncState,
    private contactFetch: ContactFetchService
  ) {}

  /** Device contacts with names - uses E.164 normalization (same as sync) */
  async getDevicePhoneNumbers(): Promise<{ username: string; phoneNumber: string }[]> {
    try {
      const list = await this.contactFetch.fetchAllWithNames();
      return list.map((c) => ({
        username: c.name,
        phoneNumber: c.phone,
      }));
    } catch (error) {
      console.error('Error loading contacts', error);
      return [];
    }
  }

  /**
   * Platform users that match device contacts (hash-based sync with backend).
   * Triggers full sync, awaits completion, returns matched users.
   */
  async getMatchedUsers(): Promise<IUser[]> {
    try {
      await this.contactSyncNew.startFullSync();
      const matched = await firstValueFrom(this.syncState.matchedContacts$);
      return matched.map((m) => ({
        userId: String(m.user_id),
        username: m.name || '',
        phoneNumber: '', // backend does not return phone for privacy
        avatar: m.profile_picture_url || undefined,
        isOnPlatform: true,
        device_contact_name: (m as any).device_contact_name || undefined,
      })) as IUser[];
    } catch (error) {
      console.error('getMatchedUsers error', error);
      return [];
    }
  }
}
