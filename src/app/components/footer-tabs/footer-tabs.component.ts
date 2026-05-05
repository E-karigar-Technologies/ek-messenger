
import {
  Component, Input, Renderer2, AfterViewInit, OnChanges, SimpleChanges, AfterViewChecked, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonTabBar, IonBadge, Platform, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-footer-tabs',
  templateUrl: './footer-tabs.component.html',
  styleUrls: ['./footer-tabs.component.scss'],
  imports: [IonTabBar, CommonModule, IonBadge, TranslateModule,IonIcon],
})
export class FooterTabsComponent implements AfterViewInit, OnChanges, AfterViewChecked {
  @Input() totalUnreadCount: number = 0;
  @Input() totalUnreadUpdates: number = 0;

  activePath: string = '/home-screen';

  constructor(
    private router: Router,
    private platform: Platform,
    private renderer: Renderer2,
    private el: ElementRef
  ) {
    this.router.events.subscribe(() => {
      this.activePath = this.router.url;
      this.setDynamicPadding();
    });
  }

  ngAfterViewInit() {
    this.setDynamicPadding();
    window.addEventListener('resize', () => this.setDynamicPadding());
  }

  ngAfterViewChecked() {
    this.setDynamicPadding();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['totalUnreadCount'] || changes['totalUnreadUpdates']) {
      this.setDynamicPadding();
    }
  }

  private isGestureNavigation(): boolean {
    const diff = window.screen.height - window.innerHeight;
    return diff < 40;
  }
  private isTransparentButtonNav(): boolean {
    const diff = window.screen.height - window.innerHeight;
    return diff < 5;
  }

  setDynamicPadding() {
    const mineclassEl = this.el.nativeElement.querySelector('.mineclass') as HTMLElement;
    if (!mineclassEl) return;

    if (this.platform.is('ios')) {
      const safeAreaBottom =
        parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ion-safe-area-bottom')) || 0;
      this.renderer.setStyle(mineclassEl, 'padding-bottom', safeAreaBottom > 0 ? '16px' : '6px');
    } else {
      if (this.isGestureNavigation() || this.isTransparentButtonNav()) {
        this.renderer.setStyle(mineclassEl, 'padding-bottom', '35px');
      } else {
        this.renderer.setStyle(mineclassEl, 'padding-bottom', '6px');
      }
    }
  }

  navigateTohomescreen() {
    this.router.navigate(['/home-screen']);
    this.activePath = '/home-screen';
  }
  navigateTocallingscreen() {
    this.router.navigate(['/status-screen']);
    this.activePath = '/status-screen';
  }
  navigateTocommunityscreen() {
    this.router.navigate(['/community-screen']);
    this.activePath = '/community-screen';
  }
  navigateTocallsscreen() {
    this.router.navigate(['/calls-screen']);
    this.activePath = '/calls-screen';
  }

  isActive(paths: string[]): boolean {
    return paths.includes(this.router.url);
  }
}

 
 