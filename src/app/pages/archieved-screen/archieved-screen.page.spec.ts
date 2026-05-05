import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ArchievedScreenPage } from './archieved-screen.page';

describe('ArchievedScreenPage', () => {
  let component: ArchievedScreenPage;
  let fixture: ComponentFixture<ArchievedScreenPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ArchievedScreenPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
