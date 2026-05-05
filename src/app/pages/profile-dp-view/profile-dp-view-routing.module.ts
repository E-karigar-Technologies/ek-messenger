import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ProfileDpViewPage } from './profile-dp-view.page';

const routes: Routes = [
  {
    path: '',
    component: ProfileDpViewPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProfileDpViewPageRoutingModule {}
