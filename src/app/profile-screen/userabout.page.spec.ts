import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UseraboutPage } from './userabout.page';

describe('UseraboutPage', () => {
  let component: UseraboutPage;
  let fixture: ComponentFixture<UseraboutPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(UseraboutPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
