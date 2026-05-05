import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { EmailEditPage } from './email-edit.page';

const routes: Routes = [
  {
    path: '',
    component: EmailEditPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EmailEditPageRoutingModule {}
