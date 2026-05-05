import { Component } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-contact-menu',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './contact-menu.component.html',
  styleUrls: ['./contact-menu.component.scss'],
})
export class ContactMenuComponent {
  constructor(private popoverCtrl: PopoverController) {}

  selectOption(option: string) {
    this.popoverCtrl.dismiss(option);  // Send selected value back
  }
}
