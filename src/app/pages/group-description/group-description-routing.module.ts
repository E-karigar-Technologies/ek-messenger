import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { GroupDescriptionPage } from './group-description.page';

const routes: Routes = [
  {
    path: '',
    component: GroupDescriptionPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GroupDescriptionPageRoutingModule {}
