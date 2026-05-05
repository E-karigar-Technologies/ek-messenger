import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { StatusScreenPage } from './status-screen.page';

const routes: Routes = [
  {
    path: '',
    component: StatusScreenPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StatusScreenPageRoutingModule {}
