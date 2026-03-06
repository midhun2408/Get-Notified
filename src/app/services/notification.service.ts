import { Injectable } from '@angular/core';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { Firestore, collection, doc, setDoc } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  constructor(private messaging: Messaging, private firestore: Firestore) { }

  requestPermission() {
    // NOTE: You must replace 'YOUR_VAPID_KEY_HERE' with the key from Firebase Console
    // Project Settings > Cloud Messaging > Web Push certificates
    getToken(this.messaging, { vapidKey: 'BCs0JNl_WiLD8kJ-QpJw-X7WZn0hk3bkSIS9mRMAPeemUkkIltF7ntYP-ESMmAAWGD6O-bd0q91ASsjv0pYTN_w' })
      .then((token) => {
        if (token) {
          console.log('FCM Token Generated:', token);
          this.saveToken(token);
        } else {
          console.log('No registration token available. Request permission to generate one.');
        }
      }).catch((err) => {
        console.log('An error occurred while retrieving token. ', err);
      });
  }

  listenForMessages() {
    onMessage(this.messaging, (payload) => {
      console.log('Message received. ', payload);
      // Extra UI logic for foreground messages can go here
    });
  }

  private async saveToken(token: string) {
    const tokensRef = collection(this.firestore, 'fcmTokens');
    const tokenDoc = doc(tokensRef, token);
    await setDoc(tokenDoc, { token, createdAt: new Date() });
  }
}
