import { TestBed } from '@angular/core/testing';

import { ContactSync } from './contact-sync';

describe('ContactSync', () => {
  let service: ContactSync;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ContactSync);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
