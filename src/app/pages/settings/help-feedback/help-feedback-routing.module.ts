import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { HelpFeedbackPage } from './help-feedback.page';

const routes: Routes = [
  {
    path: '',
    component: HelpFeedbackPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HelpFeedbackPageRoutingModule {}
