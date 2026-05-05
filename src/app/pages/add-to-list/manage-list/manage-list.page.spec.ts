import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ManageListPage } from './manage-list.page';

describe('ManageListPage', () => {
  let component: ManageListPage;
  let fixture: ComponentFixture<ManageListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ManageListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
