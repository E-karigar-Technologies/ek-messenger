import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DisappearingMessagesPage } from './disappearing-messages.page';

describe('DisappearingMessagesPage', () => {
  let component: DisappearingMessagesPage;
  let fixture: ComponentFixture<DisappearingMessagesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DisappearingMessagesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
