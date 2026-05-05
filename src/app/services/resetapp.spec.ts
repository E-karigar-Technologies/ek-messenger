import { TestBed } from '@angular/core/testing';

import { Resetapp } from './resetapp';

describe('Resetapp', () => {
  let service: Resetapp;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Resetapp);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
