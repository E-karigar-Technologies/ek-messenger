import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WelcomeScreenPage } from './welcome-screen.page';

describe('WelcomeScreenPage', () => {
  let component: WelcomeScreenPage;
  let fixture: ComponentFixture<WelcomeScreenPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(WelcomeScreenPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
