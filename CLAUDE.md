# LILY — Integrative Fitness & Nutrition | Personal Brand Website

## Project Overview

Premium personal brand website for **Lily** — certified nutritionist and integrative personal trainer.
Target: high-end landing page that converts visitors into Telegram consultations.

**Live channels:**
- Telegram channel: https://t.me/Lily_Smart_Fitness (~1,159 subscribers)
- Telegram DM (primary CTA): https://t.me/LilyLesik
- Instagram: https://www.instagram.com/kpmvl

## Tech Stack

- **Framework:** Astro 5 (static site generator — fast, SEO-optimized, zero JS by default)
- **Styling:** Tailwind CSS 4 + custom CSS variables for brand tokens
- **Animations:** CSS animations + Intersection Observer (no heavy libs)
- **Fonts:** Google Fonts — Cormorant Garamond (display) + Manrope (body)
- **Deployment target:** Vercel / Netlify / any static hosting
- **Language:** HTML content in Russian (ru locale)

## Brand Design System

### Color Tokens
```css
--cream: #F5F0EB;          /* page background */
--warm-black: #1A1714;     /* primary text, hero bg */
--olive: #6B7B5E;          /* accent green, section eyebrows */
--olive-light: #8A9A7A;    /* hover states */
--gold: #C4A265;           /* primary CTA, highlights */
--gold-light: #D4B87A;     /* hover gold, italic accents */
--taupe: #A69585;          /* muted decorative */
--blush: #E8D5C8;          /* soft pink accent */
--white: #FDFCFA;          /* card backgrounds */
--text-muted: #7A7067;     /* body text */
--border: rgba(26,23,20,0.08);
```

### Typography
- **Display:** `Cormorant Garamond` — weights 300, 400, 500, 600, 700 + italic
- **Body:** `Manrope` — weights 300, 400, 500, 600, 700
- **Sizes:** fluid clamp() based — hero title `clamp(3rem, 7vw, 6.5rem)`, section titles `clamp(2rem, 4vw, 3.5rem)`
- **Letter-spacing:** eyebrows `0.35em`, nav links `0.15em`, CTAs `0.2em`

### Design Aesthetic
- **Tone:** Luxury editorial wellness. NOT fitness-bro. Think The Parker Practice (London), Goop, Aman resorts.
- **Photography style:** Warm, natural light, earth tones, no stock fitness photos
- **Layout:** Generous whitespace, asymmetric grids, vertical rhythm
- **Effects:** Subtle grain overlay on hero, scroll-triggered reveals, gold line accents

## Site Architecture

```
/ (index)
├── Hero Section
│   ├── Full-screen dark bg with grain texture
│   ├── Eyebrow: "Integrative Fitness & Nutrition"
│   ├── H1: "Умный фитнес, который тебе соответствует"
│   ├── Subtitle + 2 CTAs (primary → Telegram, ghost → #approach)
│   └── Scroll indicator
│
├── #philosophy — About / Philosophy
│   ├── 2-column grid: visual placeholder (for photo) + text
│   ├── Brand story + approach description
│   └── Stats row: 7+ лет, 1K+ клиентов, 96% довольных
│
├── #approach — Method / 3 Pillars
│   ├── Centered header
│   └── 3-card grid:
│       ├── 01 Smart Training
│       ├── 02 Nutrition Design
│       └── 03 Lifestyle Integration
│
├── #services — Programs / Pricing
│   ├── Dark section (warm-black bg)
│   └── 3-tier pricing:
│       ├── Start: Nutrition Plan — €97/mo
│       ├── Premium: Full Integration — €247/mo (featured)
│       └── Elite: VIP Coaching — €497/mo
│
├── #results — Testimonials
│   ├── 3-card testimonial grid
│   └── Each: quote + text + author avatar/name/meta
│
├── #process — How It Works
│   ├── 4-step vertical timeline
│   └── Steps: Диагностика → План → Сопровождение → Результат
│
├── CTA Banner
│   ├── Olive gradient background
│   └── "Записаться в Telegram" button
│
├── #faq — FAQ Accordion
│   └── 5 items with expand/collapse
│
└── Footer
    ├── 4-column grid: brand + nav + programs + contacts
    └── Bottom bar: copyright + social links (TG, IG)
```

## Component Requirements

### Navigation
- Fixed, transparent on hero → solid cream bg on scroll
- Logo left, links center/right, CTA button "Записаться"
- Mobile: burger → fullscreen overlay menu
- Transition: padding shrinks + bg appears on scroll past 100px

### Hero
- Min-height 100vh, centered content
- Background: multi-layer (solid → radial gradients → grain SVG overlay → gold vertical lines at 25/50/75%)
- Staggered fade-up animations (eyebrow 0.5s → title 0.7s → subtitle 0.9s → CTAs 1.1s)
- Scroll indicator at bottom with pulse animation

### Buttons
- `.btn-primary`: gold bg, warm-black text, sliding hover overlay
- `.btn-ghost`: transparent with border, gold text on hover
- `.service-btn`: full-width, border → gold fill on hover

### Cards (Pillars)
- White bg, subtle border, lift on hover (-4px + shadow)
- Large faded number (01/02/03), icon in top-right circle
- Number turns gold on hover, icon gets olive bg

### Pricing Cards
- Dark bg, subtle borders between cards
- Featured card: gold-tinted bg, gold border, pre-filled CTA
- "Популярное" label on featured card

### Testimonials
- Large decorative quote mark (Cormorant, 5rem, gold, 0.3 opacity)
- Italic body text
- Author: circle avatar with initials + name + meta

### Process Timeline
- Vertical line (gold gradient) on left
- Numbered circle markers (60px)
- Step content: h3 title + description

### FAQ
- Click to expand/collapse (only one open at a time)
- Plus icon rotates 45° → becomes × when open
- Smooth max-height transition

### Scroll Reveal
- All sections use `.reveal` class
- IntersectionObserver triggers `.visible` state
- Fade-up from 40px, 0.8s ease
- Stagger with delay classes (.1s, .2s, .3s)

## Content (Russian)

All text content is defined in `src/content/site-content.json`. Key copy:

- **Hero tagline:** "Умный фитнес, который тебе соответствует"
- **Philosophy headline:** "Не диеты и не изнуряющие тренировки. Система."
- **Approach headline:** "Три столпа трансформации"
- **Services headline:** "Выберите свой формат"
- **Results headline:** "Истории трансформаций"
- **Process headline:** "Путь к результату"
- **CTA:** "Ваша трансформация начинается с одного шага"

## All External Links

Every CTA button on the site must link to: `https://t.me/LilyLesik` (target="_blank")
Social links in footer:
- Telegram channel: `https://t.me/Lily_Smart_Fitness`
- Instagram: `https://www.instagram.com/kpmvl`

## Performance Requirements

- Lighthouse score: 95+ on all metrics
- No JavaScript frameworks — vanilla JS only for interactivity
- All animations CSS-based (except IntersectionObserver trigger)
- Lazy load images below the fold
- Preconnect to Google Fonts
- Inline critical CSS if possible

## Responsive Breakpoints

- **Desktop:** 1200px+ (full grid layouts)
- **Tablet:** 768px–1024px (stack grids to 1-col where needed)
- **Mobile:** <768px (burger menu, single column, adjusted font sizes)

## File Structure

```
lily-project/
├── CLAUDE.md              ← this file
├── README.md              ← setup & deploy instructions
├── package.json           ← project metadata + scripts
├── src/
│   ├── index.html         ← main page
│   ├── css/
│   │   ├── variables.css  ← design tokens
│   │   ├── reset.css      ← minimal reset
│   │   ├── layout.css     ← grid, section, container
│   │   ├── components.css ← nav, cards, buttons, etc.
│   │   ├── hero.css       ← hero-specific styles
│   │   ├── animations.css ← keyframes, reveal, transitions
│   │   └── responsive.css ← media queries
│   ├── js/
│   │   └── main.js        ← nav scroll, mobile menu, FAQ, reveal observer
│   ├── assets/
│   │   └── images/        ← placeholder for client photos
│   └── content/
│       └── site-content.json ← all text content (Russian)
└── docs/
    ├── STRATEGY.md         ← marketing strategy & analysis
    └── CUSTOMIZATION.md    ← guide for client to update content
```

## Commands

```bash
# Development (simple live server)
npx serve src

# Or use any static server
cd src && python3 -m http.server 3000

# Build for production (just copy src/ to hosting)
cp -r src/ dist/
```

## IMPORTANT Implementation Notes

1. **Photos:** The site currently uses a decorative "L" letter as placeholder in the About section. Client needs to replace with their professional photo (aspect ratio 3:4, warm tones).

2. **Testimonials:** Current testimonials are sample text. Client should replace with real reviews.

3. **Prices:** €97 / €247 / €497 are suggested positioning. Client should adjust to actual pricing.

4. **SEO:** Add proper meta tags: title, description, og:image, og:title, structured data (Person + LocalBusiness).

5. **Analytics:** Add Yandex.Metrika and/or Google Analytics before launch.

6. **Cookie consent:** May be needed depending on target audience jurisdiction.

7. **Favicon:** Create a minimal "L" monogram favicon in gold on dark bg.
