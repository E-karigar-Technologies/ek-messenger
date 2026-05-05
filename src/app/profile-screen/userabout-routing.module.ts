import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { UseraboutPage } from './userabout.page';

const routes: Routes = [
  {
    path: '',
    component: UseraboutPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UseraboutPageRoutingModule {}
