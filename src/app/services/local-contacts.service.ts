import { Injectable } from '@angular/core';
import PouchDB from 'pouchdb';

export interface LocalContact {
  _id: string;       // unique key: countryCode + phone, e.g. "+911234567890"
  _rev?: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  phone: string;      // local number part entered by user
  fullPhone: string;  // countryCode + phone (E.164-style)
  deviceContactId?: string; // contactId returned by Capacitor Contacts after creation
  createdAt: number;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class LocalContactsService {
  private db: PouchDB.Database<LocalContact>;

  constructor() {
    this.db = new PouchDB<LocalContact>('contacts_local_db');
  }

  /**
   * Save (insert or update) a contact in PouchDB.
   * Uses the full phone number as the document _id to prevent duplicates.
   */
  // async saveContact(contact: Omit<LocalContact, '_id' | 'createdAt' | 'updatedAt'>): Promise<LocalContact> {
  //   const fullPhone = `${contact.countryCode}${contact.phone}`;
  //   const docId = fullPhone;
  //   const now = Date.now();

  //   let existingRev: string | undefined;
  //   let existingCreatedAt: number = now;

  //   try {
  //     const existing = await this.db.get(docId);
  //     existingRev = existing._rev;
  //     existingCreatedAt = existing.createdAt;
  //   } catch (e: any) {
  //     if (e.status !== 404) throw e;
  //   }

  //   const doc: LocalContact = {
  //     _id: docId,
  //     ...(existingRev ? { _rev: existingRev } : {}),
  //     firstName: contact.firstName,
  //     lastName: contact.lastName ?? '',
  //     countryCode: contact.countryCode,
  //     phone: contact.phone,
  //     fullPhone,
  //     deviceContactId: contact.deviceContactId,
  //     createdAt: existingCreatedAt,
  //     updatedAt: now,
  //   };

  //   await this.db.put(doc);
  //   return doc;
  // }
  async saveContact(
  contact: Omit<LocalContact, '_id' | 'createdAt' | 'updatedAt'>
): Promise<LocalContact> {

  // normalize phone
  const normalizedPhone =
    contact.phone.replace(/\s+/g, '').trim();

  const fullPhone =
    `${contact.countryCode}${normalizedPhone}`;

  // stable document id
  const docId =
    contact.deviceContactId || fullPhone;

  const now = Date.now();

  let existingDoc: any = null;

  try {

    existingDoc = await this.db.get(docId);

  } catch (e: any) {

    if (e.status !== 404) {
      throw e;
    }
  }

  const doc: LocalContact = {

    _id: docId,

    ...(existingDoc?._rev
      ? { _rev: existingDoc._rev }
      : {}),

    firstName: contact.firstName,
    lastName: contact.lastName ?? '',

    countryCode: contact.countryCode,
    phone: normalizedPhone,
    fullPhone,

    deviceContactId:
      contact.deviceContactId ,

    createdAt:
      existingDoc?.createdAt || now,

    updatedAt: now,
  };

  await this.db.put(doc);

  return doc;
}

  /** Retrieve all saved local contacts, sorted by firstName. */
  async getAllContacts(): Promise<LocalContact[]> {
    const result = await this.db.allDocs({ include_docs: true });
    return result.rows
      .map(r => r.doc as LocalContact)
      .filter(Boolean)
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }

  /** Find a contact by full phone number (countryCode + phone). */
  async getContactByPhone(fullPhone: string): Promise<LocalContact | null> {
    try {
      return await this.db.get(fullPhone);
    } catch (e: any) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  /** Delete a contact by full phone number. */
  async deleteContact(fullPhone: string): Promise<void> {
    try {
      const doc = await this.db.get(fullPhone);
      await this.db.remove(doc);
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }
  }
  /** Check if contact already exists */
// async contactExists(fullPhone: string): Promise<boolean> {
//   try {
//     await this.db.get(fullPhone);
//     return true;
//   } catch (e: any) {
//     if (e.status === 404) {
//       return false;
//     }
//     throw e;
//   }
// }
async removeDuplicateContacts() {

  const result = await this.db.allDocs({
    include_docs: true
  });

  const seen = new Set();

  for (const row of result.rows) {

    const doc: any = row.doc;

    if (!doc?.fullPhone) continue;

    if (seen.has(doc.fullPhone)) {

      await this.db.remove(doc);

    } else {

      seen.add(doc.fullPhone);
    }
  }
}
}
