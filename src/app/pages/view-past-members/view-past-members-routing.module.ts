import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ViewPastMembersPage } from './view-past-members.page';

const routes: Routes = [
  {
    path: '',
    component: ViewPastMembersPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ViewPastMembersPageRoutingModule {}
