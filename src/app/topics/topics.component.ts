import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NewsService } from '../services/news.service';
import { ThemeService } from '../services/theme.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-topics',
  templateUrl: './topics.component.html',
  styleUrls: ['./topics.component.scss'],
})
export class TopicsComponent  implements OnInit {
  topics: {id: string, name: string}[] = [];
  newTopic: string = '';

  constructor(
    private newsService: NewsService, 
    private router: Router,
    public themeService: ThemeService,
    private notificationService: NotificationService
  ) { }

  ngOnInit() {
    this.newsService.getTopics().subscribe(topics => {
      this.topics = topics;
    });
  }

  async addTopic() {
    if (this.newTopic.trim()) {
      const topicName = this.newTopic.trim();
      await this.newsService.addTopic(topicName);
      await this.notificationService.subscribe(topicName);
      this.newTopic = '';
    }
  }

  async removeTopic(id: string, name: string) {
    await this.newsService.removeTopic(id, name);
    await this.notificationService.unsubscribe(name);
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
