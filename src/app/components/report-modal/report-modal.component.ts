// src/app/components/report-modal/report-modal.component.ts

import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { ApiService } from 'src/app/services/api/api.service';
import { ReportCategory, SubmitReportPayload, ReportEvidence, ReportSnapshot } from 'src/types';

@Component({
  selector: 'app-report-modal',
  templateUrl: './report-modal.component.html',
  styleUrls: ['./report-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ReportModalComponent implements OnInit {
  @Input() reportedUserId!: number;
  @Input() roomId!: string;
  @Input() chatType!: 'private' | 'group';
  @Input() chatTitle!: string;
  @Input() reporterSnapshot!: ReportSnapshot;
  @Input() reportedSnapshot!: ReportSnapshot;
  @Input() evidence!: ReportEvidence[];
  @Input() showBlockOption: boolean = false;
  @Input() isAlreadyBlocked: boolean = false;

  categories: ReportCategory[] = [];
  selectedCategory: number | null = null;
  description: string = '';
  alsoBlock: boolean = false;
  isSubmitting: boolean = false;

  constructor(
    private modalCtrl: ModalController,
    private apiService: ApiService,
    private toastCtrl: ToastController,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.alsoBlock = this.showBlockOption && this.isAlreadyBlocked;
    this.loadCategories();
  }

  async loadCategories() {
    try {
      const response = await this.apiService.getReportCategories().toPromise();
      if (response?.success) {
        this.categories = response.data.filter(cat => cat.is_active === 1);
      }
    } catch (error) {
      console.error('Failed to load report categories:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to load report categories. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    }
  }

  selectCategory(categoryId: number) {
    this.selectedCategory = categoryId;
  }

  async submitReport() {
    if (!this.selectedCategory) {
      const toast = await this.toastCtrl.create({
        message: 'Please select a report category.',
        duration: 3000,
        color: 'warning',
      });
      toast.present();
      return;
    }

    // Use default description if empty
    const finalDescription = this.description.trim() ||
      'User reported this contact for inappropriate behavior.';

    const payload: SubmitReportPayload = {
      reportedUserId: this.reportedUserId,
      roomId: this.roomId,
      chatType: this.chatType,
      chatTitle: this.chatTitle,
      category: this.selectedCategory,
      description: finalDescription,
      reporterSnapshot: this.reporterSnapshot,
      reportedSnapshot: this.reportedSnapshot,
      evidence: this.evidence,
    };

    this.isSubmitting = true;

    try {
      const response = await this.apiService.submitReport(payload).toPromise();
      if (response?.success) {
        const toast = await this.toastCtrl.create({
          message: 'Report submitted successfully.',
          duration: 3000,
          color: 'success',
        });
        toast.present();
        this.modalCtrl.dismiss({
          success: true,
          reportId: response.data.reportId,
          alsoBlock: this.alsoBlock,
        });
      } else {
        throw new Error('Report submission failed');
      }
    } catch (error) {
      console.error('Failed to submit report:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to submit report. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    } finally {
      this.isSubmitting = false;
    }
  }

  close() {
    this.modalCtrl.dismiss({ success: false });
  }
}