import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ManageFavoritePage } from './manage-favorite.page';

const routes: Routes = [
  {
    path: '',
    component: ManageFavoritePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ManageFavoritePageRoutingModule {}
