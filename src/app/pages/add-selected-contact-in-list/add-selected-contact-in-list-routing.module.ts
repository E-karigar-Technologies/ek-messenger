import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddSelectedContactInListPage } from './add-selected-contact-in-list.page';

const routes: Routes = [
  {
    path: '',
    component: AddSelectedContactInListPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddSelectedContactInListPageRoutingModule {}
