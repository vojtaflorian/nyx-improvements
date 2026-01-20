# Nyx.cz Improvements

Tampermonkey userscript for enhanced UI experience on [nyx.cz](https://nyx.cz) forum.

## Features

### Keyboard Navigation
| Key | Action |
|-----|--------|
| `j` / `k` | Navigate between posts |
| `g` then `h` | Go to Home |
| `g` then `t` | Go to Topics |
| `g` then `b` | Go to Bookmarks |
| `g` then `m` | Go to Mail |
| `g` then `e` | Go to Events |
| `/` or `Ctrl+K` | Open Quick Jump |
| `x` | Toggle hide read (on /bookmarks) |
| `Enter` / `o` | Open selected post |
| `Esc` | Clear selection |

### Quick Jump (Command Palette)
- Press `/` or `Ctrl+K` to open
- Search through pages and bookmarked discussions
- Keyboard navigation with arrow keys

### Hide Read Discussions
- Toggle button in bookmarks page toolbar
- Hides discussions without new posts
- State persists across page reloads

### Highlight New Posts
- Enhanced visibility for new/unread posts
- Blue left border indicator

### Reverse Infinite Scroll (v1.2.0)
- When reading from oldest unread (after clicking unread count)
- Automatically loads newer posts when scrolling up toward newest
- Preserves scroll position after loading
- Shows notice when you've reached the newest posts

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click [Install Script](https://raw.githubusercontent.com/vojtaflorian/nyx-improvements/main/nyx-improvements.user.js)
3. Confirm installation in Tampermonkey

## Requirements

- Modern browser (Chrome, Firefox, Edge, Safari)
- [Tampermonkey](https://www.tampermonkey.net/) extension
- [tampermonkey-global-logger](https://github.com/vojtaflorian/tampermonkey-global-logger) (loaded automatically via @require)

## Configuration

Access script settings via Tampermonkey menu:
- **Reload modules** - Reinitialize all modules
- **Keyboard shortcuts** - Show keyboard shortcuts help

## Development

### Architecture

The script uses a modular architecture with:
- **ModuleManager** - Handles module registration and lifecycle
- **EventBus** - Pub/sub communication between modules
- **Storage** - GM_setValue/getValue wrapper with prefix
- **BaseModule** - Base class for all feature modules

### Modules

| Module | Page | Description |
|--------|------|-------------|
| KeyboardNav | All | Keyboard shortcuts |
| QuickJump | All | Command palette |
| HideRead | /bookmarks | Hide read discussions |
| HighlightNew | /discussion/* | Highlight new posts |
| ReverseScroll | /discussion/* | Load older posts on scroll up |

### CSS Strategy

All CSS classes use `nyx-` prefix to avoid conflicts with host styles:

- `.nyx-post-focused`
- `.nyx-quickjump`
- `.nyx-hide-read-active`

CSS variables are used for theming:
```css
--nyx-color-primary: #4a9eff;
--nyx-color-bg-overlay: rgba(0, 0, 0, 0.8);
--nyx-z-modal: 1000;
```

## Support

If you find this useful, consider buying me a coffee:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/vojtaflorian)

## License

MIT

## Author

Vojta Florian
