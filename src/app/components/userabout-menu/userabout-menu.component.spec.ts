import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { UseraboutMenuComponent } from './userabout-menu.component';

describe('UseraboutMenuComponent', () => {
  let component: UseraboutMenuComponent;
  let fixture: ComponentFixture<UseraboutMenuComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [UseraboutMenuComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UseraboutMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
