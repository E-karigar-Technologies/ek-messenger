import { TestBed } from '@angular/core/testing';

import { PhoneNormalizer } from './phone-normalizer';

describe('PhoneNormalizer', () => {
  let service: PhoneNormalizer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PhoneNormalizer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
