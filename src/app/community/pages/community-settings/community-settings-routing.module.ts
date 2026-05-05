import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CommunitySettingsPage } from './community-settings.page';

const routes: Routes = [
  {
    path: '',
    component: CommunitySettingsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CommunitySettingsPageRoutingModule {}
