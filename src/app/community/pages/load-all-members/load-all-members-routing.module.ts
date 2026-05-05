import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { LoadAllMembersPage } from './load-all-members.page';

const routes: Routes = [
  {
    path: '',
    component: LoadAllMembersPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LoadAllMembersPageRoutingModule {}
