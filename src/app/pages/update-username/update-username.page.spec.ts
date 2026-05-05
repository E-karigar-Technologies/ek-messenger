import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UpdateUsernamePage } from './update-username.page';

describe('UpdateUsernamePage', () => {
  let component: UpdateUsernamePage;
  let fixture: ComponentFixture<UpdateUsernamePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(UpdateUsernamePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
