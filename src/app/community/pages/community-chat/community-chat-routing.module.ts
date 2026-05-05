import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CommunityChatPage } from './community-chat.page';

const routes: Routes = [
  {
    path: '',
    component: CommunityChatPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CommunityChatPageRoutingModule {}
