import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommunitySettingsPage } from './community-settings.page';

describe('CommunitySettingsPage', () => {
  let component: CommunitySettingsPage;
  let fixture: ComponentFixture<CommunitySettingsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CommunitySettingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
