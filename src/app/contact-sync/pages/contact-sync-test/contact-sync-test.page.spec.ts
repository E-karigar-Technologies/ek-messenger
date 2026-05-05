import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContactSyncTestPage } from './contact-sync-test.page';

describe('ContactSyncTestPage', () => {
  let component: ContactSyncTestPage;
  let fixture: ComponentFixture<ContactSyncTestPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ContactSyncTestPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
