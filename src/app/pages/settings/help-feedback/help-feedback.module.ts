import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { HelpFeedbackPageRoutingModule } from './help-feedback-routing.module';

// import { HelpFeedbackPage } from './help-feedback.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HelpFeedbackPageRoutingModule
  ],
  // declarations: [HelpFeedbackPage]
})
export class HelpFeedbackPageModule {}
