import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddGroupCommunityPage } from './add-group-community.page';

const routes: Routes = [
  {
    path: '',
    component: AddGroupCommunityPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddGroupCommunityPageRoutingModule {}
