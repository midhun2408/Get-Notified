import { Component, OnInit } from '@angular/core';
import { ThemeService } from '../services/theme.service';
import { TelegramService, TelegramChannel, TelegramKeyword } from '../services/telegram.service';

@Component({
  selector: 'app-telegram',
  templateUrl: './telegram.component.html',
})
export class TelegramComponent implements OnInit {
  channels: TelegramChannel[] = [];
  keywords: TelegramKeyword[] = [];
  newChannel: string = '';
  newKeyword: string = '';
  addingChannel = false;
  addingKeyword = false;

  constructor(
    public themeService: ThemeService,
    private telegramService: TelegramService
  ) {}

  ngOnInit() {
    this.telegramService.getChannels().subscribe(c => this.channels = c);
    this.telegramService.getKeywords().subscribe(k => this.keywords = k);
  }

  async addChannel() {
    if (!this.newChannel.trim()) return;
    this.addingChannel = true;
    await this.telegramService.addChannel(this.newChannel.trim());
    this.newChannel = '';
    this.addingChannel = false;
  }

  async removeChannel(id: string) {
    await this.telegramService.removeChannel(id);
  }

  async addKeyword() {
    if (!this.newKeyword.trim()) return;
    this.addingKeyword = true;
    await this.telegramService.addKeyword(this.newKeyword.trim());
    this.newKeyword = '';
    this.addingKeyword = false;
  }

  async removeKeyword(id: string) {
    await this.telegramService.removeKeyword(id);
  }
}
