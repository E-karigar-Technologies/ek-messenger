import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ChatNotificationsPage } from './chat-notifications.page';

const routes: Routes = [
  {
    path: '',
    component: ChatNotificationsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ChatNotificationsPageRoutingModule {}
