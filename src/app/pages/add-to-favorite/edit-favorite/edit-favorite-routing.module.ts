import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { EditFavoritePage } from './edit-favorite.page';

const routes: Routes = [
  {
    path: '',
    component: EditFavoritePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EditFavoritePageRoutingModule {}
