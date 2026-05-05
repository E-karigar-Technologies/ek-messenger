import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeScreenPage } from './home-screen.page';
import { FooterTabsComponent } from "../components/footer-tabs/footer-tabs.component";


describe('HomeScreenPage', () => {
  let component: HomeScreenPage;
  let fixture: ComponentFixture<HomeScreenPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(HomeScreenPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
