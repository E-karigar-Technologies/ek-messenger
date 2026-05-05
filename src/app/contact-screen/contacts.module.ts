
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';


import { IonicModule } from '@ionic/angular';

import { ContactsPageRoutingModule } from './contacts-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ContactsPageRoutingModule
  ],
  // declarations: [ContactsPage]
   schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ContactsPageModule {}
