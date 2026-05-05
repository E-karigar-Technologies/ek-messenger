import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddExistingGroupsPage } from './add-existing-groups.page';

describe('AddExistingGroupsPage', () => {
  let component: AddExistingGroupsPage;
  let fixture: ComponentFixture<AddExistingGroupsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddExistingGroupsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
