import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HelpArticlePage } from './help-article.page';

describe('HelpArticlePage', () => {
  let component: HelpArticlePage;
  let fixture: ComponentFixture<HelpArticlePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(HelpArticlePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
