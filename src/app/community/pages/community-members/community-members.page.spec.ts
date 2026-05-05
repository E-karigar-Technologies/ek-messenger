import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommunityMembersPage } from './community-members.page';

describe('CommunityMembersPage', () => {
  let component: CommunityMembersPage;
  let fixture: ComponentFixture<CommunityMembersPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CommunityMembersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
