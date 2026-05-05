import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreateNewGroupPage } from './create-new-group.page';

describe('CreateNewGroupPage', () => {
  let component: CreateNewGroupPage;
  let fixture: ComponentFixture<CreateNewGroupPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CreateNewGroupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
