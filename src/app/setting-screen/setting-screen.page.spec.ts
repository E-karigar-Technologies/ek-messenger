import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingScreenPage } from './setting-screen.page';

describe('SettingScreenPage', () => {
  let component: SettingScreenPage;
  let fixture: ComponentFixture<SettingScreenPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingScreenPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
