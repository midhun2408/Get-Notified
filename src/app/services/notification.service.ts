import { Injectable } from '@angular/core';
import { Firestore, collection, doc, setDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private currentToken = new BehaviorSubject<string | null>(null);

  constructor(private firestore: Firestore, private functions: Functions) { 
    if (Capacitor.getPlatform() !== 'web') {
      this.initPush();
    }
  }

  async initPush() {
    // Request permission to use push notifications
    // iOS will prompt user and return execution after they confirm or deny
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      throw new Error('User denied permissions!');
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

    const subscribeToTopic = httpsCallable(this.functions, 'subscribeToTopic');
    try {
      const result: any = await subscribeToTopic({ token, topic });
      console.log('Subscription result:', result.data);
    } catch (error) {
      console.error('Subscription failed:', error);
    }
  }

  async unsubscribe(topic: string) {
    const token = this.currentToken.value;
    if (!token) return;

    const unsubscribeToTopic = httpsCallable(this.functions, 'unsubscribeToTopic');
    try {
      const result: any = await unsubscribeToTopic({ token, topic });
      console.log('Unsubscription result:', result.data);
    } catch (error) {
      console.error('Unsubscription failed:', error);
    }
  }
}
