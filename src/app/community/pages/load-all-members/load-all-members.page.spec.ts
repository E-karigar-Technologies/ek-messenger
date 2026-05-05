import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoadAllMembersPage } from './load-all-members.page';

describe('LoadAllMembersPage', () => {
  let component: LoadAllMembersPage;
  let fixture: ComponentFixture<LoadAllMembersPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(LoadAllMembersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
