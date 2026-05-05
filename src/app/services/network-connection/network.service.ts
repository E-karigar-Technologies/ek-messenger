import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class NetworkService {
  public isOnline = new BehaviorSubject<boolean>(true);
  public isOnline$ = this.isOnline.asObservable();

  /**
   * Resolves once the real initial network status has been fetched from
   * Capacitor's Network plugin.  Await this before trusting isOnline.value —
   * the BehaviorSubject starts as `true` before the async check completes.
   */
  public readonly ready: Promise<void>;

  constructor() {
    this.ready = this.initNetworkListener();
  }

  private async initNetworkListener(): Promise<void> {
    const status = await Network.getStatus();
    this.isOnline.next(status.connected);

    Network.addListener('networkStatusChange', (status) => {
      this.isOnline.next(status.connected);
    });
  }
}
