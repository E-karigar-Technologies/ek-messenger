import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageInfoPage } from './message-info.page';

describe('MessageInfoPage', () => {
  let component: MessageInfoPage;
  let fixture: ComponentFixture<MessageInfoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MessageInfoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
