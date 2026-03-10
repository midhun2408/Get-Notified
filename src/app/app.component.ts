import { Component, OnInit } from '@angular/core';
import { NotificationService } from './services/notification.service';
import { ThemeService } from './services/theme.service';
import { App } from '@capacitor/app';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'Get-Notified';

  constructor(
    private notificationService: NotificationService,
    private themeService: ThemeService,
    private router: Router
  ) { }

  ngOnInit() {
    this.notificationService.requestPermission();
    this.notificationService.listenForMessages();
    this.setupBackButton();
  }

  private setupBackButton() {
    App.addListener('backButton', ({ canGoBack }) => {
      const currentUrl = this.router.url;
      if (currentUrl === '/home' || currentUrl === '/') {
        App.exitApp();
      } else {
        this.router.navigate(['/home']);
      }
    });
  }
}
