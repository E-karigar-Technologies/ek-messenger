import { TestBed } from '@angular/core/testing';

import { FirebasePushService } from './firebase-push.service';

describe('FirebasePushService', () => {
  let service: FirebasePushService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FirebasePushService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
