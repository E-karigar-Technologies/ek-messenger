import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SeeStatusScreenPage } from './see-status-screen.page';

const routes: Routes = [
  {
    path: '',
    component: SeeStatusScreenPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SeeStatusScreenPageRoutingModule {}
