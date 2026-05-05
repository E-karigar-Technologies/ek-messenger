import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { NewCommunityFormPage } from './new-community-form.page';

const routes: Routes = [
  {
    path: '',
    component: NewCommunityFormPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class NewCommunityFormPageRoutingModule {}
