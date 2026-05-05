import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ManageListPage } from './manage-list.page';

const routes: Routes = [
  {
    path: '',
    component: ManageListPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ManageListPageRoutingModule {}
