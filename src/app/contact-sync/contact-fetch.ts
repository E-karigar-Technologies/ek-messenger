import { Injectable } from '@angular/core';
import { Contacts } from '@capacitor-community/contacts';
import { PhoneNormalizer } from './phone-normalizer';

@Injectable({ providedIn: 'root' })
export class ContactFetchService {

  constructor(
  private normalizer: PhoneNormalizer
) {}


  async fetchAllNumbers(): Promise<string[]> {

  const permission = await Contacts.requestPermissions();
  if (permission.contacts !== 'granted') {
    throw new Error('Contacts permission denied');
  }

  const result = await Contacts.getContacts({
    projection: {
      name: true,
      phones: true
    }
  });

  const normalizedSet = new Set<string>();

  result.contacts.forEach(contact => {
    contact.phones?.forEach(phone => {

      const normalized =
        this.normalizer.normalize(phone.number || '');

      if (normalized) {
        normalizedSet.add(normalized);
      }

    });
  });

  return Array.from(normalizedSet);
}

  /** Returns contacts with names for getDevicePhoneNumbers / display */
  async fetchAllWithNames(): Promise<{ name: string; phone: string }[]> {
    const permission = await Contacts.requestPermissions();
    if (permission.contacts !== 'granted') {
      throw new Error('Contacts permission denied');
    }

    const result = await Contacts.getContacts({
      projection: { name: true, phones: true }
    });

    const seen = new Set<string>();
    const list: { name: string; phone: string }[] = [];

    result.contacts.forEach((contact) => {
      const name = contact.name?.display || contact.name?.given || '';
      contact.phones?.forEach((phone) => {
        const normalized = this.normalizer.normalize(phone.number || '');
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          list.push({ name, phone: normalized });
        }
      });
    });

    return list;
  }
}
