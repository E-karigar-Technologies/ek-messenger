import { TestBed } from '@angular/core/testing';

import { VersionCheck } from './version-check';

describe('VersionCheck', () => {
  let service: VersionCheck;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VersionCheck);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
