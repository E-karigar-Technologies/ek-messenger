import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AppUpdatesPage } from './app-updates.page';

const routes: Routes = [
  {
    path: '',
    component: AppUpdatesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AppUpdatesPageRoutingModule {}
