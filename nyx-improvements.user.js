// ==UserScript==
// @name         Nyx.cz Improvements
// @namespace    https://github.com/vojtaflorian/nyx-improvements
// @version      1.2.6
// @description  Enhanced UI for nyx.cz forum - keyboard navigation, quick jump, hide read discussions
// @description:cs Vylepšené UI pro nyx.cz fórum - klávesová navigace, quick jump, skrytí přečtených
// @author       Vojta Florian
// @homepage     https://github.com/vojtaflorian/nyx-improvements
// @supportURL   https://github.com/vojtaflorian/nyx-improvements/issues
// @updateURL    https://raw.githubusercontent.com/vojtaflorian/nyx-improvements/main/nyx-improvements.user.js
// @downloadURL  https://raw.githubusercontent.com/vojtaflorian/nyx-improvements/main/nyx-improvements.user.js
// @match        https://nyx.cz/*
// @match        https://www.nyx.cz/*
// @exclude      https://nyx.cz/api/*
// @exclude      https://www.nyx.cz/api/*
// @icon         https://nyx.cz/images/favicon.svg
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @require      https://raw.githubusercontent.com/vojtaflorian/tampermonkey-global-logger/main/tampermonkey-global-logger.user.js?v=@version
// @noframes
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(async function () {
  "use strict";

  // =========================================================================
  // CSS VARIABLES & BASE STYLES
  // =========================================================================
  const BASE_STYLES = `
        :root {
            --nyx-color-primary: #4a9eff;
            --nyx-color-success: #4caf50;
            --nyx-color-warning: #ff9800;
            --nyx-color-error: #f44336;
            --nyx-color-bg-overlay: rgba(0, 0, 0, 0.8);
            --nyx-color-bg-card: rgba(30, 30, 30, 0.95);
            --nyx-color-text: #e0e0e0;
            --nyx-color-text-muted: #888;
            --nyx-shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.2);
            --nyx-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
            --nyx-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
            --nyx-radius-sm: 4px;
            --nyx-radius-md: 8px;
            --nyx-radius-lg: 12px;
            --nyx-transition-fast: 0.15s ease;
            --nyx-transition-normal: 0.25s ease;
            --nyx-z-dropdown: 100;
            --nyx-z-sticky: 200;
            --nyx-z-modal: 1000;
            --nyx-z-toast: 1100;
        }

        @keyframes nyx-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes nyx-slide-down {
            from { transform: translateY(-100%); }
            to { transform: translateY(0); }
        }

        @keyframes nyx-slide-up {
            from { transform: translateY(10px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;

  // =========================================================================
  // CORE: STORAGE WRAPPER
  // =========================================================================
  class Storage {
    constructor(prefix = "nyx_improvements_") {
      this.prefix = prefix;
    }

    get(key, defaultValue = null) {
      try {
        const value = GM_getValue(this.prefix + key);
        return value !== undefined ? value : defaultValue;
      } catch {
        return defaultValue;
      }
    }

    set(key, value) {
      GM_setValue(this.prefix + key, value);
    }

    remove(key) {
      GM_deleteValue(this.prefix + key);
    }

    getBool(key, defaultValue = false) {
      return Boolean(this.get(key, defaultValue));
    }
  }

  // =========================================================================
  // CORE: EVENT BUS
  // =========================================================================
  class EventBus {
    constructor() {
      this.listeners = new Map();
    }

    on(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event).add(callback);
      return () => this.off(event, callback);
    }

    off(event, callback) {
      this.listeners.get(event)?.delete(callback);
    }

    emit(event, data) {
      this.listeners.get(event)?.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`EventBus error in ${event}:`, e);
        }
      });
    }
  }

  // =========================================================================
  // CORE: BASE MODULE
  // =========================================================================
  class BaseModule {
    constructor() {
      this.logger = null;
      this.eventBus = null;
      this.storage = null;
      this.isActive = false;
      this.cleanupFns = [];
    }

    setDependencies(logger, eventBus, storage) {
      this.logger = logger;
      this.eventBus = eventBus;
      this.storage = storage;
    }

    shouldActivate() {
      return true;
    }

    async init() {
      this.isActive = true;
    }

    destroy() {
      this.cleanupFns.forEach((fn) => fn());
      this.cleanupFns = [];
      this.isActive = false;
    }

    onCleanup(fn) {
      this.cleanupFns.push(fn);
    }

    addListener(element, event, handler, options) {
      element.addEventListener(event, handler, options);
      this.onCleanup(() =>
        element.removeEventListener(event, handler, options),
      );
    }
  }

  // =========================================================================
  // CORE: MODULE MANAGER
  // =========================================================================
  class ModuleManager {
    constructor(logger, eventBus, storage) {
      this.logger = logger;
      this.eventBus = eventBus;
      this.storage = storage;
      this.modules = new Map();
      this.activeModules = new Set();
    }

    register(name, module) {
      module.setDependencies(this.logger, this.eventBus, this.storage);
      this.modules.set(name, module);
    }

    async initForPage(pathname) {
      const pageType = this.detectPageType(pathname);
      const modulesForPage = this.getModulesForPage(pageType);

      this.logger.debug(
        `Page type: ${pageType}, modules: ${modulesForPage.join(", ")}`,
      );

      for (const name of modulesForPage) {
        const module = this.modules.get(name);
        if (module && module.shouldActivate()) {
          try {
            await module.init();
            this.activeModules.add(name);
            this.logger.debug(`Module ${name} activated`);
          } catch (e) {
            this.logger.error(`Module ${name} failed to init`, e);
          }
        }
      }
    }

    detectPageType(pathname) {
      if (pathname === "/" || pathname === "") return "home";
      if (pathname.startsWith("/bookmarks")) return "bookmarks";
      if (pathname.startsWith("/discussion/")) return "discussion";
      if (pathname.startsWith("/topics")) return "topics";
      if (pathname.startsWith("/mail")) return "mail";
      if (pathname.startsWith("/events")) return "events";
      if (pathname.startsWith("/market")) return "market";
      return "other";
    }

    getModulesForPage(pageType) {
      const pageModules = {
        home: ["keyboardNav", "quickJump"],
        bookmarks: ["keyboardNav", "quickJump", "hideRead"],
        discussion: [
          "keyboardNav",
          "quickJump",
          "highlightNew",
          "reverseScroll",
        ],
        topics: ["keyboardNav", "quickJump"],
        mail: ["keyboardNav", "quickJump"],
        events: ["keyboardNav", "quickJump"],
        market: ["keyboardNav", "quickJump"],
        other: ["keyboardNav", "quickJump"],
      };
      return pageModules[pageType] || pageModules.other;
    }

    destroy() {
      for (const name of this.activeModules) {
        this.modules.get(name)?.destroy();
      }
      this.activeModules.clear();
    }
  }

  // =========================================================================
  // UTILS
  // =========================================================================
  function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // =========================================================================
  // MODULE: KEYBOARD NAVIGATION
  // =========================================================================
  class KeyboardNavModule extends BaseModule {
    constructor() {
      super();
      this.posts = [];
      this.currentIndex = -1;
      this.pendingKey = null;
      this.pendingTimeout = null;
      this.hintEl = null;
    }

    async init() {
      await super.init();

      this.refreshPosts();
      this.injectStyles();

      this.addListener(document, "keydown", this.handleKeydown.bind(this));

      // Refresh posts on DOM changes (for infinite scroll, etc.)
      const observer = new MutationObserver(
        debounce(() => this.refreshPosts(), 500),
      );
      observer.observe(document.body, { childList: true, subtree: true });
      this.onCleanup(() => observer.disconnect());

      this.logger.debug("KeyboardNav initialized", {
        postCount: this.posts.length,
      });
    }

    refreshPosts() {
      // Multiple selectors for different page types
      this.posts = Array.from(
        document.querySelectorAll(
          ".contribution, .post, article.post, .b-list > li:not(.section)",
        ),
      );
    }

    injectStyles() {
      GM_addStyle(`
                .nyx-post-focused {
                    outline: 2px solid var(--nyx-color-primary) !important;
                    outline-offset: 2px;
                    scroll-margin-top: 60px;
                }

                .nyx-kbd-hint {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: var(--nyx-color-bg-card);
                    color: var(--nyx-color-text);
                    padding: 10px 16px;
                    border-radius: var(--nyx-radius-md);
                    font-family: monospace;
                    font-size: 14px;
                    z-index: var(--nyx-z-toast);
                    opacity: 0;
                    transform: translateY(10px);
                    transition: opacity var(--nyx-transition-fast), transform var(--nyx-transition-fast);
                    pointer-events: none;
                    box-shadow: var(--nyx-shadow-md);
                }

                .nyx-kbd-hint.visible {
                    opacity: 1;
                    transform: translateY(0);
                }

                .nyx-kbd-hint kbd {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 2px 6px;
                    border-radius: var(--nyx-radius-sm);
                    margin: 0 2px;
                }
            `);
    }

    handleKeydown(e) {
      // Ignore if in input
      if (this.isInInput(e.target)) return;

      const key = e.key.toLowerCase();

      // Handle combo keys (g+X)
      if (this.pendingKey === "g") {
        clearTimeout(this.pendingTimeout);
        this.pendingKey = null;
        this.hideHint();

        const gotoMap = {
          h: "/",
          t: "/topics",
          b: "/bookmarks",
          m: "/mail",
          e: "/events",
          a: "/market",
        };

        if (gotoMap[key]) {
          window.location.href = gotoMap[key];
          e.preventDefault();
        }
        return;
      }

      // Single keys
      switch (key) {
        case "j":
          this.navigatePost(1);
          e.preventDefault();
          break;

        case "k":
          this.navigatePost(-1);
          e.preventDefault();
          break;

        case "g":
          this.pendingKey = "g";
          this.showHint(
            "<kbd>g</kbd> + <kbd>h</kbd>ome <kbd>t</kbd>émata <kbd>b</kbd>ookmarks <kbd>m</kbd>ail",
          );
          this.pendingTimeout = setTimeout(() => {
            this.pendingKey = null;
            this.hideHint();
          }, 2000);
          e.preventDefault();
          break;

        case "o":
        case "enter":
          this.openCurrentPost();
          break;

        case "/":
          if (!e.ctrlKey && !e.metaKey) {
            this.eventBus.emit("quickjump:open");
            e.preventDefault();
          }
          break;

        case "escape":
          this.clearFocus();
          break;

        case "x":
          // Toggle hide read discussions
          this.eventBus.emit("hideRead:toggle");
          e.preventDefault();
          break;
      }

      // Ctrl+K / Cmd+K for Quick Jump
      if ((e.ctrlKey || e.metaKey) && key === "k") {
        this.eventBus.emit("quickjump:open");
        e.preventDefault();
      }
    }

    navigatePost(direction) {
      if (this.posts.length === 0) {
        this.refreshPosts();
        if (this.posts.length === 0) return;
      }

      // Remove previous focus
      if (this.currentIndex >= 0 && this.posts[this.currentIndex]) {
        this.posts[this.currentIndex].classList.remove("nyx-post-focused");
      }

      // Calculate new index
      this.currentIndex = Math.max(
        0,
        Math.min(this.posts.length - 1, this.currentIndex + direction),
      );

      // Apply focus
      const post = this.posts[this.currentIndex];
      if (post) {
        post.classList.add("nyx-post-focused");
        post.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    openCurrentPost() {
      if (this.currentIndex >= 0 && this.posts[this.currentIndex]) {
        const link = this.posts[this.currentIndex].querySelector("a");
        if (link) {
          link.click();
        }
      }
    }

    clearFocus() {
      if (this.currentIndex >= 0 && this.posts[this.currentIndex]) {
        this.posts[this.currentIndex].classList.remove("nyx-post-focused");
      }
      this.currentIndex = -1;
    }

    isInInput(element) {
      const tag = element.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || element.isContentEditable;
    }

    showHint(html) {
      if (!this.hintEl) {
        this.hintEl = document.createElement("div");
        this.hintEl.className = "nyx-kbd-hint";
        document.body.appendChild(this.hintEl);
      }
      this.hintEl.innerHTML = html;
      this.hintEl.classList.add("visible");
    }

    hideHint() {
      this.hintEl?.classList.remove("visible");
    }

    destroy() {
      this.clearFocus();
      this.hintEl?.remove();
      super.destroy();
    }
  }

  // =========================================================================
  // MODULE: QUICK JUMP (Command Palette)
  // =========================================================================
  class QuickJumpModule extends BaseModule {
    constructor() {
      super();
      this.modal = null;
      this.input = null;
      this.results = null;
      this.items = [];
      this.filteredItems = [];
      this.selectedIndex = 0;
      this.isOpen = false;
    }

    async init() {
      await super.init();

      this.buildItems();
      this.createModal();
      this.injectStyles();

      this.eventBus.on("quickjump:open", () => this.open());
      this.eventBus.on("action:toggleHideRead", () => {
        this.eventBus.emit("hideRead:toggle");
        this.close();
      });

      this.logger.debug("QuickJump initialized");
    }

    buildItems() {
      this.items = [
        {
          type: "nav",
          icon: "🏠",
          label: "Úvod",
          url: "/",
          keywords: "home uvod domov",
        },
        {
          type: "nav",
          icon: "📁",
          label: "Témata",
          url: "/topics",
          keywords: "temata topics kategorie",
        },
        {
          type: "nav",
          icon: "⭐",
          label: "Sledované",
          url: "/bookmarks",
          keywords: "sledovane bookmarks oblibene",
        },
        {
          type: "nav",
          icon: "📧",
          label: "Pošta",
          url: "/mail",
          keywords: "posta mail zpravy",
        },
        {
          type: "nav",
          icon: "📅",
          label: "Události",
          url: "/events",
          keywords: "udalosti events kalendar",
        },
        {
          type: "nav",
          icon: "🛒",
          label: "Tržiště",
          url: "/market",
          keywords: "trziste market bazar",
        },
        {
          type: "nav",
          icon: "📜",
          label: "Historie",
          url: "/bookmarks/history",
          keywords: "historie history",
        },
        {
          type: "action",
          icon: "👁️",
          label: "Skrýt/Zobrazit přečtené",
          action: "toggleHideRead",
          keywords: "skryt hide read prectene",
        },
      ];

      // Add bookmarked discussions from DOM if on bookmarks page
      const bookmarkItems = document.querySelectorAll(
        ".b-list li:not(.section) a.title",
      );
      bookmarkItems.forEach((a) => {
        const text = a.textContent.trim();
        if (text) {
          this.items.push({
            type: "discussion",
            icon: "💬",
            label: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
            url: a.href,
            keywords: text.toLowerCase(),
          });
        }
      });
    }

    createModal() {
      this.modal = document.createElement("div");
      this.modal.className = "nyx-quickjump";
      this.modal.innerHTML = `
                <div class="nyx-quickjump-overlay"></div>
                <div class="nyx-quickjump-content">
                    <input type="text"
                           class="nyx-quickjump-input"
                           placeholder="Kam chcete jít? (hledat...)">
                    <ul class="nyx-quickjump-results"></ul>
                    <div class="nyx-quickjump-footer">
                        <span><kbd>↑↓</kbd> navigace</span>
                        <span><kbd>Enter</kbd> otevřít</span>
                        <span><kbd>Esc</kbd> zavřít</span>
                    </div>
                </div>
            `;

      this.input = this.modal.querySelector(".nyx-quickjump-input");
      this.results = this.modal.querySelector(".nyx-quickjump-results");

      // Event listeners
      this.modal
        .querySelector(".nyx-quickjump-overlay")
        .addEventListener("click", () => this.close());

      this.input.addEventListener("input", () => this.filter());
      this.input.addEventListener("keydown", (e) => this.handleKey(e));

      document.body.appendChild(this.modal);
    }

    filter() {
      const query = this.input.value.toLowerCase().trim();

      if (!query) {
        this.filteredItems = this.items.slice(0, 10);
      } else {
        this.filteredItems = this.items
          .filter(
            (item) =>
              item.label.toLowerCase().includes(query) ||
              (item.keywords && item.keywords.includes(query)),
          )
          .slice(0, 10);
      }

      this.selectedIndex = 0;
      this.renderResults();
    }

    renderResults() {
      if (this.filteredItems.length === 0) {
        this.results.innerHTML =
          '<li class="nyx-quickjump-empty">Nic nenalezeno</li>';
        return;
      }

      this.results.innerHTML = this.filteredItems
        .map(
          (item, i) => `
                <li class="nyx-quickjump-item ${i === this.selectedIndex ? "selected" : ""}"
                    data-index="${i}">
                    <span class="nyx-quickjump-icon">${item.icon}</span>
                    <span class="nyx-quickjump-label">${this.escapeHtml(item.label)}</span>
                    <span class="nyx-quickjump-type">${item.type}</span>
                </li>
            `,
        )
        .join("");

      // Click handlers
      this.results.querySelectorAll(".nyx-quickjump-item").forEach((li) => {
        li.addEventListener("click", () => {
          this.selectedIndex = parseInt(li.dataset.index, 10);
          this.execute();
        });
      });
    }

    escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }

    handleKey(e) {
      switch (e.key) {
        case "ArrowDown":
          this.selectedIndex = Math.min(
            this.selectedIndex + 1,
            this.filteredItems.length - 1,
          );
          this.updateSelection();
          e.preventDefault();
          break;

        case "ArrowUp":
          this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
          this.updateSelection();
          e.preventDefault();
          break;

        case "Enter":
          this.execute();
          e.preventDefault();
          break;

        case "Escape":
          this.close();
          e.preventDefault();
          break;
      }
    }

    updateSelection() {
      this.results.querySelectorAll(".nyx-quickjump-item").forEach((li, i) => {
        li.classList.toggle("selected", i === this.selectedIndex);
      });
      this.results.children[this.selectedIndex]?.scrollIntoView({
        block: "nearest",
      });
    }

    execute() {
      const item = this.filteredItems[this.selectedIndex];
      if (!item) return;

      if (item.url) {
        window.location.href = item.url;
      } else if (item.action) {
        this.eventBus.emit(`action:${item.action}`);
      }

      this.close();
    }

    open() {
      if (this.isOpen) return;

      this.buildItems(); // Refresh items
      this.modal.classList.add("open");
      this.input.value = "";
      this.selectedIndex = 0;
      this.filter();
      this.input.focus();
      this.isOpen = true;

      // Trap focus
      this.addListener(document, "keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
        }
      });
    }

    close() {
      this.modal.classList.remove("open");
      this.isOpen = false;
      this.eventBus.emit("quickjump:close");
    }

    injectStyles() {
      GM_addStyle(`
                .nyx-quickjump {
                    display: none;
                    position: fixed;
                    inset: 0;
                    z-index: var(--nyx-z-modal);
                }

                .nyx-quickjump.open {
                    display: block;
                }

                .nyx-quickjump-overlay {
                    position: absolute;
                    inset: 0;
                    background: var(--nyx-color-bg-overlay);
                    animation: nyx-fade-in 0.15s ease;
                }

                .nyx-quickjump-content {
                    position: absolute;
                    top: 15%;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 90%;
                    max-width: 520px;
                    background: var(--nyx-color-bg-card);
                    border-radius: var(--nyx-radius-lg);
                    box-shadow: var(--nyx-shadow-lg);
                    animation: nyx-slide-up 0.2s ease;
                    overflow: hidden;
                }

                .nyx-quickjump-input {
                    width: 100%;
                    padding: 16px 20px;
                    border: none;
                    background: transparent;
                    color: var(--nyx-color-text);
                    font-size: 16px;
                    outline: none;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    box-sizing: border-box;
                }

                .nyx-quickjump-input::placeholder {
                    color: var(--nyx-color-text-muted);
                }

                .nyx-quickjump-results {
                    list-style: none;
                    margin: 0;
                    padding: 8px 0;
                    max-height: 320px;
                    overflow-y: auto;
                }

                .nyx-quickjump-empty {
                    padding: 16px 20px;
                    color: var(--nyx-color-text-muted);
                    text-align: center;
                }

                .nyx-quickjump-item {
                    display: flex;
                    align-items: center;
                    padding: 10px 20px;
                    cursor: pointer;
                    transition: background var(--nyx-transition-fast);
                }

                .nyx-quickjump-item:hover,
                .nyx-quickjump-item.selected {
                    background: rgba(74, 158, 255, 0.15);
                }

                .nyx-quickjump-icon {
                    flex-shrink: 0;
                    margin-right: 12px;
                    font-size: 16px;
                    width: 24px;
                    text-align: center;
                }

                .nyx-quickjump-label {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: var(--nyx-color-text);
                }

                .nyx-quickjump-type {
                    flex-shrink: 0;
                    font-size: 11px;
                    padding: 2px 8px;
                    background: rgba(255, 255, 255, 0.08);
                    border-radius: var(--nyx-radius-sm);
                    color: var(--nyx-color-text-muted);
                    margin-left: 8px;
                }

                .nyx-quickjump-footer {
                    display: flex;
                    gap: 16px;
                    padding: 12px 20px;
                    font-size: 12px;
                    color: var(--nyx-color-text-muted);
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    background: rgba(0, 0, 0, 0.2);
                }

                .nyx-quickjump-footer kbd {
                    padding: 2px 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: var(--nyx-radius-sm);
                    font-family: inherit;
                    font-size: 11px;
                }

                /* Responsive */
                @media (max-width: 600px) {
                    .nyx-quickjump-content {
                        top: 10%;
                        width: 95%;
                    }

                    .nyx-quickjump-footer {
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                }
            `);
    }

    destroy() {
      this.modal?.remove();
      super.destroy();
    }
  }

  // =========================================================================
  // MODULE: HIDE READ DISCUSSIONS
  // =========================================================================
  class HideReadModule extends BaseModule {
    constructor() {
      super();
      this.isHidden = false;
      this.toggleBtn = null;
    }

    shouldActivate() {
      return window.location.pathname.startsWith("/bookmarks");
    }

    async init() {
      await super.init();

      this.isHidden = this.storage.getBool("hideReadDiscussions", false);

      this.createToggleButton();
      this.injectStyles();
      this.applyState();

      // Listen for toggle action from QuickJump
      this.eventBus.on("hideRead:toggle", () => this.toggle());

      this.logger.debug("HideRead initialized", { hidden: this.isHidden });
    }

    createToggleButton() {
      const toolbar = document.querySelector("menu.l2");
      if (!toolbar) {
        this.logger.warn("HideRead: menu.l2 not found");
        return;
      }

      this.toggleBtn = document.createElement("li");
      this.toggleBtn.className = "nyx-hide-read-toggle";
      this.toggleBtn.innerHTML = `
                <a href="#" title="Skrýt/zobrazit přečtené diskuze (bez nových příspěvků)">
                    <span class="nyx-toggle-text">přečtené</span>
                    <span class="nyx-toggle-count"></span>
                </a>
            `;

      this.toggleBtn.querySelector("a").addEventListener("click", (e) => {
        e.preventDefault();
        this.toggle();
      });

      toolbar.appendChild(this.toggleBtn);
    }

    injectStyles() {
      GM_addStyle(`
                .nyx-hide-read-toggle a {
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    border-radius: var(--nyx-radius-sm);
                    transition: background var(--nyx-transition-fast);
                }

                .nyx-hide-read-toggle a:hover {
                    background: rgba(255, 255, 255, 0.1);
                }

                .nyx-hide-read-active .nyx-hide-read-toggle a {
                    background: rgba(74, 158, 255, 0.2);
                    color: var(--nyx-color-primary);
                }

                .nyx-hide-read-active .nyx-toggle-icon::after {
                    content: '✓';
                    font-size: 10px;
                    margin-left: 2px;
                }

                .nyx-toggle-count {
                    font-size: 11px;
                    opacity: 0.7;
                }

                /* Hide read items */
                .nyx-hide-read-active .b-list > li:not(.new):not(.section):not(.nyx-hide-read-toggle) {
                    display: none !important;
                }

                /* Animation for showing items */
                .b-list > li {
                    transition: opacity 0.2s ease;
                }

                /* Responsive */
                @media (max-width: 600px) {
                    .nyx-toggle-text {
                        display: none;
                    }
                }
            `);
    }

    toggle() {
      this.isHidden = !this.isHidden;
      this.storage.set("hideReadDiscussions", this.isHidden);
      this.applyState();
      this.eventBus.emit("bookmarks:toggled", { hidden: this.isHidden });
    }

    applyState() {
      document.body.classList.toggle("nyx-hide-read-active", this.isHidden);
      this.updateCounter();
    }

    updateCounter() {
      const allItems = document.querySelectorAll(".b-list > li:not(.section)");
      const newItems = document.querySelectorAll(".b-list > li.new");
      const hiddenCount = allItems.length - newItems.length;

      const counter = this.toggleBtn?.querySelector(".nyx-toggle-count");
      if (counter) {
        counter.textContent = this.isHidden
          ? `(${hiddenCount} skryto)`
          : `(${hiddenCount})`;
      }
    }

    destroy() {
      this.toggleBtn?.remove();
      document.body.classList.remove("nyx-hide-read-active");
      super.destroy();
    }
  }

  // =========================================================================
  // MODULE: REVERSE INFINITE SCROLL (Load newer posts when scrolling up)
  // =========================================================================
  class ReverseScrollModule extends BaseModule {
    constructor() {
      super();
      this.isLoading = false;
      this.hasMorePosts = true;
      this.discussionId = null;
      this.postsContainer = null;
      this.loadingIndicator = null;
      this.scrollThreshold = 300;
      this.postSelector = ".w[data-id]";
    }

    shouldActivate() {
      return window.location.pathname.startsWith("/discussion/");
    }

    async init() {
      await super.init();

      // Extract discussion ID from URL
      const match = window.location.pathname.match(/\/discussion\/(\d+)/);
      if (!match) {
        this.logger.warn("ReverseScroll: Could not extract discussion ID");
        return;
      }
      this.discussionId = match[1];

      // Find posts container
      this.postsContainer = document.querySelector(".posts-container");
      if (!this.postsContainer) {
        this.logger.warn("ReverseScroll: .posts-container not found");
        return;
      }

      // Check if posts exist
      const posts = this.postsContainer.querySelectorAll(this.postSelector);
      if (posts.length === 0) {
        this.logger.warn("ReverseScroll: No posts found");
        return;
      }

      this.logger.info("ReverseScroll: Initialized", {
        discussionId: this.discussionId,
        postsCount: posts.length,
        firstPostId: posts[0]?.dataset?.id,
        lastPostId: posts[posts.length - 1]?.dataset?.id,
      });

      this.createLoadingIndicator();
      this.injectStyles();

      // Scroll handler
      const scrollHandler = debounce(this.handleScroll.bind(this), 100);
      this.addListener(window, "scroll", scrollHandler, { passive: true });
    }

    createLoadingIndicator() {
      this.loadingIndicator = document.createElement("div");
      this.loadingIndicator.className = "nyx-loading-newer";
      this.loadingIndicator.innerHTML = `
                <div class="nyx-loading-spinner"></div>
                <span>Načítám novější příspěvky...</span>
            `;
      this.loadingIndicator.style.display = "none";
      this.postsContainer.insertBefore(
        this.loadingIndicator,
        this.postsContainer.firstChild,
      );
    }

    injectStyles() {
      GM_addStyle(`
                .nyx-loading-newer {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    padding: 16px;
                    color: var(--nyx-color-text-muted);
                    font-size: 14px;
                }
                .nyx-loading-spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid rgba(74, 158, 255, 0.3);
                    border-top-color: var(--nyx-color-primary);
                    border-radius: 50%;
                    animation: nyx-spin 0.8s linear infinite;
                }
                @keyframes nyx-spin {
                    to { transform: rotate(360deg); }
                }
                .nyx-no-more-posts {
                    text-align: center;
                    padding: 16px;
                    color: var(--nyx-color-text-muted);
                    font-size: 13px;
                    opacity: 0.7;
                }
                .nyx-new-post {
                    animation: nyx-fade-in 0.3s ease;
                }
            `);
    }

    handleScroll() {
      const scrollTop = window.scrollY;
      if (
        scrollTop < this.scrollThreshold &&
        !this.isLoading &&
        this.hasMorePosts
      ) {
        this.logger.info("ReverseScroll: Triggering load...");
        this.loadNewerPosts();
      }
    }

    async loadNewerPosts() {
      this.isLoading = true;
      this.loadingIndicator.style.display = "flex";

      // Get the first (newest) visible post - we want posts NEWER than this
      const firstPost = this.postsContainer.querySelector(this.postSelector);
      if (!firstPost) {
        this.logger.warn("ReverseScroll: No first post found");
        this.isLoading = false;
        this.loadingIndicator.style.display = "none";
        return;
      }

      const firstPostId = firstPost.dataset.id;
      this.logger.info("ReverseScroll: Loading posts newer than", firstPostId);

      // Get form data from page
      const csrf = document.querySelector('input[name="csrf_token"]')?.value;
      if (!csrf) {
        this.logger.error("ReverseScroll: CSRF token not found");
        this.isLoading = false;
        this.loadingIndicator.style.display = "none";
        return;
      }

      // Remember scroll position
      const scrollHeightBefore = document.documentElement.scrollHeight;
      const scrollTopBefore = window.scrollY;

      try {
        // Use form POST to get newer posts (simulates clicking '<' button)
        const formData = new FormData();
        formData.append("csrf_token", csrf);
        formData.append("nav", "<");

        const response = await fetch(`/discussion/${this.discussionId}`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const newPosts = doc.querySelectorAll(".posts-container .w[data-id]");

        this.logger.info(
          "ReverseScroll: Got",
          newPosts.length,
          "posts from response",
        );

        // Check if we got the same posts (no newer available)
        const newFirstId = newPosts[0]?.dataset?.id;
        if (!newFirstId || newFirstId === firstPostId) {
          this.hasMorePosts = false;
          this.showNoMorePosts();
          this.logger.info("ReverseScroll: Reached newest posts");
        } else {
          // Filter only posts that are actually newer
          const existingIds = new Set();
          this.postsContainer
            .querySelectorAll(this.postSelector)
            .forEach((p) => {
              existingIds.add(p.dataset.id);
            });

          const trulyNewPosts = Array.from(newPosts).filter(
            (p) => !existingIds.has(p.dataset.id),
          );
          this.logger.info(
            "ReverseScroll: Inserting",
            trulyNewPosts.length,
            "new posts",
          );

          if (trulyNewPosts.length === 0) {
            this.hasMorePosts = false;
            this.showNoMorePosts();
          } else {
            this.insertPosts(trulyNewPosts);

            // Restore scroll position
            const scrollHeightAfter = document.documentElement.scrollHeight;
            const heightDiff = scrollHeightAfter - scrollHeightBefore;
            window.scrollTo(0, scrollTopBefore + heightDiff);
          }
        }
      } catch (error) {
        this.logger.error("ReverseScroll: Failed to load", error);
      }

      this.isLoading = false;
      this.loadingIndicator.style.display = "none";
    }

    insertPosts(newPosts) {
      const firstExisting = this.postsContainer.querySelector(
        this.postSelector,
      );

      // Insert new posts at the top (before the loading indicator's next sibling)
      newPosts.forEach((post) => {
        const clone = document.importNode(post, true);
        clone.classList.add("nyx-new-post");
        if (firstExisting) {
          this.postsContainer.insertBefore(clone, firstExisting);
        } else {
          this.postsContainer.appendChild(clone);
        }
      });

      this.eventBus.emit("posts:loaded", {
        count: newPosts.length,
        direction: "newer",
      });
    }

    showNoMorePosts() {
      const notice = document.createElement("div");
      notice.className = "nyx-no-more-posts";
      notice.textContent = "— Jsi na nejnovějších příspěvcích —";
      this.loadingIndicator.replaceWith(notice);
    }

    destroy() {
      this.loadingIndicator?.remove();
      super.destroy();
    }
  }

  // =========================================================================
  // MODULE: HIGHLIGHT NEW POSTS
  // =========================================================================
  class HighlightNewModule extends BaseModule {
    constructor() {
      super();
    }

    shouldActivate() {
      return window.location.pathname.startsWith("/discussion/");
    }

    async init() {
      await super.init();

      this.injectStyles();
      this.highlightNewPosts();

      this.logger.debug("HighlightNew initialized");
    }

    injectStyles() {
      GM_addStyle(`
                .contribution.new,
                .post.new,
                .nyx-post-new {
                    border-left: 3px solid var(--nyx-color-primary) !important;
                    background: rgba(74, 158, 255, 0.05) !important;
                }

                .contribution,
                .post {
                    transition: background var(--nyx-transition-fast),
                                border-color var(--nyx-transition-fast);
                }
            `);
    }

    highlightNewPosts() {
      // Nyx marks new posts with .new class, but we enhance visibility
      const newPosts = document.querySelectorAll(
        ".contribution.new, .post.new",
      );
      newPosts.forEach((post) => {
        post.classList.add("nyx-post-new");
      });
    }
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  async function main() {
    // Wait for logger
    let logger;
    try {
      logger = await MyGlobalLogger.getInstance();
    } catch (e) {
      console.error("Nyx Improvements: Failed to init logger", e);
      logger = {
        debug: () => {},
        info: console.log,
        warn: console.warn,
        error: console.error,
      };
    }

    logger.info("Nyx Improvements v1.1.0 initializing...");

    // Inject base styles
    GM_addStyle(BASE_STYLES);

    // Initialize core services
    const eventBus = new EventBus();
    const storage = new Storage();

    // Initialize module manager
    const moduleManager = new ModuleManager(logger, eventBus, storage);

    // Register modules
    moduleManager.register("keyboardNav", new KeyboardNavModule());
    moduleManager.register("quickJump", new QuickJumpModule());
    moduleManager.register("hideRead", new HideReadModule());
    moduleManager.register("highlightNew", new HighlightNewModule());
    moduleManager.register("reverseScroll", new ReverseScrollModule());

    // Initialize modules for current page
    await moduleManager.initForPage(window.location.pathname);

    // Register menu commands
    GM_registerMenuCommand("🔄 Obnovit moduly", () => {
      moduleManager.destroy();
      moduleManager.initForPage(window.location.pathname);
      logger.info("Modules reloaded");
    });

    GM_registerMenuCommand("⌨️ Keyboard shortcuts", () => {
      alert(`Nyx Improvements - Keyboard Shortcuts:

j / k - Navigace mezi příspěvky
g + h - Úvod
g + t - Témata
g + b - Sledované
g + m - Pošta
/ nebo Ctrl+K - Quick Jump
x - Skrýt/zobrazit přečtené (na /bookmarks)
Esc - Zrušit výběr
Enter / o - Otevřít vybraný příspěvek`);
    });

    logger.info("Nyx Improvements ready");
  }

  // Run
  main().catch(console.error);
})();
