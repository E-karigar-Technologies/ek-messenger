import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatNotificationsPage } from './chat-notifications.page';

describe('ChatNotificationsPage', () => {
  let component: ChatNotificationsPage;
  let fixture: ComponentFixture<ChatNotificationsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChatNotificationsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
