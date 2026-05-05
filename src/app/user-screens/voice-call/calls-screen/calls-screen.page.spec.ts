import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CallsScreenPage } from './calls-screen.page';

describe('CallsScreenPage', () => {
  let component: CallsScreenPage;
  let fixture: ComponentFixture<CallsScreenPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CallsScreenPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
