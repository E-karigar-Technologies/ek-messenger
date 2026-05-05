import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectBroadcastMembersPage } from './select-broadcast-members.page';

describe('SelectBroadcastMembersPage', () => {
  let component: SelectBroadcastMembersPage;
  let fixture: ComponentFixture<SelectBroadcastMembersPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SelectBroadcastMembersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
