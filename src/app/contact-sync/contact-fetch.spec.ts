import { TestBed } from '@angular/core/testing';

import { ContactFetch } from './contact-fetch';

describe('ContactFetch', () => {
  let service: ContactFetch;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ContactFetch);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
