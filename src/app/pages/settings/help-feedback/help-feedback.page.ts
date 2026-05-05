import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { TranslateModule, TranslateService, LangChangeEvent } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-help-feedback',
  templateUrl: './help-feedback.page.html',
  styleUrls: ['./help-feedback.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
})
export class HelpFeedbackPage implements OnInit, OnDestroy {
  private langSub?: Subscription;

  constructor(
    private router: Router,
    private translate: TranslateService,
    private cd: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit() {
    // subscribe so view updates instantly when language changes
    this.langSub = this.translate.onLangChange.subscribe((evt: LangChangeEvent) => {
      // run inside NgZone to ensure Angular change detection picks it up
      this.zone.run(() => {
        // optional: log new language
        //console.log('[HelpFeedbackPage] language changed ->', evt.lang);

        // if you use document.dir for RTL handling, update it here too
        const isRtl = /^(ar|he|fa|ur)/.test(evt.lang);
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';

        // force change detection for this component
        try { this.cd.detectChanges(); } catch (e) { this.cd.markForCheck(); }
      });
    });
  }

  ngOnDestroy() {
    this.langSub?.unsubscribe();
  }

  openHelpCenter() { this.router.navigate(['/help-center']); }
  openTerms() { this.router.navigate(['settings/help/terms']); }
  openChannelReports() { this.router.navigate(['settings/help/channel-reports']); }
  openAppInfo() { this.router.navigate(['/app-info']); }
}
