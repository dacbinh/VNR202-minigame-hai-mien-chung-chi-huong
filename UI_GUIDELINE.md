# Vietnamese Minigame Website — TypeScript UI Style Guideline

**Document type:** UI/UX and frontend implementation specification  
**Target:** AI coding agents and frontend developers  
**Technology:** TypeScript, React, CSS  
**Design direction:** Modern Vietnamese heritage, calm, playful, accessible  
**Primary objective:** Create a cohesive minigame website that reflects Vietnamese culture while remaining visually comfortable during extended use.

---

## 1. Core Design Philosophy

The website must combine three qualities:

1. **Vietnamese identity:** Draw inspiration from traditional Vietnamese architecture, Đông Sơn bronze drums, Vietnamese ceramics, traditional paper, lacquerware, and familiar cultural colors.
2. **Modern usability:** Use contemporary layouts, predictable navigation, readable typography, and reusable UI components.
3. **Visual comfort:** Favor muted colors, balanced contrast, generous spacing, and restrained decoration.

### 1.1 Design principles

- Vietnamese-inspired, not stereotypically Vietnamese.
- Playful, not childish.
- Traditional, not outdated.
- Colorful, not oversaturated.
- Decorative, not distracting.
- Consistent, not repetitive.
- Accessible, not dependent on color alone.

### 1.2 Visual identity

The overall impression should resemble a modern digital interpretation of Vietnamese traditional spaces.

Imagine:
- Warm ivory surfaces inspired by traditional paper.
- Muted jade green inspired by Vietnamese ceramics and vegetation.
- Deep ink-like text inspired by traditional calligraphy.
- Restrained lacquer red for primary actions.
- Antique gold for decorative highlights and special achievements.
- Subtle patterns inspired by traditional geometry.

**Important:** These are design inspirations, not strict historical color reconstructions. Prioritize visual harmony and usability over historical imitation.

### 1.3 Visual hierarchy

Use the following priority:

1. Game content and interactive elements.
2. Navigation and page structure.
3. Progress, score, and game status.
4. Cultural decoration.

Decorative elements must never compete with the actual game.

---

# 2. Color System

Define a centralized color system and reuse it throughout the application.

Avoid independently selecting colors for each component.

## 2.1 Primary palette

Use the following palette as the default design foundation.

| Token | Hex | Purpose |
|---|---|---|
| `--color-background` | `#F6F3EB` | Main page background |
| `--color-surface` | `#FFFCF5` | Cards, panels, and content surfaces |
| `--color-surface-muted` | `#EDE9DD` | Secondary surfaces and subtle section backgrounds |
| `--color-text` | `#292E29`