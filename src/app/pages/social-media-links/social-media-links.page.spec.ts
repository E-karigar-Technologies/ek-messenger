import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SocialMediaLinksPage } from './social-media-links.page';

describe('SocialMediaLinksPage', () => {
  let component: SocialMediaLinksPage;
  let fixture: ComponentFixture<SocialMediaLinksPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SocialMediaLinksPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
