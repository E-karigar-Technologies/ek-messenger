import { TestBed } from '@angular/core/testing';

import { SyncApi } from './sync-api';

describe('SyncApi', () => {
  let service: SyncApi;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SyncApi);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
