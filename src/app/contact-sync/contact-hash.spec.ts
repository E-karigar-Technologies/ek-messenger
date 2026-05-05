import { TestBed } from '@angular/core/testing';

import { ContactHash } from './contact-hash';

describe('ContactHash', () => {
  let service: ContactHash;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ContactHash);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
