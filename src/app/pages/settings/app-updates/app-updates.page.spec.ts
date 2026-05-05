import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppUpdatesPage } from './app-updates.page';

describe('AppUpdatesPage', () => {
  let component: AppUpdatesPage;
  let fixture: ComponentFixture<AppUpdatesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AppUpdatesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
