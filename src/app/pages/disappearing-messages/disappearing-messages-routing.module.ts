import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DisappearingMessagesPage } from './disappearing-messages.page';

const routes: Routes = [
  {
    path: '',
    component: DisappearingMessagesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DisappearingMessagesPageRoutingModule {}
