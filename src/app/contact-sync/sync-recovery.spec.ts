import { TestBed } from '@angular/core/testing';

import { SyncRecovery } from './sync-recovery';

describe('SyncRecovery', () => {
  let service: SyncRecovery;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SyncRecovery);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
