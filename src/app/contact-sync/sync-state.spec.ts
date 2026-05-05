import { TestBed } from '@angular/core/testing';

import { SyncState } from './sync-state';

describe('SyncState', () => {
  let service: SyncState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SyncState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
