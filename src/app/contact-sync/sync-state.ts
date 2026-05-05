import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MatchedContact } from './model/sync-queue.model';

export type SyncPhase =
  | 'idle'
  | 'fetching_contacts'
  | 'hashing_contacts'
  | 'matching_contacts'
  // Legacy phases kept for compatibility with old flow/UI.
  | 'queuing_batch'
  | 'sending_to_api'
  | 'resuming_sync'
  | 'completed'
  | 'error';

export interface SyncProgress {
  currentBatch: number;
  totalBatches: number;
}

export interface DebugContactHash {
  phone: string;
  hash: string;
}

@Injectable({
  providedIn: 'root',
})
export class SyncState {

  private phaseSubject = new BehaviorSubject<SyncPhase>('idle');
  private errorSubject = new BehaviorSubject<string | null>(null);
  private progressSubject = new BehaviorSubject<SyncProgress | null>(null);
  private syncIdSubject = new BehaviorSubject<string | null>(null);
  private matchedContactsSubject = new BehaviorSubject<MatchedContact[]>([]);
  private debugContactHashesSubject = new BehaviorSubject<DebugContactHash[]>([]);

  get phase$(): Observable<SyncPhase> {
    return this.phaseSubject.asObservable();
  }

  get error$(): Observable<string | null> {
    return this.errorSubject.asObservable();
  }

  get progress$(): Observable<SyncProgress | null> {
    return this.progressSubject.asObservable();
  }

  get syncId$(): Observable<string | null> {
    return this.syncIdSubject.asObservable();
  }

  get matchedContacts$(): Observable<MatchedContact[]> {
    return this.matchedContactsSubject.asObservable();
  }

  get debugContactHashes$(): Observable<DebugContactHash[]> {
    return this.debugContactHashesSubject.asObservable();
  }

  setPhase(phase: SyncPhase): void {
    this.phaseSubject.next(phase);
  }

  setError(message: string | null): void {
    this.errorSubject.next(message);
    if (message) {
      this.phaseSubject.next('error');
    }
  }

  setProgress(currentBatch: number, totalBatches: number): void {
    this.progressSubject.next({ currentBatch, totalBatches });
  }

  setSyncId(syncId: string | null): void {
    this.syncIdSubject.next(syncId);
  }

  setMatchedContacts(contacts: MatchedContact[]): void {
    this.matchedContactsSubject.next(contacts);
  }

  setDebugContactHashes(list: DebugContactHash[]): void {
    this.debugContactHashesSubject.next(list);
  }

  reset(): void {
    this.phaseSubject.next('idle');
    this.errorSubject.next(null);
    this.progressSubject.next(null);
    this.syncIdSubject.next(null);
    this.matchedContactsSubject.next([]);
    this.debugContactHashesSubject.next([]);
  }
}