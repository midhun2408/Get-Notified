import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NewsService } from '../services/news.service';
import { ThemeService } from '../services/theme.service';

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
    public themeService: ThemeService
  ) { }

  ngOnInit() {
    this.newsService.getTopics().subscribe(topics => {
      this.topics = topics;
    });
  }

  addTopic() {
    if (this.newTopic.trim()) {
      this.newsService.addTopic(this.newTopic.trim());
      this.newTopic = '';
    }
  }

  removeTopic(id: string, name: string) {
    this.newsService.removeTopic(id, name);
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
