import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';

@Injectable({ providedIn: 'root' })
export class BloomFilterService {

  private size = 120000; // bits (~15KB)
  private hashCount = 5;
  private bitArray: Uint8Array;

  constructor() {
    this.bitArray = new Uint8Array(this.size / 8);
  }

  private getHashes(value: string): number[] {
    const hashes: number[] = [];

    for (let i = 0; i < this.hashCount; i++) {
      const hash = CryptoJS.SHA256(value + i).toString();
      const intVal = parseInt(hash.substring(0, 8), 16);
      hashes.push(intVal % this.size);
    }

    return hashes;
  }

  add(value: string) {
    const positions = this.getHashes(value);

    positions.forEach(pos => {
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      this.bitArray[byteIndex] |= (1 << bitIndex);
    });
  }

  export(): string {
    return btoa(String.fromCharCode(...this.bitArray));
  }
}
