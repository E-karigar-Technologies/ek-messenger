import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChattingScreenPage } from './chatting-screen.page';

describe('ChattingScreenPage', () => {
  let component: ChattingScreenPage;
  let fixture: ComponentFixture<ChattingScreenPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChattingScreenPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
