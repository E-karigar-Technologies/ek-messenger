import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PendingGroupsPage } from './pending-groups.page';

const routes: Routes = [
  {
    path: '',
    component: PendingGroupsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PendingGroupsPageRoutingModule {}
