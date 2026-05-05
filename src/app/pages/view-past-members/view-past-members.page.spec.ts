import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViewPastMembersPage } from './view-past-members.page';

describe('ViewPastMembersPage', () => {
  let component: ViewPastMembersPage;
  let fixture: ComponentFixture<ViewPastMembersPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ViewPastMembersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
