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
    const docRef = await addDoc(topicsRef, { name: topic, status: 'pending' });
    
    // Trigger Cloudflare Worker
    try {
      await fetch('https://worker.get-notified-api.workers.dev/topic/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: topic, id: docRef.id })
      });
    } catch (e) {
      console.error('Failed to trigger worker for topic creation:', e);
    }
    return docRef;
  }

  async removeTopic(id: string, name: string) {
    // 1. Delete topic from Firestore
    const topicDocRef = doc(this.firestore, `topics/${id}`);
    const result = await deleteDoc(topicDocRef);

    // 2. Trigger Cloudflare Worker to clean up associated news in background
    try {
      await fetch('https://worker.get-notified-api.workers.dev/topic/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
    } catch (e) {
      console.error('Failed to trigger worker for topic deletion:', e);
    }

    return result;
  }

  getNewsForTopics(topics: string[]): Observable<NewsItem[]> {
    if (topics.length === 0) return new BehaviorSubject<NewsItem[]>([]).asObservable();
    
    // Only keep news from today (local date)
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const newsRef = collection(this.firestore, 'news');
    // Filter by topics AND timestamp in the query
    const q = query(
      newsRef, 
      where('topic', 'in', topics),
      where('timestamp', '>=', todayStart)
    );

    return (collectionData(q, { idField: 'id' }) as Observable<NewsItem[]>).pipe(
      map(news => news.map(item => ({
        ...item,
        timestamp: item.timestamp?.seconds ? new Date(item.timestamp.seconds * 1000) : item.timestamp
      }))),
      map(news => news.slice().sort((a, b) => {
        const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp || a.time).getTime();
        const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp || b.time).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return a.topic.localeCompare(b.topic, undefined, { sensitivity: 'base' });
      }))
    );
  }

}
