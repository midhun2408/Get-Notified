import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';

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
    private router: Router
  ) { }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const newsRef = doc(this.firestore, `news/${id}`);
      this.newsItem$ = docData(newsRef);
    }
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
