import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmAddExistingGroupsPage } from './confirm-add-existing-groups.page';

describe('ConfirmAddExistingGroupsPage', () => {
  let component: ConfirmAddExistingGroupsPage;
  let fixture: ComponentFixture<ConfirmAddExistingGroupsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ConfirmAddExistingGroupsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
