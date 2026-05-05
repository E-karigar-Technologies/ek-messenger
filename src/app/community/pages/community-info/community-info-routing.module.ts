import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CommunityInfoPage } from './community-info.page';

const routes: Routes = [
  {
    path: '',
    component: CommunityInfoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CommunityInfoPageRoutingModule {}
