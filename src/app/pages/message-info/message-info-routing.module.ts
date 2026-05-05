import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MessageInfoPage } from './message-info.page';

const routes: Routes = [
  {
    path: '',
    component: MessageInfoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MessageInfoPageRoutingModule {}
