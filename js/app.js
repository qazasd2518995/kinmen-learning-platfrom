/**
 * 金門話教材 - 主程式進入點
 */

import { Slideshow } from './slideshow.js';
import { AudioPlayer } from './audio-player.js';
import { MatchingGame } from './matching-game.js';
import { TeacherMode } from './teacher-mode.js';

class App {
  constructor() {
    this.slideshow = null;
    this.audioPlayer = null;
    this.matchingGame = null;
    this.teacherMode = null;
    this.config = null;

    this.init();
  }

  async init() {
    try {
      // 載入配置
      await this.loadConfig();

      // 初始化各模組
      this.slideshow = new Slideshow(this.config);
      this.audioPlayer = new AudioPlayer();
      this.matchingGame = new MatchingGame();
      this.teacherMode = new TeacherMode();

      // 綁定事件
      this.bindEvents();

      // 載入第一張投影片
      await this.slideshow.loadSlide(0);

      // 隱藏載入動畫
      this.hideLoading();

      console.log('金門話教材已載入完成');
    } catch (error) {
      console.error('初始化失敗:', error);
      this.showError('載入失敗，請重新整理頁面');
    }
  }

  async loadConfig() {
    try {
      const response = await fetch('data/slides-config.json');
      this.config = await response.json();
    } catch (error) {
      console.warn('無法載入配置檔，使用預設設定');
      this.config = this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    // 產生 55 張投影片的預設配置
    const slides = [];
    for (let i = 1; i <= 55; i++) {
      const num = String(i).padStart(2, '0');
      slides.push({
        id: i,
        image: `slides/slide-${num}.png`,
        type: this.getSlideType(i),
        vocabulary: [],
        section: this.getSlideSection(i)
      });
    }

    return {
      title: '金門話教材：去巴剎買菜',
      totalSlides: 55,
      slides: slides,
      sections: [
        { id: 'intro', name: '認識蔬果', startSlide: 1, endSlide: 18 },
        { id: 'activity1', name: '學習單', startSlide: 19, endSlide: 24 },
        { id: 'dialogue', name: '市場日常用語', startSlide: 25, endSlide: 36 },
        { id: 'maze', name: '迷宮遊戲', startSlide: 37, endSlide: 38 },
        { id: 'activity2', name: '水果賓果', startSlide: 39, endSlide: 42 },
        { id: 'simulation', name: '模擬市場', startSlide: 43, endSlide: 54 },
        { id: 'review', name: '回顧與反思', startSlide: 55, endSlide: 55 }
      ]
    };
  }

  getSlideType(slideNum) {
    if (slideNum === 1) return 'cover';
    if (slideNum >= 2 && slideNum <= 18) return 'vocabulary';
    if (slideNum === 19) return 'matching';
    if (slideNum === 20) return 'sorting';
    if (slideNum >= 21 && slideNum <= 24) return 'instruction';
    if (slideNum >= 25 && slideNum <= 36) return 'dialogue';
    if (slideNum >= 37 && slideNum <= 38) return 'maze';
    if (slideNum >= 39 && slideNum <= 42) return 'bingo';
    if (slideNum >= 43 && slideNum <= 54) return 'simulation';
    return 'content';
  }

  getSlideSection(slideNum) {
    if (slideNum <= 18) return 'intro';
    if (slideNum <= 24) return 'activity1';
    if (slideNum <= 36) return 'dialogue';
    if (slideNum <= 38) return 'maze';
    if (slideNum <= 42) return 'activity2';
    if (slideNum <= 54) return 'simulation';
    return 'review';
  }

  bindEvents() {
    // 導航按鈕
    document.getElementById('btn-prev').addEventListener('click', () => this.slideshow.prevSlide());
    document.getElementById('btn-next').addEventListener('click', () => this.slideshow.nextSlide());
    document.getElementById('btn-prev-area')?.addEventListener('click', () => this.slideshow.prevSlide());
    document.getElementById('btn-next-area')?.addEventListener('click', () => this.slideshow.nextSlide());

    // 鍵盤導航
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));

    // 目錄
    document.getElementById('btn-toc').addEventListener('click', () => this.toggleSidebar());
    document.getElementById('btn-close-toc').addEventListener('click', () => this.closeSidebar());
    document.getElementById('sidebar-overlay').addEventListener('click', () => this.closeSidebar());

    // 全螢幕
    document.getElementById('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());

    // 老師模式
    document.getElementById('btn-teacher-mode').addEventListener('click', () => this.teacherMode.toggle());

    // 觸控手勢
    this.setupTouchGestures();

    // 圖片載入事件
    document.getElementById('slide-image').addEventListener('load', () => {
      document.getElementById('slide-image').classList.add('loaded');
    });

    // 建立目錄
    this.buildTOC();
  }

  handleKeyboard(e) {
    // 避免在輸入框中觸發
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        this.slideshow.prevSlide();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
        e.preventDefault();
        this.slideshow.nextSlide();
        break;
      case 'Escape':
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
        this.closeSidebar();
        break;
      case 'Home':
        e.preventDefault();
        this.slideshow.goToSlide(0);
        break;
      case 'End':
        e.preventDefault();
        this.slideshow.goToSlide(this.config.totalSlides - 1);
        break;
    }
  }

  setupTouchGestures() {
    const slideContainer = document.querySelector('.slide-container');
    let touchStartX = 0;
    let touchEndX = 0;

    slideContainer.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    slideContainer.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      this.handleSwipe();
    }, { passive: true });

    const handleSwipe = () => {
      const swipeThreshold = 50;
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
          this.slideshow.nextSlide();
        } else {
          this.slideshow.prevSlide();
        }
      }
    };

    this.handleSwipe = handleSwipe;
  }

  toggleSidebar() {
    const sidebar = document.getElementById('toc-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isOpen = sidebar.classList.contains('open');

    if (isOpen) {
      this.closeSidebar();
    } else {
      sidebar.classList.add('open');
      overlay.classList.add('visible');
    }
  }

  closeSidebar() {
    const sidebar = document.getElementById('toc-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  }

  buildTOC() {
    const tocList = document.getElementById('toc-list');
    tocList.innerHTML = '';

    this.config.sections.forEach(section => {
      const sectionEl = document.createElement('li');
      sectionEl.className = 'toc-section';
      sectionEl.innerHTML = `
        <button class="toc-section-header">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span>${section.name} (${section.startSlide}-${section.endSlide})</span>
        </button>
        <ul class="toc-items"></ul>
      `;

      const itemsContainer = sectionEl.querySelector('.toc-items');

      for (let i = section.startSlide; i <= section.endSlide; i++) {
        const item = document.createElement('li');
        item.className = 'toc-item';
        item.textContent = `第 ${i} 頁`;
        item.dataset.slideIndex = i - 1;
        item.addEventListener('click', () => {
          this.slideshow.goToSlide(i - 1);
          this.closeSidebar();
        });
        itemsContainer.appendChild(item);
      }

      // 展開/收合
      const header = sectionEl.querySelector('.toc-section-header');
      header.addEventListener('click', () => {
        sectionEl.classList.toggle('open');
      });

      tocList.appendChild(sectionEl);
    });

    // 預設展開第一個
    tocList.querySelector('.toc-section')?.classList.add('open');
  }

  async toggleFullscreen() {
    const btn = document.getElementById('btn-fullscreen');
    const iconExpand = btn.querySelector('.icon-expand');
    const iconCompress = btn.querySelector('.icon-compress');

    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        document.body.classList.add('fullscreen-mode');
        iconExpand.classList.add('hidden');
        iconCompress.classList.remove('hidden');
      } catch (err) {
        console.error('無法進入全螢幕:', err);
      }
    } else {
      await document.exitFullscreen();
      document.body.classList.remove('fullscreen-mode');
      iconExpand.classList.remove('hidden');
      iconCompress.classList.add('hidden');
    }
  }

  hideLoading() {
    const loading = document.getElementById('loading-indicator');
    loading.classList.remove('visible');
  }

  showLoading() {
    const loading = document.getElementById('loading-indicator');
    loading.classList.add('visible');
  }

  showError(message) {
    const toast = document.createElement('div');
    toast.className = 'progress-toast error';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// 啟動應用程式
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
