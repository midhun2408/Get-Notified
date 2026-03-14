import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData, query, where, addDoc, deleteDoc, doc, updateDoc, orderBy, getDocs, writeBatch } from '@angular/fire/firestore';
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

  getTopics(): Observable<{id: string, name: string, status?: string}[]> {
    const topicsRef = collection(this.firestore, 'topics');
    const q = query(topicsRef, orderBy('name'));
    return collectionData(q, { idField: 'id' }).pipe(
      map(docs => docs.map((d: any) => ({ id: d.id, name: d.name, status: d.status })))
    );
  }

  async addTopic(topic: string) {
    const topicsRef = collection(this.firestore, 'topics');
    return await addDoc(topicsRef, { name: topic, status: 'pending' });
  }

  async removeTopic(id: string, name: string) {
    // 1. Delete associated news
    const newsRef = collection(this.firestore, 'news');
    const q = query(newsRef, where('topic', '==', name));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const batch = writeBatch(this.firestore);
      snapshot.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`Cleaned up ${snapshot.size} news items for topic: ${name}`);
    }

    // 2. Delete topic
    const topicDocRef = doc(this.firestore, `topics/${id}`);
    return deleteDoc(topicDocRef);
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
      map(news => {
        // Only keep news from today (local date)
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const todayEnd = todayStart + 24 * 60 * 60 * 1000;
        return news.filter(item => {
          const t = item.timestamp instanceof Date
            ? item.timestamp.getTime()
            : new Date(item.time || 0).getTime();
          return t >= todayStart && t < todayEnd;
        });
      }),
      map(news => news.slice().sort((a, b) => {
        const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp || a.time).getTime();
        const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp || b.time).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return a.topic.localeCompare(b.topic, undefined, { sensitivity: 'base' });
      }))
    );
  }

}
