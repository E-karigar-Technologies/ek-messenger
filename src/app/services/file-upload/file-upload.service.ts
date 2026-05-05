import { Injectable } from '@angular/core';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

@Injectable({ providedIn: 'root' })
export class FileUploadService {
  private storage = getStorage();

  async uploadFile(file: File, chatRoomId: string): Promise<string> {
    const filePath = `attachments/${chatRoomId}/${Date.now()}_${file.name}`;
    const storageRef = ref(this.storage, filePath);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }
}
