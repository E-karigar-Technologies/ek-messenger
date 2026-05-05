import { Injectable } from '@angular/core';
import PouchDB from 'pouchdb-browser';
import { v4 as uuidv4 } from 'uuid';
import { SyncQueueDoc } from './model/sync-queue.model';
// import { SyncQueueDoc } from './models/sync-queue.model';\
import PouchDBFind from 'pouchdb-find';
PouchDB.plugin(PouchDBFind);


@Injectable({ providedIn: 'root' })
export class SyncQueueService {

  private db: PouchDB.Database<SyncQueueDoc>;

  constructor() {
    this.db = new PouchDB<SyncQueueDoc>('contact_sync_queue');
  }

  async addBatch(batch: Omit<SyncQueueDoc, '_id' | '_rev' | 'status'>) {
    return this.db.put({
      _id: uuidv4(),
      ...batch,
      status: 'pending'
    });
  }

  async getPendingBatches(): Promise<SyncQueueDoc[]> {
    const result = await this.db.find({
      selector: { status: 'pending' }
    });

    return result.docs;
  }

  async markCompleted(doc: SyncQueueDoc) {
    if (!doc._rev) {
      throw new Error('Missing _rev for update');
    }

    return this.db.put({
      ...doc,
      status: 'completed'
    });
  }

 async removeBatch(doc: SyncQueueDoc): Promise<void> {
  if (!doc._rev) {
    throw new Error(`Cannot remove document without _rev: ${doc._id}`);
  }
  // Type assertion: _rev is now guaranteed string
  await this.db.remove(doc as PouchDB.Core.ExistingDocument<SyncQueueDoc>);
}

async clearBatchesBySyncId(syncId: string): Promise<void> {
  const toRemove = (await this.getPendingBatches()).filter(d => d.sync_id === syncId);
  if (toRemove.length === 0) return;

  // Double-check all have _rev before bulk delete
  const validDeletes = toRemove.filter(doc => !!doc._rev);
  if (validDeletes.length === 0) {
    console.warn(`No valid docs to delete for syncId: ${syncId}`);
    return;
  }

  const deletes = validDeletes.map(doc => ({ 
    ...doc, 
    _deleted: true 
  } as PouchDB.Core.ExistingDocument<SyncQueueDoc>));

  await this.db.bulkDocs(deletes);
}

/**
 * Best-effort privacy cleanup: remove all pending queue docs in bulk.
 * Intended for the new stateless /api/contacts/match flow after a successful resume.
 */
async clearAllPendingBatches(): Promise<void> {
  const pending = await this.getPendingBatches();
  if (pending.length === 0) return;

  const validDeletes = pending.filter(doc => !!doc._rev);
  if (validDeletes.length === 0) return;

  const deletes = validDeletes.map(doc => ({
    ...doc,
    _deleted: true
  } as PouchDB.Core.ExistingDocument<SyncQueueDoc>));

  await this.db.bulkDocs(deletes);
}


}

