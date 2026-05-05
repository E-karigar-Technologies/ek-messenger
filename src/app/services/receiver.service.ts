import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';

interface ReceiverData {
  receiverId: string;
  receiverPhone: string;
  receiverName?: string;
  isGroup: boolean;
  roomId : string;
}

@Injectable({
  providedIn: 'root'
})
export class ReceiverService {
  private _receiverData: ReceiverData | null = null;

  private receiverSource = new BehaviorSubject<ReceiverData | null>(null);
  receiver$ = this.receiverSource.asObservable();

  constructor(private secureStorage: SecureStorageService) {}

  /** Set receiver info */
  async setReceiver(receiver: ReceiverData): Promise<void> {
    this._receiverData = receiver;

    //console.log("receiver data safe",this._receiverData);

    // Store in SecureStorage
    await this.secureStorage.setItem('RECEIVER', JSON.stringify(receiver));

    // Update stream
    this.receiverSource.next(receiver);
  }

  /** Get receiver info (sync) */
  getReceiver(): ReceiverData | null {
    return this._receiverData;
  }

  /** Hydrate on app start */
  async hydrateReceiver(): Promise<void> {
    const stored = await this.secureStorage.getItem('RECEIVER');
    if (stored) {
      this._receiverData = JSON.parse(stored);
      this.receiverSource.next(this._receiverData);
    }
  }

  /** Clear receiver (on chat close/logout) */
  async clearReceiver(): Promise<void> {
    await this.secureStorage.removeItem('RECEIVER');
    this._receiverData = null;
    this.receiverSource.next(null);
  }
}
