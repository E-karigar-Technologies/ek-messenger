import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SocialMediaLinksPage } from './social-media-links.page';

const routes: Routes = [
  {
    path: '',
    component: SocialMediaLinksPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SocialMediaLinksPageRoutingModule {}
