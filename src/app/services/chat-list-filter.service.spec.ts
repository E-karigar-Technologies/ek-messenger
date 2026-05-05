import { TestBed } from '@angular/core/testing';

import { ChatListFilterService } from './chat-list-filter.service';

describe('ChatListFilterService', () => {
  let service: ChatListFilterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChatListFilterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
