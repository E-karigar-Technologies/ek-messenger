import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ContactSyncTestPage } from './contact-sync-test.page';

const routes: Routes = [
  {
    path: '',
    component: ContactSyncTestPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ContactSyncTestPageRoutingModule {}
