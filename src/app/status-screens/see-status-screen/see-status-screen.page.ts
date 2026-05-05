// import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { IonicModule} from '@ionic/angular';

@Component({
  selector: 'app-see-status-screen',
  templateUrl: './see-status-screen.page.html',
  styleUrls: ['./see-status-screen.page.scss'],
  imports: [IonicModule, CommonModule]
})
export class SeeStatusScreenPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
