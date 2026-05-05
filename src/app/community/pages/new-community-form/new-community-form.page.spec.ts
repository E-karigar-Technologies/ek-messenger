import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NewCommunityFormPage } from './new-community-form.page';

describe('NewCommunityFormPage', () => {
  let component: NewCommunityFormPage;
  let fixture: ComponentFixture<NewCommunityFormPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(NewCommunityFormPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
