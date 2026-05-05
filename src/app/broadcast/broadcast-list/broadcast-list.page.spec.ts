import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BroadcastListPage } from './broadcast-list.page';

describe('BroadcastListPage', () => {
  let component: BroadcastListPage;
  let fixture: ComponentFixture<BroadcastListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(BroadcastListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
