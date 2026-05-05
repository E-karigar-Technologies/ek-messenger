import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingProfilePage } from './setting-profile.page';

describe('SettingProfilePage', () => {
  let component: SettingProfilePage;
  let fixture: ComponentFixture<SettingProfilePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingProfilePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
