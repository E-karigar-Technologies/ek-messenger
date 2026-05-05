import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ForwardmessagePage } from './forwardmessage.page';

describe('ForwardmessagePage', () => {
  let component: ForwardmessagePage;
  let fixture: ComponentFixture<ForwardmessagePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ForwardmessagePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
