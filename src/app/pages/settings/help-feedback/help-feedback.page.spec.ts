import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HelpFeedbackPage } from './help-feedback.page';

describe('HelpFeedbackPage', () => {
  let component: HelpFeedbackPage;
  let fixture: ComponentFixture<HelpFeedbackPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(HelpFeedbackPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
