import { Component, OnInit } from '@angular/core';
import { SyncState } from '../../sync-state';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ContactSyncService_new } from '../../contact-sync';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-contact-sync-test',
  templateUrl: './contact-sync-test.page.html',
  styleUrls: ['./contact-sync-test.page.scss'],
  standalone: true,
   imports: [IonicModule, CommonModule, FormsModule],
})
export class ContactSyncTestPage implements OnInit {

  phase$ = this.syncState.phase$;
  error$ = this.syncState.error$;
  progress$ = this.syncState.progress$;
  syncId$ = this.syncState.syncId$;
  matchedContacts$ = this.syncState.matchedContacts$;

  searchQuery$ = new BehaviorSubject<string>('');
  filteredDebugContacts$ = combineLatest([
    this.syncState.debugContactHashes$,
    this.searchQuery$,
  ]).pipe(
    map(([list, q]) => {
      if (!q?.trim()) return list;
      const lower = q.trim().toLowerCase();
      return list.filter(
        (item) =>
          item.phone.toLowerCase().includes(lower) ||
          item.hash.toLowerCase().includes(lower)
      );
    })
  );

  constructor(
    private contactSync: ContactSyncService_new,
    private syncState: SyncState
  ) {}

  ngOnInit() {
  }

  async runContactSyncTest(): Promise<void> {
    try {
      await this.contactSync.startFullSync();
    } catch (err) {
      console.error('Contact sync failed', err);
    }
  }

  onSearchInput(e: Event): void {
    const value = (e as CustomEvent).detail?.value ?? '';
    this.searchQuery$.next(value);
  }
}