import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { GroupPermissionsPage } from './group-permissions.page';

const routes: Routes = [
  {
    path: '',
    component: GroupPermissionsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GroupPermissionsPageRoutingModule {}
