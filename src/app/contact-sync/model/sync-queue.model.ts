export interface SyncQueueBase {
  sync_id: string;
  batch_number: number;
  total_batches: number;
  hashes: string[];
  phones?: string[];  // raw (debug only)
  status: 'pending' | 'completed';
}

export interface SyncQueueDoc extends SyncQueueBase, PouchDB.Core.IdMeta {
  _id: string;
  _rev?: string;
}

export interface MatchedContact {
  user_id: number;
  name: string;
  profile_picture_url: string | null;
  // Returned by new /api/contacts/match so the client can verify the match
  // corresponds to a locally hashed contact. Optional for backward compatibility.
  phone_hash?: string;
  // Local-only enrichment for UI (device address book name).
  device_contact_name?: string;
}

export interface SyncStatusResponse {
  sync_id: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
  completed?: boolean;
  progress?: number;          // 0–100
  seconds_remaining?: number; // for TTL / UI
  matched_contacts?: MatchedContact[];
}

export interface ContactMatchResponse {
  matches: MatchedContact[];
  count: number;
  queried: number;
}

