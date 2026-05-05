import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { FooterTabsComponent } from "../../../components/footer-tabs/footer-tabs.component";
import { MenuPopoverComponent } from '../../../components/menu-popover/menu-popover.component';

@Component({
  selector: 'app-calls-screen',
  templateUrl: './calls-screen.page.html',
  styleUrls: ['./calls-screen.page.scss'],
  imports: [IonicModule, CommonModule,FooterTabsComponent]
})
export class CallsScreenPage implements OnInit {

  constructor(private popoverCtrl: PopoverController) { }

  ngOnInit() {
  }

  chatList = [
    {
      name: 'Divish Koul (4)',
      message: '6 April,9:50 pm',
      time: '02:12 PM',
      unread: true,
      unreadCount: 2
    },
    {
      name: 'Divish Koul (4)',
      message: '6 April,9:50 pm',
      time: '02:12 PM',
      unread: true,
      unreadCount: 1
    },
    {
      name: 'Divish Koul (4)',
      message: '6 April,9:50 pm',
      time: '02:12 PM',
      unread: false,
      unreadCount: 0
    },
    {
      name: 'Divish Koul (4)',
      message: '6 April,9:50 pm',
      time: '02:12 PM',
      unread: false,
      unreadCount: 0
    },
    {
      name: 'Divish Koul (4)',
      message: '6 April,9:50 pm',
      time: '02:12 PM',
      unread: false,
      unreadCount: 0
    },
    {
      name: 'Divish Koul (4)',
      message: '6 April,9:50 pm',
      time: '02:12 PM',
      unread: false,
      unreadCount: 0
    },
    {
      name: 'Divish Koul (4)',
      message: '6 April,9:50 pm',
      time: '02:12 PM',
      unread: false,
      unreadCount: 0
    },
    {
      name: 'Divish Koul (4)',
      message: '6 April,9:50 pm',
      time: '02:12 PM',
      unread: false,
      unreadCount: 0
    },
    {
      name: 'Divish Koul (4)',
      message: '6 April,9:50 pm',
      time: '02:12 PM',
      unread: false,
      unreadCount: 0
    },
    {
      name: 'Divish Koul (4)',
      message: '6 April,9:50 pm',
      time: '02:12 PM',
      unread: false,
      unreadCount: 0
    },
    // repeat as needed
  ];

    async presentPopover(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();
  }

}
