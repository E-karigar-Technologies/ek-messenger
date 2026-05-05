import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CallingScreenPage } from './calling-screen.page';

describe('CallingScreenPage', () => {
  let component: CallingScreenPage;
  let fixture: ComponentFixture<CallingScreenPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CallingScreenPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
