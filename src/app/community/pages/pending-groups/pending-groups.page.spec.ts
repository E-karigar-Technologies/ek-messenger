import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PendingGroupsPage } from './pending-groups.page';

describe('PendingGroupsPage', () => {
  let component: PendingGroupsPage;
  let fixture: ComponentFixture<PendingGroupsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PendingGroupsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
