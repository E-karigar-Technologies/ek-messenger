import { TestBed } from '@angular/core/testing';

import { ContactSyncService } from './contact-sync.service';

describe('ContactSyncService', () => {
  let service: ContactSyncService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ContactSyncService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
