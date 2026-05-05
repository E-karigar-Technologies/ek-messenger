import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeGroupNamePage } from './change-group-name.page';

describe('ChangeGroupNamePage', () => {
  let component: ChangeGroupNamePage;
  let fixture: ComponentFixture<ChangeGroupNamePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChangeGroupNamePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
