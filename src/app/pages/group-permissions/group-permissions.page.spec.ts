import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GroupPermissionsPage } from './group-permissions.page';

describe('GroupPermissionsPage', () => {
  let component: GroupPermissionsPage;
  let fixture: ComponentFixture<GroupPermissionsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(GroupPermissionsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
