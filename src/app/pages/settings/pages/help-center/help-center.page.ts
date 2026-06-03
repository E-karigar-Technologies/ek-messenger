import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

interface HelpTopic {
  icon: string;
  label: string;
}

interface Article {
  title: string;
}

@Component({
  selector: 'app-help-center',
  templateUrl: './help-center.page.html',
  styleUrls: ['./help-center.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class HelpCenterPage {
  searchQuery = '';
  showAllArticles = false;

  helpTopics: HelpTopic[] = [
    { icon: 'flag-outline',           label: 'Get Started' },
    { icon: 'chatbubbles-outline',    label: 'Chats' },
    { icon: 'storefront-outline',     label: 'Connect with Businesses' },
    { icon: 'call-outline',           label: 'Voice and Video Calls' },
    { icon: 'people-outline',         label: 'Communities' },
    { icon: 'megaphone-outline',      label: 'Channels' },
    { icon: 'shield-checkmark-outline', label: 'Privacy, Safety, and Security' },
    { icon: 'person-outline',         label: 'Accounts and Account Bans' },
  ];

  allArticles: Article[] = [
    { title: 'How to make a video call' },
    { title: 'How to stay safe on Convo' },
    { title: 'About temporarily banned accounts' },
    { title: 'About ads in Convo Status and Channels' },
    { title: 'How to send photos and videos' },
    { title: 'How to create and manage groups' },
    { title: 'How to use disappearing messages' },
  ];

  get visibleArticles(): Article[] {
    return this.showAllArticles ? this.allArticles : this.allArticles.slice(0, 4);
  }

  get filteredTopics(): HelpTopic[] {
    if (!this.searchQuery.trim()) return this.helpTopics;
    const q = this.searchQuery.toLowerCase();
    return this.helpTopics.filter(t => t.label.toLowerCase().includes(q));
  }

  get filteredArticles(): Article[] {
    if (!this.searchQuery.trim()) return this.visibleArticles;
    const q = this.searchQuery.toLowerCase();
    return this.allArticles.filter(a => a.title.toLowerCase().includes(q));
  }

  contactUs() {
    // TODO: open contact form or email
  }
}
