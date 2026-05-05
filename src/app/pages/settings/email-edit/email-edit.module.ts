import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { EmailEditPageRoutingModule } from './email-edit-routing.module';

// import { EmailEditPage } from './email-edit.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    EmailEditPageRoutingModule,
  ],
  // declarations: [EmailEditPage]
})
export class EmailEditPageModule {}
