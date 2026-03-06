import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NewsService } from '../services/news.service';

@Component({
  selector: 'app-topics',
  templateUrl: './topics.component.html',
  styleUrls: ['./topics.component.scss'],
})
export class TopicsComponent  implements OnInit {
  topics: string[] = [];
  newTopic: string = '';

  constructor(private newsService: NewsService, private router: Router) { }

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

  removeTopic(topic: string) {
    this.newsService.removeTopic(topic);
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
