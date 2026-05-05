import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NewCommunityPage } from './new-community.page';

describe('NewCommunityPage', () => {
  let component: NewCommunityPage;
  let fixture: ComponentFixture<NewCommunityPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(NewCommunityPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
