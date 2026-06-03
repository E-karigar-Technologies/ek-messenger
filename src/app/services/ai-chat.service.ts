import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';

export interface AiMessage {
  role: 'user' | 'ai';
  content: string;
  isStreaming?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AiChatService {
  private apiUrl = `${environment.apiBaseUrl}/api/ai`; // Wait, need to check environment

  constructor(private http: HttpClient) {}

  /**
   * Temporary getter to get API URL since environments can vary.
   * Based on local usage it defaults to normal API setup.
   */
  private getApiUrl(): string {
     // Defaulting to the expected URL based on common structure
    return 'http://localhost:7000/api/ai'; 
  }

  getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') || '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  async initChat(): Promise<string> {
    const res = await this.http.post<{conversation_id: string}>(
      `${this.getApiUrl()}/chat/init`, 
      {}, 
      { headers: this.getHeaders() }
    ).toPromise();
    return res?.conversation_id || '';
  }

  async clearChat(conversationId: string): Promise<void> {
    await this.http.delete(`${this.getApiUrl()}/chat/${conversationId}`, { headers: this.getHeaders() }).toPromise();
  }

  async getHistory(conversationId: string): Promise<AiMessage[]> {
    const res = await this.http.get<{data: AiMessage[]}>(
      `${this.getApiUrl()}/chat/history?conversation_id=${conversationId}`,
      { headers: this.getHeaders() }
    ).toPromise();
    return res?.data || [];
  }

  /**
   * Handle SSE stream leveraging native fetch stream reader
   */
  async streamChat(
    conversationId: string, 
    message: string, 
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (err: any) => void
  ) {
    const token = localStorage.getItem('token') || '';
    
    try {
      const response = await fetch(`${this.getApiUrl()}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ conversation_id: conversationId, message })
      });

      if (!response.body) {
         throw new Error("ReadableStream not yet supported in this browser.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        
        if (value) {
          const chunkString = decoder.decode(value, { stream: true });
          // Split by data lines because SSE chunks often combine multiple "data: \n\n" calls 
          const lines = chunkString.split("\n\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.substring(6);
              if (dataStr === "[DONE]") {
                onComplete();
                return;
              }
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  onChunk(parsed.text);
                }
              } catch (e) {
                // partial chunk parsing failure is common in SSE, just gracefully ignore till buffer finishes
              }
            }
          }
        }
      }
      onComplete();
    } catch (err) {
      console.error('SSE Stream Error', err);
      onError(err);
    }
  }
}
