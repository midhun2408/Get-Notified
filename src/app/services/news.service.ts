import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData, query, where, addDoc, deleteDoc, doc, updateDoc } from '@angular/fire/firestore';
import { Observable, BehaviorSubject, map, switchMap } from 'rxjs';

export interface NewsItem {
  id: string;
  topic: string;
  title: string;
  source: string;
  time: string;
  url: string;
  imageUrl?: string;
  description?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NewsService {
  constructor(private firestore: Firestore) {}

  getTopics(): Observable<string[]> {
    const topicsRef = collection(this.firestore, 'topics');
    return collectionData(topicsRef, { idField: 'id' }).pipe(
      map(docs => docs.map((d: any) => d.name))
    );
  }

  addTopic(topic: string) {
    const topicsRef = collection(this.firestore, 'topics');
    return addDoc(topicsRef, { name: topic });
  }

  removeTopic(name: string) {
    // Note: This logic assumes topic name is unique or you have its ID
    // Simplification for the demo: search by name
  }

  getNewsForTopics(topics: string[]): Observable<NewsItem[]> {
    if (topics.length === 0) return new BehaviorSubject<NewsItem[]>([]).asObservable();
    
    const newsRef = collection(this.firestore, 'news');
    const q = query(newsRef, where('topic', 'in', topics));
    return collectionData(q, { idField: 'id' }) as Observable<NewsItem[]>;
  }
}
