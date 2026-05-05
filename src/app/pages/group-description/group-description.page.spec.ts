import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GroupDescriptionPage } from './group-description.page';

describe('GroupDescriptionPage', () => {
  let component: GroupDescriptionPage;
  let fixture: ComponentFixture<GroupDescriptionPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(GroupDescriptionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
