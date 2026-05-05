import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommunityInfoPage } from './community-info.page';

describe('CommunityInfoPage', () => {
  let component: CommunityInfoPage;
  let fixture: ComponentFixture<CommunityInfoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CommunityInfoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
