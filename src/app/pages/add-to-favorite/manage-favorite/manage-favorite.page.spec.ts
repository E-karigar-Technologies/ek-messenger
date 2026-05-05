import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ManageFavoritePage } from './manage-favorite.page';

describe('ManageFavoritePage', () => {
  let component: ManageFavoritePage;
  let fixture: ComponentFixture<ManageFavoritePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ManageFavoritePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
