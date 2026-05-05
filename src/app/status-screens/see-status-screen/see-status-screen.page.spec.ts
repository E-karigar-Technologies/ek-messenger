import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SeeStatusScreenPage } from './see-status-screen.page';

describe('SeeStatusScreenPage', () => {
  let component: SeeStatusScreenPage;
  let fixture: ComponentFixture<SeeStatusScreenPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SeeStatusScreenPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
