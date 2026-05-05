import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddSelectedContactInListPage } from './add-selected-contact-in-list.page';

describe('AddSelectedContactInListPage', () => {
  let component: AddSelectedContactInListPage;
  let fixture: ComponentFixture<AddSelectedContactInListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddSelectedContactInListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
