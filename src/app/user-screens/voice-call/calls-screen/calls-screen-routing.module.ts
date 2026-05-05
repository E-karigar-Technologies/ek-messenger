import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CallsScreenPage } from './calls-screen.page';

const routes: Routes = [
  {
    path: '',
    component: CallsScreenPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CallsScreenPageRoutingModule {}
