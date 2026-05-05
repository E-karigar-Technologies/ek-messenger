import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommunityDetailPage } from './community-detail.page';

describe('CommunityDetailPage', () => {
  let component: CommunityDetailPage;
  let fixture: ComponentFixture<CommunityDetailPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CommunityDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
