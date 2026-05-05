import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusScreenPage } from './status-screen.page';

describe('StatusScreenPage', () => {
  let component: StatusScreenPage;
  let fixture: ComponentFixture<StatusScreenPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(StatusScreenPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
