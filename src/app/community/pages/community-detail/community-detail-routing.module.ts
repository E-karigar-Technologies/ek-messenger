import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CommunityDetailPage } from './community-detail.page';

const routes: Routes = [
  {
    path: '',
    component: CommunityDetailPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CommunityDetailPageRoutingModule {}
