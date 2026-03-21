import { Injectable, NgZone } from '@angular/core';
import { Firestore, collection, doc, setDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private currentToken = new BehaviorSubject<string | null>(null);

  constructor(
    private firestore: Firestore, 
    private functions: Functions,
    private router: Router,
    private zone: NgZone
  ) { 
    if (Capacitor.getPlatform() !== 'web') {
      this.initPush();
    }
  }

  async initPush() {
    try {
      // Request permission to use push notifications
      // iOS will prompt user and return execution after they confirm or deny
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('User denied permissions or permissions not available!');
        return; // Don't throw to avoid blocking execution
      }

      await PushNotifications.register();

      PushNotifications.addListener('registration', (token: Token) => {
        console.log('FCM Token Generated:', token.value);
        this.currentToken.next(token.value);
        this.saveToken(token.value);
      });

      PushNotifications.addListener('registrationError', (err: any) => {
        console.error('Registration error: ', err.error);
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push received: ', notification);
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('Push action performed: ', action);
        const data = action.notification.data;
        if (data && data.id) {
          console.log('Navigating to news-detail with ID:', data.id);
          this.zone.run(() => {
            this.router.navigate(['/news-detail', data.id]);
          });
        }
      });
    } catch (err) {
      console.error('Push notification initialization failed:', err);
    }
  }

  requestPermission() {
    // Legacy support for web if needed, but primarily initPush handles mobile
    if (Capacitor.getPlatform() === 'web') {
      console.log('Web messaging might need @angular/fire setup if still used');
    }
  }

  listenForMessages() {
    // Handled by initPush listeners
  }

  private async saveToken(token: string) {
    const tokensRef = collection(this.firestore, 'fcmTokens');
    const tokenDoc = doc(tokensRef, token);
    await setDoc(tokenDoc, { token, createdAt: new Date(), platform: Capacitor.getPlatform() });
  }

  async subscribe(topic: string) {
    const token = this.currentToken.value;
    if (!token) {
      console.error('No FCM token available for subscription');
      return;
    }

    try {
      const response = await fetch('https://worker.get-notified-api.workers.dev/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, topic })
      });
      const result = await response.json();
      console.log('Subscription result:', result);
    } catch (error) {
      console.error('Subscription failed:', error);
    }
  }

  async unsubscribe(topic: string) {
    const token = this.currentToken.value;
    if (!token) return;

    try {
      const response = await fetch('https://worker.get-notified-api.workers.dev/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, topic })
      });
      const result = await response.json();
      console.log('Unsubscription result:', result);
    } catch (error) {
      console.error('Unsubscription failed:', error);
    }
  }
}
