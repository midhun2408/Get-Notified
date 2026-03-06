import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { IonicModule } from '@ionic/angular';
import { HomeComponent } from './home/home.component';
import { TopicsComponent } from './topics/topics.component';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideMessaging, getMessaging } from '@angular/fire/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyAiSws0O_xPPadO3sFKpcNntYgJGYAnx5A",
  authDomain: "get-notifiy.firebaseapp.com",
  projectId: "get-notifiy",
  storageBucket: "get-notifiy.firebasestorage.app",
  messagingSenderId: "1089010043254",
  appId: "1:1089010043254:web:694e41dffec64b453fd257",
  measurementId: "G-EVGFZDF7ZE"
};
@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    TopicsComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    CommonModule,
    IonicModule.forRoot({}),
  ],
  providers: [
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideMessaging(() => getMessaging())
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
