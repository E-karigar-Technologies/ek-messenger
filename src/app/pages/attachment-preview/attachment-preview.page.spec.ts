import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AttachmentPreviewPage } from './attachment-preview.page';

describe('AttachmentPreviewPage', () => {
  let component: AttachmentPreviewPage;
  let fixture: ComponentFixture<AttachmentPreviewPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AttachmentPreviewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
