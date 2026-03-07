import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, docData, deleteDoc } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-news-detail',
  templateUrl: './news-detail.component.html',
  styleUrls: ['./news-detail.component.scss'],
})
export class NewsDetailComponent implements OnInit {
  newsItem$: Observable<any> = of(null);

  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    private router: Router,
    public themeService: ThemeService
  ) { }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const newsRef = doc(this.firestore, `news/${id}`);
      this.newsItem$ = docData(newsRef);
    }
  }

  async markAsRead() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      try {
        const newsRef = doc(this.firestore, `news/${id}`);
        await deleteDoc(newsRef);
        this.goBack();
      } catch (error) {
        console.error('Error deleting news item:', error);
      }
    }
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
