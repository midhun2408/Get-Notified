import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NewsService, NewsItem } from '../services/news.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent  implements OnInit {
  news: NewsItem[] = [];
  topics: {id: string, name: string, status?: string}[] = [];
  isLoading: boolean = true;
  private isInitialLoad: boolean = true;
  selectedTopics: Set<string> = new Set();

  constructor(
    private newsService: NewsService, 
    private router: Router,
    public themeService: ThemeService
  ) { }

  ngOnInit() {
    this.setupTopicSubscription();
  }

  ionViewWillEnter() {
    this.isLoading = true;
    this.isInitialLoad = true;
    console.log('[Home] Entering page, forcing initial refresh...');
    // Always trigger a refresh on enter to clear the loader set in ionViewWillEnter
    // and to ensure we have the latest news even if topics haven't changed.
    this.checkSyncAndRefresh();
  }

  private setupTopicSubscription() {
    this.newsService.getTopics().subscribe(topics => {
      const oldTopicCount = this.topics.length;
      const oldTopicNames = new Set(this.topics.map(t => t.name));
      this.topics = topics;
      
      const currentTopicNames = new Set(this.topics.map(t => t.name));
      // Cleanup deletion: remove selected topics that no longer exist in Firestore
      this.selectedTopics.forEach(name => {
        if (!currentTopicNames.has(name)) {
          this.selectedTopics.delete(name);
          console.log(`[Home] Deletion detected. Removed topic from selection: ${name}`);
        }
      });

      let hasNewTopicForced = false;
      this.topics.forEach(t => {
        // If it's a brand new topic we haven't seen in this component instance, auto-select it
        if (oldTopicCount > 0 && !oldTopicNames.has(t.name)) {
          this.selectedTopics.add(t.name);
          hasNewTopicForced = true;
          console.log(`[Home] Addition detected. New topic ${t.name} auto-selected.`);
        }
        // Fallback for first launch
        if (this.selectedTopics.size === 0) {
          this.selectedTopics.add(t.name);
        }
      });

      this.checkSyncAndRefresh(hasNewTopicForced);
    });
  }

  private anyPendingSync(): boolean {
    return this.topics.some(t => this.selectedTopics.has(t.name) && t.status === 'pending');
  }

  private checkSyncAndRefresh(forceLoader: boolean = false) {
    const isSyncing = this.anyPendingSync();
    console.log(`[Home] CheckSync: isSyncing=${isSyncing}, forceLoader=${forceLoader}, isInitialLoad=${this.isInitialLoad}`);
    
    // We show the loader if we specifically requested it, if we're in "initial" mode, or if a sync is actually pending
    if (this.isInitialLoad || forceLoader || isSyncing) {
      this.refreshNews(true);
    } else {
      this.refreshNews(false);
    }
  }

  toggleTopic(topicName: string) {
    if (this.selectedTopics.has(topicName)) {
      this.selectedTopics.delete(topicName);
    } else {
      this.selectedTopics.add(topicName);
    }
    this.refreshNews(false); // Never show loader on chip toggle
  }

  refreshNews(showLoader: boolean = false) {
    const isSyncing = this.anyPendingSync();
    this.isLoading = showLoader || isSyncing;
    
    const startTime = Date.now();
    const selectedArray = Array.from(this.selectedTopics);
    
    console.log(`[Home] Refreshing news for ${selectedArray.length} topics. Loader=${this.isLoading}`);

    if (selectedArray.length === 0) {
      this.news = [];
      this.isLoading = isSyncing;
      this.isInitialLoad = false;
      return;
    }

    this.newsService.getNewsForTopics(selectedArray).subscribe({
      next: (news) => {
        this.news = news;
        
        // RE-CHECK: If any topic is STILL syncing, we MUST keep the loader visible.
        // The loader will eventually hide when the getTopics subscription emits a 'ready' status.
        if (this.anyPendingSync()) {
          console.log('[Home] Data fetched, but sync still pending on backend. Keeping loader up.');
          this.isLoading = true;
          return;
        }

        if (showLoader) {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, 800 - elapsed);
          setTimeout(() => {
            console.log('[Home] Sync complete, hiding loader.');
            this.isLoading = false;
            this.isInitialLoad = false;
          }, remaining);
        } else {
          this.isLoading = false;
          this.isInitialLoad = false;
        }
      },
      error: (err) => {
        console.error('[Home] Error fetching news:', err);
        this.isLoading = false;
        this.isInitialLoad = false;
      }
    });
  }

  goToTopics() {
    this.router.navigate(['/topics']);
  }

  goToDetail(id: string) {
    this.router.navigate(['/news-detail', id]);
  }
}
