import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { UpdateUsernamePage } from './update-username.page';

const routes: Routes = [
  {
    path: '',
    component: UpdateUsernamePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UpdateUsernamePageRoutingModule {}
