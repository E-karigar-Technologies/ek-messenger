import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DefaultMessageTimerPage } from './default-message-timer.page';

const routes: Routes = [
  {
    path: '',
    component: DefaultMessageTimerPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DefaultMessageTimerPageRoutingModule {}
