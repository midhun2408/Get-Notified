import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TabsComponent } from './tabs/tabs.component';
import { HomeComponent } from './home/home.component';
import { TelegramComponent } from './telegram/telegram.component';
import { TopicsComponent } from './topics/topics.component';
import { NewsDetailComponent } from './news-detail/news-detail.component';

const routes: Routes = [
  { path: '', redirectTo: 'tabs/news', pathMatch: 'full' },
  {
    path: 'tabs',
    component: TabsComponent,
    children: [
      { path: 'news', component: HomeComponent },
      { path: 'telegram', component: TelegramComponent },
      { path: '', redirectTo: 'news', pathMatch: 'full' }
    ]
  },
  { path: 'topics', component: TopicsComponent },
  { path: 'news-detail/:id', component: NewsDetailComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

