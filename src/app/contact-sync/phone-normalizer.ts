import { Injectable } from '@angular/core';
import {
  parsePhoneNumberFromString,
  CountryCode
} from 'libphonenumber-js/mobile';
import { Device } from '@capacitor/device';

@Injectable({
  providedIn: 'root',
})
export class PhoneNormalizer {

  private deviceRegion: CountryCode = 'IN';
  private regionReady = false;

  // Rollout countries only
  private allowedRegions: CountryCode[] = [
    'IN', // India
    'PK', // Pakistan
    'GB', // UK
    'AE'  // UAE
  ];

  constructor() {
    this.initDeviceRegion();
  }

  // ------------------------------------
  // Get region from device locale
  // ------------------------------------
  private async initDeviceRegion() {
    try {
      const lang = await Device.getLanguageCode();

      // Examples: en-IN, en-GB, ar-AE
      if (lang.value && lang.value.includes('-')) {
        const country =
          lang.value.split('-')[1].toUpperCase() as CountryCode;

        if (this.allowedRegions.includes(country)) {
          this.deviceRegion = country;
        }
      }
    } catch {
      console.warn('Failed to read device locale, defaulting to IN');
    }

    this.regionReady = true;
  }

  // ------------------------------------
  // Normalize phone number
  // ------------------------------------
  normalize(phone: string): string | null {

    if (!phone || !this.regionReady) return null;

    const cleaned = phone
      .replace(/\s+/g, '')
      .replace(/[-()]/g, '')
      .trim();

    try {
      let parsed;

      // International number
      if (cleaned.startsWith('+')) {

        parsed = parsePhoneNumberFromString(cleaned);

        if (!parsed || !parsed.isValid()) return null;

        if (
          !this.allowedRegions.includes(
            parsed.country as CountryCode
          )
        ) {
          return null;
        }
      }

      // Local number
      else {

        parsed = parsePhoneNumberFromString(
          cleaned,
          this.deviceRegion
        );

        if (!parsed || !parsed.isValid()) return null;

        if (parsed.country !== this.deviceRegion) {
          return null;
        }
      }

      // Mobile only
      const type = parsed.getType();
      if (
        type !== 'MOBILE' &&
        type !== 'FIXED_LINE_OR_MOBILE'
      ) {
        return null;
      }

      return parsed.number; // E.164

    } catch {
      return null;
    }
  }
}
