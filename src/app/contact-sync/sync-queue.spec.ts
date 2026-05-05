import { TestBed } from '@angular/core/testing';

import { SyncQueue } from './sync-queue';

describe('SyncQueue', () => {
  let service: SyncQueue;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SyncQueue);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
