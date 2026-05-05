import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddInstagramPage } from './add-instagram.page';

describe('AddInstagramPage', () => {
  let component: AddInstagramPage;
  let fixture: ComponentFixture<AddInstagramPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddInstagramPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
