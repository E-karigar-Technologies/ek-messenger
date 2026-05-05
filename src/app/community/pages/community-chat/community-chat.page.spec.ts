import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommunityChatPage } from './community-chat.page';

describe('CommunityChatPage', () => {
  let component: CommunityChatPage;
  let fixture: ComponentFixture<CommunityChatPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CommunityChatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
