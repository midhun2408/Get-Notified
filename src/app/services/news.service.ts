import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData, query, where, addDoc, deleteDoc, doc, updateDoc, orderBy } from '@angular/fire/firestore';
import { Observable, BehaviorSubject, map, switchMap } from 'rxjs';

export interface NewsItem {
  id: string;
  topic: string;
  title: string;
  source: string;
  time: string;
  timestamp: any;
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
    return (collectionData(q, { idField: 'id' }) as Observable<NewsItem[]>).pipe(
      map(news => news.map(item => ({
        ...item,
        timestamp: item.timestamp?.seconds ? new Date(item.timestamp.seconds * 1000) : item.timestamp
      }))),
      map(news => news.sort((a, b) => {
        const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp || a.time).getTime();
        const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp || b.time).getTime();
        return timeB - timeA;
      }))
    );
  }
}
