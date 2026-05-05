import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppLanguagePage } from './app-language.page';

describe('AppLanguagePage', () => {
  let component: AppLanguagePage;
  let fixture: ComponentFixture<AppLanguagePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AppLanguagePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
