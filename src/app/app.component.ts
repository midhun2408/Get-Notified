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
      // The home page is actually /tabs/news based on AppRoutingModule
      if (currentUrl === '/tabs/news' || currentUrl === '/tabs/telegram' || currentUrl === '/') {
        App.exitApp();
      } else {
        // If not on a root tab, go back or to home
        window.history.back();
      }
    });
  }
}
