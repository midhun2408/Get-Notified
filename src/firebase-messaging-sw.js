importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAiSws0O_xPPadO3sFKpcNntYgJGYAnx5A",
  authDomain: "get-notifiy.firebaseapp.com",
  projectId: "get-notifiy",
  storageBucket: "get-notifiy.firebasestorage.app",
  messagingSenderId: "1089010043254",
  appId: "1:1089010043254:web:694e41dffec64b453fd257"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/firebase-logo.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
