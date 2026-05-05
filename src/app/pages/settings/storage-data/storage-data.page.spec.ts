import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StorageDataPage } from './storage-data.page';

describe('StorageDataPage', () => {
  let component: StorageDataPage;
  let fixture: ComponentFixture<StorageDataPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(StorageDataPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
