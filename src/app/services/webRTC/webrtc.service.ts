// // src/app/services/webrtc.service.ts
// import { Injectable } from '@angular/core';
// import { io, Socket } from 'socket.io-client';

// @Injectable({ providedIn: 'root' })
// export class WebrtcService {
//   private socket: Socket;
//   private peerConnection: RTCPeerConnection;
//   private localStream: MediaStream;
//   private remoteStream: MediaStream;

//   initSocket(): void {
//     this.socket = io('http://localhost:3000'); // Replace with your signaling server
//     this.listenForSignals();
//   }

//   async startCall(): Promise<MediaStream> {
//     this.peerConnection = new RTCPeerConnection();
//     this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));

//     this.peerConnection.onicecandidate = event => {
//       if (event.candidate) {
//         this.socket.emit('ice-candidate', event.candidate);
//       }
//     };

//     this.remoteStream = new MediaStream();
//     this.peerConnection.ontrack = event => {
//       this.remoteStream.addTrack(event.track);
//     };

//     const offer = await this.peerConnection.createOffer();
//     await this.peerConnection.setLocalDescription(offer);
//     this.socket.emit('offer', offer);

//     return this.remoteStream;
//   }

//   private listenForSignals(): void {
//     this.socket.on('offer', async offer => {
//       this.peerConnection = new RTCPeerConnection();
//       this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));

//       this.remoteStream = new MediaStream();
//       this.peerConnection.ontrack = event => this.remoteStream.addTrack(event.track);

//       this.peerConnection.onicecandidate = event => {
//         if (event.candidate) {
//           this.socket.emit('ice-candidate', event.candidate);
//         }
//       };

//       await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
//       const answer = await this.peerConnection.createAnswer();
//       await this.peerConnection.setLocalDescription(answer);
//       this.socket.emit('answer', answer);
//     });

//     this.socket.on('answer', async answer => {
//       await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
//     });

//     this.socket.on('ice-candidate', async candidate => {
//       await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
//     });
//   }

//   getLocalStream(): MediaStream {
//     return this.localStream;
//   }

//   getRemoteStream(): MediaStream {
//     return this.remoteStream;
//   }
// }


import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root',
})
export class WebrtcService {
  private socket!: Socket;
  private localStream!: MediaStream;
  private remoteStream!: MediaStream;
  private peerConnection!: RTCPeerConnection;

  initSocket() {
    this.socket = io('http://localhost:3000');

    this.socket.on('offer', async (offer) => {
      await this.createPeer();
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.socket.emit('answer', answer);
    });

    this.socket.on('answer', async (answer) => {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    this.socket.on('candidate', async (candidate) => {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });
  }

  async startCall() {
    await this.createPeer();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.socket.emit('offer', offer);

    return this.remoteStream;
  }

  private async createPeer() {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.remoteStream = new MediaStream();

    this.peerConnection = new RTCPeerConnection();

    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    this.peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        this.remoteStream.addTrack(track);
      });
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('candidate', event.candidate);
      }
    };
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }
}
