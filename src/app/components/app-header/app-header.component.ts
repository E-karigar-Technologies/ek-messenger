import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { IonicModule } from '@ionic/angular';

export interface HeaderAction {
  icon: string;
  label?: string;
  onPress?: () => void;
}

export interface HeaderConfig {
  title?: string;
  customHtml?: string;
  actions?: HeaderAction[];
  showBackButton?: boolean;
}

@Component({
  selector: 'app-header',
  templateUrl:  './app-header.component.html',
  imports: [IonicModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeaderComponent {
  @Input() config: HeaderConfig = { title: '', actions: [] };
  @Output() back = new EventEmitter<void>();

  onBack() {
    this.back.emit();
  }

  handleAction(action: HeaderAction) {
    if (action.onPress) action.onPress();
  }
}
