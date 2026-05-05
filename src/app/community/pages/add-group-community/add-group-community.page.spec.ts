import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddGroupCommunityPage } from './add-group-community.page';

describe('AddGroupCommunityPage', () => {
  let component: AddGroupCommunityPage;
  let fixture: ComponentFixture<AddGroupCommunityPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddGroupCommunityPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
