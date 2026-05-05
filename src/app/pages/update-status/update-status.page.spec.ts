import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UpdateStatusPage } from './update-status.page';

describe('UpdateStatusPage', () => {
  let component: UpdateStatusPage;
  let fixture: ComponentFixture<UpdateStatusPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(UpdateStatusPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
