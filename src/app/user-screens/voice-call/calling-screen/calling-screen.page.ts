import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-calling-screen',
  templateUrl: './calling-screen.page.html',
  styleUrls: ['./calling-screen.page.scss'],
  imports: [IonicModule, CommonModule]
})
export class CallingScreenPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}


// import { CommonModule } from '@angular/common';
// import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
// import { IonicModule } from '@ionic/angular';
// import { WebrtcService } from 'src/app/services/webRTC/webrtc.service';

// @Component({
//   selector: 'app-calling-screen',
//   standalone: true,
//   imports: [
//     CommonModule,
//     IonicModule
//   ],
//   templateUrl: './calling-screen.page.html',
//   styleUrls: ['./calling-screen.page.scss'],
// })
// export class CallingScreenPage implements OnInit {
//   @ViewChild('localAudio')
//   localAudio!: ElementRef;
//   @ViewChild('remoteAudio')
//   remoteAudio!: ElementRef;

//   constructor(private webrtcService: WebrtcService) {}

//   async ngOnInit() {
//     this.webrtcService.initSocket();

//     await this.webrtcService.startCall();

//     this.localAudio.nativeElement.srcObject = this.webrtcService.getLocalStream();
//     this.remoteAudio.nativeElement.srcObject = this.webrtcService.getRemoteStream();
//   }
// }

