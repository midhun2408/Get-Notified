import { Component, OnInit } from '@angular/core';
import { NotificationService } from './services/notification.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'Get-Notified';

  constructor(
    private notificationService: NotificationService,
    private themeService: ThemeService
  ) {}

  ngOnInit() {
    this.notificationService.requestPermission();
    this.notificationService.listenForMessages();
  }
}
