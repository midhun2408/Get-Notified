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
  topics: string[] = [];

  constructor(
    private newsService: NewsService, 
    private router: Router,
    public themeService: ThemeService
  ) { }

  ngOnInit() {
    this.newsService.getTopics().subscribe(topics => {
      this.topics = topics;
      this.newsService.getNewsForTopics(this.topics).subscribe(news => {
        this.news = news;
      });
    });
  }

  goToTopics() {
    this.router.navigate(['/topics']);
  }

  goToDetail(id: string) {
    this.router.navigate(['/news-detail', id]);
  }
}
