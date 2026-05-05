import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddInstagramPage } from './add-instagram.page';

const routes: Routes = [
  {
    path: '',
    component: AddInstagramPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddInstagramPageRoutingModule {}
