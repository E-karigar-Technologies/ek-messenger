import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SettingScreenPage } from './setting-screen.page';

const routes: Routes = [
  {
    path: '',
    component: SettingScreenPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SettingScreenPageRoutingModule {}
