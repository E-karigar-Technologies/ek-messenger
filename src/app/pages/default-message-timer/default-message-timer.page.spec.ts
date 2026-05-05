import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DefaultMessageTimerPage } from './default-message-timer.page';

describe('DefaultMessageTimerPage', () => {
  let component: DefaultMessageTimerPage;
  let fixture: ComponentFixture<DefaultMessageTimerPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DefaultMessageTimerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
