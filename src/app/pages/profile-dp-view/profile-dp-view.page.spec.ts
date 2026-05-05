import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProfileDpViewPage } from './profile-dp-view.page';

describe('ProfileDpViewPage', () => {
  let component: ProfileDpViewPage;
  let fixture: ComponentFixture<ProfileDpViewPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ProfileDpViewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
