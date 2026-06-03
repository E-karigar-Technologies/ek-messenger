import { Component, OnInit, ViewChild } from '@angular/core';
import { IonContent, IonicModule } from '@ionic/angular';
import { AiChatService, AiMessage } from '../../services/ai-chat.service';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ai-chat-screen',
  templateUrl: './ai-chat-screen.page.html',
  styleUrls: ['./ai-chat-screen.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule,FormsModule]

})
export class AiChatScreenPage implements OnInit {
  @ViewChild(IonContent, { static: false }) content!: IonContent;

  messages: AiMessage[] = [];
  newMessage: string = '';
  conversationId: string | null = null;
  isSending: boolean = false;

  quickPresets = [
    "What is the pro plan?",
    "Compare features",
    "How does pricing work?",
    "Do you have a free trial?"
  ];

  constructor(private aiChatService: AiChatService) { }

  async ngOnInit() {
    // Check if we saved a conversation ID (could be in localStorage or state)
    this.conversationId = localStorage.getItem('ai_conv_id');
    
    if (this.conversationId) {
      this.messages = await this.aiChatService.getHistory(this.conversationId);
      setTimeout(() => this.content.scrollToBottom(300), 100);
    } else {
      // Init new
      try {
        this.conversationId = await this.aiChatService.initChat();
        localStorage.setItem('ai_conv_id', this.conversationId);
        // Push initial greeting locally
        this.messages.push({ role: 'ai', content: 'Hello! I am ConvoIQ, your AI assistant. How can I help you today?' });
      } catch (err) {
        console.error('Failed to init chat', err);
      }
    }
  }

  async clearChat() {
    if (this.conversationId) {
      await this.aiChatService.clearChat(this.conversationId);
      this.messages = [];
      localStorage.removeItem('ai_conv_id');
      this.conversationId = await this.aiChatService.initChat();
      localStorage.setItem('ai_conv_id', this.conversationId);
      this.messages.push({ role: 'ai', content: 'Chat history cleared. How can I assist you now?' });
    }
  }

  usePreset(preset: string) {
    this.newMessage = preset;
    this.sendMessage();
  }

  sendMessage() {
    const text = this.newMessage.trim();
    if (!text || !this.conversationId || this.isSending) return;

    this.newMessage = '';
    this.isSending = true;

    // Append User Message
    this.messages.push({ role: 'user', content: text });
    setTimeout(() => this.content.scrollToBottom(300), 100);

    // Append AI Placeholder
    const aiPlaceholder: AiMessage = { role: 'ai', content: '', isStreaming: true };
    this.messages.push(aiPlaceholder);
    
    this.aiChatService.streamChat(
      this.conversationId,
      text,
      (chunk) => {
        aiPlaceholder.content += chunk;
        this.content.scrollToBottom(100); // keep scrolling down during fast streams
      },
      () => {
        aiPlaceholder.isStreaming = false;
        this.isSending = false;
        setTimeout(() => this.content.scrollToBottom(300), 100);
      },
      (err) => {
        console.error(err);
        aiPlaceholder.isStreaming = false;
        aiPlaceholder.content += "\n\n[Network Error. Please try again.]";
        this.isSending = false;
      }
    );
  }

  /**
   * Basic markdown wrapper (bold text and line breaks).
   * For security reasons, we sanitize heavily or just use basic Regex replacements.
   */
  formatAiMessage(content: string): string {
    if (!content) return '';
    let formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\n/g, '<br/>');
    return formatted;
  }
}
