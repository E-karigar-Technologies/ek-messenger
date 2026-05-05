import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { NewCommunityPage } from './new-community.page';

const routes: Routes = [
  {
    path: '',
    component: NewCommunityPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class NewCommunityPageRoutingModule {}
