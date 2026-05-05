// import { Injectable } from '@angular/core';
// import { Observable } from 'rxjs';
// import { io, Socket } from 'socket.io-client';

// @Injectable({
//   providedIn: 'root'
// })
// export class SocketService {
//   private socket!: Socket;

//   connect(userId: string) {
//     this.socket = io('http://localhost:3000');
//     this.socket.emit('joinChat', userId);
//   }

//   sendMessage(message: { user: string; text: string }) {
//     this.socket.emit('chatMessage', message);
//   }

//   getMessages(): Observable<any> {
//     return new Observable(observer => {
//       this.socket.on('message', msg => {
//         observer.next(msg);
//       });

//       this.socket.on('connectionRejected', msg => {
//         alert('Connection rejected: ' + msg);
//       });

//       this.socket.on('joined', msg => {
//         //console.log(msg);
//       });
//     });
//   }

//   disconnect() {
//     if (this.socket) {
//       this.socket.disconnect();
//     }
//   }
// }

// import { Injectable } from '@angular/core';
// import { io, Socket } from 'socket.io-client';
// import { environment } from 'src/environments/environment';
// import { Observable } from 'rxjs';

// @Injectable({
//   providedIn: 'root'
// })
// export class SocketService {
//   private socket: Socket;
//   // private readonly serverUrl = 'http://localhost:3000';
//   private readonly serverUrl = 'https://telldemm-backend.onrender.com/';

//   constructor() {
//     const userId = localStorage.getItem('userId');
//     this.socket = io(this.serverUrl, {
//       // query: { userId }
//     });
//     this.socket.emit('register-user', userId);
//   }

//   sendMessage(data: any) {
//     this.socket.emit('messageFromUser', data);
//   }

//   onMessage(): Observable<any> {
//     return new Observable(observer => {
//       this.socket.on('privateMessageFromServer', (msg) => {
//         //console.log(msg);
//         observer.next(msg);
//       });
//     });
//   }

//   disconnect() {
//     if (this.socket) {
//       this.socket.disconnect();
//     }
//   }
// }

// import { Injectable } from '@angular/core';
// import { io, Socket } from 'socket.io-client';
// import { Observable } from 'rxjs';

// @Injectable({
//   providedIn: 'root'
// })
// export class SocketService {
//   isConnected(): any {
//     throw new Error('Method not implemented.');
//   }
//   // onMessage() {
//   //   throw new Error('Method not implemented.');
//   // }
//   private socket: Socket;
//   private readonly serverUrl = 'https://telldemm-backend.onrender.com/';

//   constructor() {
//     this.socket = io(this.serverUrl);

//     // Optional: If you want to register the user on connection
//     const userId = localStorage.getItem('userId');
//     if (userId) {
//       this.socket.emit('register-user', userId); // Only if handled on backend
//     }
//   }

//   /**
//    * Send encrypted message to backend.
//    * Data must be in the format:
//    * {
//    *   encryptedMessage: { iv: string, encryptedText: string },
//    *   senderId: string,
//    *   receiverId: string
//    * }
//    */
//   // sendMessage(data: any) {
//   //   this.socket.emit('send_message', data);
//   // }

//   //  sendMessage(data: any) {
//   //   this.socket.emit('send_message', data);
//   // }

//   onMessageReceived(callback: (data: any) => void) {
//     this.socket.on('receive_message', callback);
//   }

//   onError(callback: (error: any) => void) {
//     this.socket.on('error', callback);
//   }

//   emitMessage(payload: any): Promise<any> {
//   return new Promise((resolve, reject) => {
//     this.socket.emit('send_message', payload, (response: any) => {
//       if (response?.status === 'success') {
//         resolve(response); // This is your server's response
//       } else {
//         reject(response);
//       }
//     });
//   });
// }

// //  emitMessage(data: any) {
// //     this.socket.emit('send_message', data);
// //   }

//   /**
//    * Listen for incoming messages broadcasted by backend.
//    */
//   onMessage(): Observable<any> {
//     return new Observable(observer => {
//       this.socket.on('receive_message', (msg) => {
//         //console.log('Received message:', msg);
//         observer.next(msg);
//       });
//     });
//   }

//   // disconnect() {
//   //   if (this.socket) {
//   //     this.socket.disconnect();
//   //   }
//   // }
// }

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket: Socket;
  private readonly serverUrl = 'https://telldemm-backend.onrender.com';

  constructor() {
    const userId = localStorage.getItem('userId');
    this.socket = io(this.serverUrl, {
      // query: { userId }
    });
    this.socket.emit('register-user', userId);
  }

  sendMessage(data: any) {
    this.socket.emit('messageFromUser', data);
  }

  onMessage(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('privateMessageFromServer', (msg) => {
        //console.log(msg);
        observer.next(msg);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
