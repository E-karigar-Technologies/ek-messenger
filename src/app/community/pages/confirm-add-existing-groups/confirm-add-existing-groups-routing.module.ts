import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ConfirmAddExistingGroupsPage } from './confirm-add-existing-groups.page';

const routes: Routes = [
  {
    path: '',
    component: ConfirmAddExistingGroupsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ConfirmAddExistingGroupsPageRoutingModule {}
