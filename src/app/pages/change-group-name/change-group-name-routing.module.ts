import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ChangeGroupNamePage } from './change-group-name.page';

const routes: Routes = [
  {
    path: '',
    component: ChangeGroupNamePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ChangeGroupNamePageRoutingModule {}
