import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NewsService, NewsItem } from '../services/news.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent  implements OnInit {
  news: NewsItem[] = [];
  topics: {id: string, name: string}[] = [];
  selectedTopics: Set<string> = new Set();

  constructor(
    private newsService: NewsService, 
    private router: Router,
    public themeService: ThemeService
  ) { }

  ngOnInit() {
    this.newsService.getTopics().subscribe(topics => {
      this.topics = topics;
      // Default: select all if none selected yet
      if (this.selectedTopics.size === 0) {
        this.topics.forEach(t => this.selectedTopics.add(t.name));
      }
      this.refreshNews();
    });
  }

  toggleTopic(topicName: string) {
    if (this.selectedTopics.has(topicName)) {
      this.selectedTopics.delete(topicName);
    } else {
      this.selectedTopics.add(topicName);
    }
    this.refreshNews();
  }

  refreshNews() {
    const selectedArray = Array.from(this.selectedTopics);
    if (selectedArray.length > 0) {
      this.newsService.getNewsForTopics(selectedArray).subscribe(news => {
        this.news = news;
      });
    } else {
      this.news = [];
    }
  }

  goToTopics() {
    this.router.navigate(['/topics']);
  }

  goToDetail(id: string) {
    this.router.navigate(['/news-detail', id]);
  }
}
