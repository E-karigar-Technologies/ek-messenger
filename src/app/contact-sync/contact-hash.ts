import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { environment } from 'src/environments/environment.prod';

/**
 * Hashes phone numbers using same algorithm as backend (HMAC-SHA256 with global pepper).
 * Normalization must match backend exactly for hashes to match.
 */
@Injectable({ providedIn: 'root' })
export class ContactHashService {

  private GLOBAL_PEPPER = environment.contactHashPepper;

  /**
   * Normalize phone for hashing - must match backend utils/security.js computePhoneHash
   */
  normalizeForHash(phone: string): string {
    let normalized = phone.trim().replace(/[\s-]/g, '');
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }
    return normalized;
  }

  /**
   * Hash phone with global pepper (HMAC-SHA256, same as backend)
   */
  hashPhone(phone: string): string {
    const normalized = this.normalizeForHash(phone);
    return CryptoJS.HmacSHA256(normalized, this.GLOBAL_PEPPER).toString(CryptoJS.enc.Hex);
  }
}

