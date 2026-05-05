import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CommunityMembersPage } from './community-members.page';

const routes: Routes = [
  {
    path: '',
    component: CommunityMembersPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CommunityMembersPageRoutingModule {}
