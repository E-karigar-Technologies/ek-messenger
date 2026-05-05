import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ManageFavoritePageRoutingModule } from './manage-favorite-routing.module';

import { ManageFavoritePage } from './manage-favorite.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ManageFavoritePageRoutingModule
  ],
  // declarations: [ManageFavoritePage]
})
export class ManageFavoritePageModule {}
