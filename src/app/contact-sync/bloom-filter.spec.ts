import { TestBed } from '@angular/core/testing';

import { BloomFilter } from './bloom-filter';

describe('BloomFilter', () => {
  let service: BloomFilter;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BloomFilter);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
