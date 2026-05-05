import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddExistingGroupsPage } from './add-existing-groups.page';

const routes: Routes = [
  {
    path: '',
    component: AddExistingGroupsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddExistingGroupsPageRoutingModule {}
