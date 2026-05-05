import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditFavoritePage } from './edit-favorite.page';

describe('EditFavoritePage', () => {
  let component: EditFavoritePage;
  let fixture: ComponentFixture<EditFavoritePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EditFavoritePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
