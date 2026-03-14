import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  addDoc,
  deleteDoc,
  doc
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface TelegramChannel {
  id: string;
  username: string;  // e.g. "@mychannel"
  title: string;
  lastMessageId: number;
}

export interface TelegramKeyword {
  id: string;
  keyword: string;
}

@Injectable({ providedIn: 'root' })
export class TelegramService {

  constructor(private firestore: Firestore) {}

  // ── Channels ──────────────────────────────────────────────────────────────

  getChannels(): Observable<TelegramChannel[]> {
    const ref = collection(this.firestore, 'telegramChannels');
    return collectionData(ref, { idField: 'id' }) as Observable<TelegramChannel[]>;
  }

  async addChannel(username: string): Promise<void> {
    // Normalise: ensure leading @
    const clean = username.trim().startsWith('@')
      ? username.trim()
      : '@' + username.trim();

    const ref = collection(this.firestore, 'telegramChannels');
    await addDoc(ref, {
      username: clean,
      title: clean,
      lastMessageId: 0
    });
  }

  async removeChannel(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'telegramChannels', id));
  }

  // ── Keywords ──────────────────────────────────────────────────────────────

  getKeywords(): Observable<TelegramKeyword[]> {
    const ref = collection(this.firestore, 'telegramKeywords');
    return collectionData(ref, { idField: 'id' }) as Observable<TelegramKeyword[]>;
  }

  async addKeyword(keyword: string): Promise<void> {
    const ref = collection(this.firestore, 'telegramKeywords');
    await addDoc(ref, { keyword: keyword.trim().toLowerCase() });
  }

  async removeKeyword(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'telegramKeywords', id));
  }
}
