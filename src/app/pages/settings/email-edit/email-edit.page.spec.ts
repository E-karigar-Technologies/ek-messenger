import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmailEditPage } from './email-edit.page';

describe('EmailEditPage', () => {
  let component: EmailEditPage;
  let fixture: ComponentFixture<EmailEditPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EmailEditPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
