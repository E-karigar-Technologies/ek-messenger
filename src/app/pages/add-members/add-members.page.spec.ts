import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddMembersPage } from './add-members.page';

describe('AddMembersPage', () => {
  let component: AddMembersPage;
  let fixture: ComponentFixture<AddMembersPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddMembersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
