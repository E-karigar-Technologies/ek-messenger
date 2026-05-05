// //encryption.service.ts
// import { Injectable } from '@angular/core';

// @Injectable({
//   providedIn: 'root',
// })
// export class EncryptionService {
//   private readonly STORAGE_PRIVATE_KEY = localStorage.getItem('ecc_private_key');
//    privateKeyBuffer : any = '';

//   constructor() {}

//   /** Generate ECC key pair, store private key locally, return public key in hex */
//   async generateAndStoreECCKeys(): Promise<string> {
//     const keyPair = await window.crypto.subtle.generateKey(
//       {
//         name: 'ECDH',
//         namedCurve: 'P-256',
//       },
//       true,
//       ['deriveKey', 'deriveBits']
//     );

//     // Export and store private key (PKCS8 format)
//     const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
//     const privateKeyBase64 = this.arrayBufferToBase64(privateKeyBuffer);
//     if(this.STORAGE_PRIVATE_KEY)
//     localStorage.setItem(this.STORAGE_PRIVATE_KEY, privateKeyBase64);

//     // Export public key (SPKI format) and return as hex string
//     const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
//     return this.arrayBufferToHex(publicKeyBuffer);
//   }

//   /** Load private key from localStorage */
//   async getPrivateKey(): Promise<CryptoKey> {
//     if(this.STORAGE_PRIVATE_KEY){
//     const privateKeyBase64 = this.STORAGE_PRIVATE_KEY;
//     // const privateKeyBase64 = 14;
// // 

//     if (!privateKeyBase64) {
//       throw new Error('Private key not found in localStorage. Generate keys first.');
//     }

//      this.privateKeyBuffer = this.base64ToArrayBuffer(privateKeyBase64);
//   }

//     return window.crypto.subtle.importKey(
//       'pkcs8',
//       this.privateKeyBuffer,
//       {
//         name: 'ECDH',
//         namedCurve: 'P-256',
//       },
//       true,
//       ['deriveKey', 'deriveBits']
//     );

//   }

//   /** Import receiver's public key (hex) */
//   async importPublicKey(hexPublicKey: string): Promise<CryptoKey> {
//     const publicKeyBuffer = this.hexToArrayBuffer(hexPublicKey);
//     return window.crypto.subtle.importKey(
//       'spki',
//       publicKeyBuffer,
//       {
//         name: 'ECDH',
//         namedCurve: 'P-256',
//       },
//       true,
//       []
//     );
//   }

//   /** Derive AES key from ECDH shared secret */
//   async deriveAESKey(receiverPublicKeyHex: string): Promise<CryptoKey> {
//     const privateKey = await this.getPrivateKey();
//     //console.log("private key",privateKey);
//     const publicKey = await this.importPublicKey(receiverPublicKeyHex);

//     // Derive a 256-bit AES key from shared secret
//     return window.crypto.subtle.deriveKey(
//       {
//         name: 'ECDH',
//         public: publicKey,
//       },
//       privateKey,
//       { name: 'AES-CBC', length: 256 },
//       false,
//       ['encrypt', 'decrypt']
//     );
//   }

//   /** Encrypt message with AES-CBC */
//   async encryptMessageAES(plainText: string, aesKey: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
//     const encoder = new TextEncoder();
//     const encoded = encoder.encode(plainText);
//     return window.crypto.subtle.encrypt(
//       {
//         name: 'AES-CBC',
//         iv,
//       },
//       aesKey,
//       encoded
//     );
//   }

//   /** Build encrypted payload for sending */
//   async buildEncryptedPayload(
//     plainText: string,
//     receiverPhoneNumber: string,
//     receiverPublicKeyHex: string
//   ): Promise<any> {
//     const senderId = localStorage.getItem('userId');
//     if (!senderId) throw new Error('Sender userId missing in localStorage');

//     // Derive AES key for the receiver
//     const aesKey = await this.deriveAESKey(receiverPublicKeyHex);

//     // Generate random IV (16 bytes)
//     const iv = window.crypto.getRandomValues(new Uint8Array(16));

//     // Encrypt message
//     const encryptedBuffer = await this.encryptMessageAES(plainText, aesKey, iv);

//     // Convert to hex strings
//     const ivHex = this.arrayBufferToHex(iv.buffer);
//     const encryptedHex = this.arrayBufferToHex(encryptedBuffer);

//     return {
//       senderId: Number(senderId),
//       receiverPhoneNumber,
//       encryptedMessage: {
//         iv: ivHex,
//         encryptedText: encryptedHex,
//       },
//       messageType: 'text',
//     };
//   }

//   /* ----------- Helper functions ----------- */

//   arrayBufferToHex(buffer: ArrayBuffer): string {
//     return Array.from(new Uint8Array(buffer))
//       .map((b) => b.toString(16).padStart(2, '0'))
//       .join('');
//   }

//   hexToArrayBuffer(hexString: string): ArrayBuffer {
//     const length = hexString.length / 2;
//     const buffer = new Uint8Array(length);
//     for (let i = 0; i < length; i++) {
//       buffer[i] = parseInt(hexString.substr(i * 2, 2), 16);
//     }
//     return buffer.buffer;
//   }

//   arrayBufferToBase64(buffer: ArrayBuffer): string {
//     let binary = '';
//     const bytes = new Uint8Array(buffer);
//     for (let i = 0; i < bytes.byteLength; i++) {
//       binary += String.fromCharCode(bytes[i]);
//     }
//     return window.btoa(binary);
//   }

//   base64ToArrayBuffer(base64: string): ArrayBuffer {
//     const binary = window.atob(base64);
//     const length = binary.length;
//     const buffer = new Uint8Array(length);
//     for (let i = 0; i < length; i++) {
//       buffer[i] = binary.charCodeAt(i);
//     }
//     return buffer.buffer;
//   }

// //wip
// /** Decrypt message with AES-CBC */
// async decryptMessageAES(
//   encryptedHex: string,
//   ivHex: string,
//   aesKey: CryptoKey
// ): Promise<string> {
//   try {
//     const iv = this.hexToArrayBuffer(ivHex);
//     const encryptedBuffer = this.hexToArrayBuffer(encryptedHex);

//     const decryptedBuffer = await window.crypto.subtle.decrypt(
//       {
//         name: 'AES-CBC',
//         iv
//       },
//       aesKey,
//       encryptedBuffer
//     );

//     return new TextDecoder().decode(decryptedBuffer);
//   } catch (error) {
//     console.error('Decryption Error:', error);
//     throw new Error('Failed to decrypt message');
//   }
// }

// /** Decrypt an incoming message */
// // async decryptMessage(
// //   encryptedHex: string,
// //   ivHex: string,
// //   senderPublicKeyHex: string
// // ): Promise<string> {
// //   try {
// //     // Derive AES key using sender's public key and receiver's private key
// //     const aesKey = await this.deriveAESKey(senderPublicKeyHex);

// //     // Decrypt the message
// //     return await this.decryptMessageAES(encryptedHex, ivHex, aesKey);
// //   } catch (error) {
// //     console.error('Decrypt Message Error:', error);
// //     throw new Error('Failed to decrypt message');
// //   }
// // }


// async decryptMessage(encryptedHex: string, ivHex: string, senderPublicKeyHex: string): Promise<string> {
//   try {
//     if (!encryptedHex || !ivHex || !senderPublicKeyHex) {
//       throw new Error('Missing required parameters for decryption');
//     }
//     const aesKey = await this.deriveAESKey(senderPublicKeyHex);
//     return await this.decryptMessageAES(encryptedHex, ivHex, aesKey);
//   } catch (error) {
//     console.error('Error decrypting message:', error);
//     throw new Error('Failed to decrypt message');
//   }
// }
// }



// import { Injectable } from '@angular/core';

// @Injectable({
//   providedIn: 'root'
// })
// export class EncryptionService {
//   private secretKey = 'YourStrongKey123'; // Ideally from env
//   private keyPair: CryptoKeyPair | null = null;

//   // XOR-based simple encryption
//   encrypt(text: string): string {
//     return btoa(text.split('').map((c, i) =>
//       String.fromCharCode(c.charCodeAt(0) ^ this.secretKey.charCodeAt(i % this.secretKey.length))
//     ).join(''));
//   }

//   // XOR-based simple decryption
//   decrypt(encryptedText: string): string {
//     const decoded = atob(encryptedText);
//     return decoded.split('').map((c, i) =>
//       String.fromCharCode(c.charCodeAt(0) ^ this.secretKey.charCodeAt(i % this.secretKey.length))
//     ).join('');
//   }

//   // ECC key generation
//   async generateAndStoreECCKeys(): Promise<string> {
//     this.keyPair = await crypto.subtle.generateKey(
//       {
//         name: 'ECDH',
//         namedCurve: 'P-256',
//       },
//       true,
//       ['deriveKey', 'deriveBits']
//     );

//     const exported = await crypto.subtle.exportKey('raw', this.keyPair.publicKey);
//     const publicKeyHex = Array.from(new Uint8Array(exported))
//       .map((b) => b.toString(16).padStart(2, '0'))
//       .join('');

//     localStorage.setItem('eccPublicKey', publicKeyHex);
//     return publicKeyHex;
//   }

//   getPrivateKey(): CryptoKey | null {
//     return this.keyPair?.privateKey || null;
//   }

//   getPublicKey(): CryptoKey | null {
//     return this.keyPair?.publicKey || null;
//   }
// }



import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class EncryptionService {
  private secretKey: string = 'YourSuperSecretPassphrase'; // Ideally from environment or login
  private aesKey: CryptoKey | null = null;
  private keyPair: CryptoKeyPair | null = null;

  constructor() {
    // Do NOT await here — handle key init lazily inside encrypt/decrypt
    this.importAESKey(this.secretKey);
  }

  // Derive AES key from passphrase
  async importAESKey(passphrase: string): Promise<void> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    this.aesKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode('your_salt_value'), // Use consistent salt per user/device
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // AES Encrypt
  async encrypt(text: string): Promise<string> {
    if (!this.aesKey) {
      await this.importAESKey(this.secretKey);
    }

    const aesKey = this.aesKey!; // Now TypeScript knows it's not null

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encoded
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }


  // AES Decrypt
  async decrypt(cipherText: string): Promise<string> {
    if (!this.aesKey) {
      await this.importAESKey(this.secretKey);
    }

    const aesKey = this.aesKey!;

    if (!cipherText) return ''; // nothing to decrypt

    try {
      const data = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));

      // Check minimum length for IV + ciphertext
      if (data.length <= 12) {
        // Probably plain text or corrupt — fallback
        return cipherText;
      }

      const iv = data.slice(0, 12);
      const encrypted = data.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        encrypted
      );

      return new TextDecoder().decode(decrypted);
    } catch (err) {
      // console.warn('Decrypt failed, falling back to plain text:', err);
      return cipherText;
    }
  }



  // ECC Key Generation
  async generateAndStoreECCKeys(): Promise<string> {
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    const exported = await crypto.subtle.exportKey('raw', this.keyPair.publicKey);
    const publicKeyHex = Array.from(new Uint8Array(exported))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    localStorage.setItem('eccPublicKey', publicKeyHex);
    return publicKeyHex;
  }

  getPrivateKey(): CryptoKey | null {
    return this.keyPair?.privateKey || null;
  }

  getPublicKey(): CryptoKey | null {
    return this.keyPair?.publicKey || null;
  }
}


