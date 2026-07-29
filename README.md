# Eat With Sam K 🍔

Your food review site: an interactive map of every place you've rated, plus a blog for city food guides.

## Pages

| Page | What's on it |
|---|---|
| `index.html` (Home) | Map of every place + your **Recent Reviews** (latest 6) + **Best Of Guides** (latest 3 posts) |
| `map.html` | A dedicated, full-size version of the interactive map — nothing else on the page |
| `reviews.html` | **All** reviews — searchable, sortable, and filterable by city, cuisine, price, and tags |
| `reviews/<id>.html` | One SEO-optimized landing page per place (auto-generated) |
| `blog.html` / `post.html` | Your "Best Of" guides — city round-up lists like "Best Pizza in Nashville" |
| `about.html` | Your About page — nav tab, bio, how you rate, socials |
| `privacy.html` | Privacy policy (required by Google AdSense's program policies) — linked from every footer |

## The three things you'll edit

| What you want to do | File to edit |
|---|---|
| Add / edit a restaurant review | `js/data.js` |
| Write a blog post | `js/blog-data.js` |
| Update your social media links | `js/data.js` (top, under `SITE.socials`) |

You never need to touch the HTML or CSS.

## Adding a new place

1. Open `js/data.js`.
2. Copy any existing block between `{ ... },` and paste it at the top of the `PLACES` list.
3. Fill in the fields:
   - **lat / lng** — right-click the spot in Google Maps, then click the coordinates to copy them.
   - **ate** — a sentence or two about what you ordered (this is your personal take).
   - **about** *(optional)* — a factual paragraph on the place itself: origin story, what they're known for, what they serve. This shows in an "About" section on the review page, above your review. Leave it out and that section just won't appear.
   - **rating** — your score out of 10 (decimals fine, e.g. `8.7`).
   - **video** — the share link to your Instagram review reel. This also gets embedded directly on the review page (playable, with likes/comments) — no separate photo upload needed.
   - **date** *(optional)* — `"YYYY-MM-DD"`, the day you reviewed it. Controls what counts as "recent" on the homepage and the default sort on the Reviews page. Skip it and the place just falls back to its position in the list (newest pasted at the top = most recent).
   - **badges** *(optional)* — an array of badge keys, e.g. `badges: ["family-friendly", "date-night"]`. Shows as gold pills on the card and review page ("Great For" section). See the full badge list below — only add one when it's genuinely true, not on every place.
   - **price** *(optional)* — `"$"`, `"$$"`, `"$$$"`, or `"$$$$"`. Shows in the review page's quick-facts block; hovering it pops up what that tier means (cost range + description) — see "Price tooltips" below.
   - **cuisine** *(optional)* — e.g. `"Pizza"`, `"BBQ"`. Also shows in quick facts.
   - **quickTake** *(optional)* — a short TL;DR paragraph, shown right up top under "Quick Take" — your honest one-paragraph verdict.
   - **photos** *(optional)* — an array of `{ src, alt }`, e.g. `photos: [{ src: "images/reviews/my-place/dish.jpg", alt: "The burger" }]`. Shown as a photo grid under "What I Ordered." Drop your photo files in `images/reviews/<place-id>/` and reference them here.
   - **scores** *(optional)* — `{ taste, value, atmosphere, service }`, each 0–10. Renders as "The Breakdown" with visual bars. Leave it out entirely and that section just won't appear.
   - **pros** / **cons** *(optional)* — arrays of short strings, e.g. `pros: ["Great heat variety", "Fast service"]`. Renders as a "Pros & Cons" section; only shows if at least one of the two has entries.
   - **id** — any unique short name, like `"lous-burgers-denver"`. This becomes the review's URL.
4. **Run the review-page generator** (see below) so the new place gets its own SEO-optimized page.
5. Refresh the site — the marker, homepage's Recent Reviews, the full Reviews page, stats, and the dedicated review page all update automatically.

Marker colors: green = 9.0+, orange = 8.0–8.9, gold = below 8.

## The internal-linking "magic" — Related Articles

Every review page can automatically show a **Related Articles** section linking back to any blog post that features that place — the same restaurant might appear in "Best Pizza in Nashville," "Best Date Night Restaurants," and "Best Downtown Restaurants" all at once, each one linking back to its review page. Google reads this kind of cross-linking as a strong signal for which pages on your site are related and authoritative.

To wire it up: add a `places: ["place-id", "place-id"]` array to a blog post in `js/blog-data.js`, listing the ids (from `js/data.js`) of every place that post covers. Nothing else to do — the next time you run `node generate-reviews.js`, every place in that list gets a "Related Articles" entry pointing at the post, automatically. Leave `places` off a post entirely and nothing changes (no broken or empty section appears).

## Badges

Defined once in `js/data.js` (`const BADGES = {...}`) and referenced by key from any place's `badges: [...]` array. Available keys:

| Key | Badge |
|---|---|
| `favorite` | 🏆 Sam's Favorite |
| `hidden-gem` | 💎 Hidden Gem |
| `best-value` | 💰 Best Value |
| `date-night` | ❤️ Date Night Pick |
| `family-friendly` | 👨‍👩‍👧 Family Friendly |
| `dog-friendly` | 🐶 Dog Friendly |
| `worth-the-wait` | 🔥 Worth the Wait |
| `best-patio` | 🌅 Best Patio |
| `best-drinks` | 🍹 Best Drinks |
| `brunch-favorite` | 🍳 Brunch Favorite |
| `group-friendly` | 🎉 Group Friendly |
| `work-friendly` | 💻 Work Friendly |
| `vegetarian-friendly` | 🌱 Vegetarian Friendly |
| `easy-parking` | 🚗 Easy Parking |
| `quick-bite` | ⚡ Quick Bite |

Want a new badge? Add an entry to `BADGES` in `js/data.js` (emoji, label, description) and it's immediately usable everywhere.

**On Prince St. Pizza:** I only added `family-friendly` — it's a genuinely fast-casual, walk-up-and-order pizza-by-the-slice concept, which fits cleanly. I held off on the others based on what I could verify: it's a well-known, buzzy NYC chain (not really a "hidden gem"), a 7.4 rating doesn't support "Sam's Favorite," it's counter-service rather than a sit-down atmosphere (not really "date night"), and I couldn't confirm a dog policy, actual wait times at this specific location, or a clear value comparison. There is a confirmed ~300 sq ft patio, so `best-patio` is a reasonable candidate once you've actually experienced it — that one's your call.

## Tooltips (badges & price)

Both badge pills and `$` price tags use the same hover-tooltip style — a small dark bubble that appears above whatever you're hovering, showing the full description. There's no visible legend/table anywhere on the site anymore; the price guide only exists as this hover text (defined once, in `PRICE_GUIDE` in `js/data.js`), and every `$`/`$$`/`$$$`/`$$$$` mention across the whole site — review pages and blog posts alike — automatically gets it. Nothing to maintain when you add a new price mention in a blog post: just wrap it the same way the existing posts do (`<span class="price-tag has-tooltip" data-tooltip="..." aria-label="..." tabindex="0">$$</span>`), matching the tier text in `PRICE_GUIDE`.

## Photos & video

Every review page shows the actual Instagram reel you filmed there, embedded and playable — pulled straight from the `video` link already in `js/data.js`, so there's nothing extra to upload. It's your own content, so there's no copyright concern. It shows near the top of the page (right under "Quick Take"), since it's usually the best proof of what a place is actually like.

You can also add your own photos with the `photos` field (see above) — drop the files in `images/reviews/<place-id>/` and they'll show as a gallery under "What I Ordered." These are your own photos, so — same as the video — no copyright concern.

For restaurants you write about but haven't personally photographed (like a multi-restaurant blog roundup), a different approach applies: embed the restaurant's *own* official Instagram post rather than downloading and rehosting a photo from Google, Yelp, or their website. Grabbing someone else's photo and hosting it directly on a site that runs ads is a real copyright risk, not just a technicality — embedding keeps the image on Instagram's servers with full attribution to whoever posted it, which is the legally clean way to do this.

## ⭐ Every review gets its own page (and is optimized for Google)

Each place in `js/data.js` gets a real, standalone page at `reviews/<id>.html` — e.g. `reviews/prince-street-pizza-nashville.html`. These aren't just template views: each one has its own unique page title, meta description, Open Graph/Twitter preview tags (so links look good when shared on social), and "Review" structured data that helps Google show star ratings directly in search results.

**Whenever you add, edit, or remove a place in `js/data.js`, run:**

```bash
cd "/Users/samkohl/Sam's Personal/Eat With Sam K"
node generate-reviews.js
```

This rebuilds every file in `reviews/`, plus `sitemap.xml` and `robots.txt`, from whatever is currently in `js/data.js`. (Requires Node.js, which is already installed if `node --version` works in your terminal.) You never hand-edit anything inside `reviews/` — it's fully regenerated each time.

**Before you go live**, open `generate-reviews.js` and update the `SITE_URL` constant near the top (currently a placeholder: `https://www.eatwithsamk.com`) to your real domain once you've deployed. It's used in canonical links, social preview tags, and the sitemap — all of which need your real, final domain to work correctly for SEO.

## Analytics & Ads

Google Analytics (`G-2V4D6ZQV6Q`) and Google AdSense (`ca-pub-7072826210873110`) are both wired into every page: `index.html`, `reviews.html`, `blog.html`, `post.html`, and the `generate-reviews.js` template (so every generated `reviews/<id>.html` page gets them too). You don't need to touch these — they're already live.

**On ads:** the script we added enables **Auto ads** — once you turn that on in your AdSense account (Ads → Overview → Auto ads, toggle "On" for this site), Google automatically places ad units in good spots across every page with no further code changes. If you'd rather control exact placement yourself (e.g. an ad between the review and the map on `reviews/<id>.html`), come back and ask — that needs a real ad-unit slot ID from your AdSense dashboard first.

## Nav, footer & About page

The top nav and site footer are **shared components**, not copy-pasted per page — each HTML page just has an empty `<nav class="main-nav" data-nav="..."></nav>` and `<footer class="site-footer" data-footer></footer>`, and `js/common.js` fills both in at runtime from one place (`NAV_LINKS` and `footerHtml()`). This means adding, renaming, or reordering a nav link, or changing anything in the footer, is a one-line edit in `js/common.js` — it updates everywhere instantly, including every auto-generated `reviews/<id>.html` page.

- The `data-nav="home"` / `"reviews"` / `"blog"` / `"about"` value tells it which tab to highlight as active. Leave it blank (as on `privacy.html`) for a page that isn't part of the primary nav.
- Pages inside a subfolder (`reviews/<id>.html`) add `data-prefix="../"` so the generated links point back up correctly.
- The footer has three columns — brand/tagline/socials, an Explore link list, and a newsletter signup — plus a bottom bar with the copyright and a Privacy Policy link.

**About page (`about.html`):** your story, hero photo, and "Get In Touch" links are all filled in and real.

**Newsletter signup:** the footer has a working email input + "Subscribe" button, but it isn't connected to a real email service yet — submitting it currently shows an honest "launching soon" message rather than pretending to collect the signup (a fake-success form felt worse than no form at all). Once you pick a service — Mailchimp, ConvertKit, Beehiiv, Substack, etc. — the form in `js/common.js` (`newsletterHtml`/the `[data-newsletter]` handler) just needs to point at that service's real signup endpoint. Say the word whenever you've decided and this gets wired up for real.

## Filtering on the Reviews page

`reviews.html` has a filters panel above the results, alongside the existing search box and sort dropdown:

- **City** and **Cuisine** — dropdowns, built automatically from whatever cities/cuisines actually appear in `js/data.js`. Nothing to maintain — add a place with a new city or cuisine and it just shows up as an option.
- **Price** — always shows all four tiers ($ – $$$$) from `PRICE_GUIDE`, since that's a fixed, site-wide scale.
- **Tags** — only shows the badges (see "Badges" above) that are actually in use by at least one place, so every visible option can return a result. This row disappears entirely until at least one place has a badge.

Selecting more than one Price or Tag pill is an **OR** within that row (e.g. picking `$` and `$$$` shows places matching either), while City, Cuisine, Price, and Tags together are combined with **AND** (a place has to match all of the filters you've set, plus the search box and sort). "Clear Filters" resets all of it back to showing everything.

## The Map page

`map.html` is a dedicated, full-size version of the interactive map — same markers, same popups (rating, video link, full review), just without the stats/Recent Reviews/Best Of sections that share the homepage with it. Both pages actually share one function, `initPlacesMap()` in `js/common.js`, so a change to how markers or popups look only needs to happen in one place.

## "Best Of" guides (formerly "Blog")

The nav tab, footer link, and page titles all say **Best Of** now instead of Blog, since every post here is a "Best of [City]" round-up rather than a diary-style blog. This was a text-only rename — the underlying files are still `blog.html`/`post.html` and `js/blog-data.js`, and post URLs (`post.html?id=...`) are unchanged, so nothing about how you write a new post is different (see "Writing a blog post" below).

## Motion & animation

The whole site shares one small motion system in `js/common.js`, so you don't need to add anything per-page:

- **Scroll reveal** — any element with `class="reveal"` fades and slides in once it scrolls into view (cards, section headers, the review page's About/Instagram sections). Add the class to new markup and it just works — a `MutationObserver` picks up cards rendered dynamically too.
- **Count-up stats** — the homepage's "Places Rated / Cities / Avg Rating" numbers animate up from 0 the first time they scroll into view.
- **Header shadow on scroll**, a **logo wiggle** on hover, a slow ambient drift on the homepage's hero background, a soft pulse on 9.0+ rating badges, and smoother hover/press motion on buttons and cards.
- Respects `prefers-reduced-motion` — all of this is disabled for users who've asked their OS to reduce motion.

If a scroll-reveal or count-up ever seems stuck (a slow connection, an odd embedded browser), there's a 2-second safety-net fallback that reveals everything regardless — content is never permanently stuck invisible.

## Other SEO groundwork already in place

- **`sitemap.xml` + `robots.txt`** — regenerated automatically every time you run `node generate-reviews.js`, listing every page so Google can find them.
- **Structured data (JSON-LD)** on every page type: `WebSite` + `Organization` (with links to your Instagram/TikTok/YouTube) on the homepage, `Restaurant` + `Review` + `BreadcrumbList` on each review page, `ItemList` on the Reviews page, `BlogPosting` on each post.
- **Canonical URLs, Open Graph, and Twitter Card tags** on every page, so links look right when shared and Google doesn't see duplicate content.
- **One clear heading (`<h1>`) per page** and a breadcrumb trail (Home → Reviews → [Place]) for both users and Google.
- **FAQ structured data (`FAQPage`)** — if a blog post has a `faq` array (see below), those questions can show up as an expandable rich result directly in Google search, above your regular listing.

Idea for later: swapping AdSense's Auto ads for a couple of hand-placed in-content units once you know which spots perform best.

### Adding an FAQ to a blog post

Add a `faq` array to any post in `js/blog-data.js`:

```js
faq: [
  { question: "Your question here?", answer: "The answer, in plain text." },
],
```

This shows no visible FAQ section by itself — it only feeds Google's structured data. If you want the FAQ visible on the page too, write it into `content` as regular `<h2>`/`<p>` (like the Nashville date-night guide does), and keep the `faq` array in sync with it — Google requires structured data to match what's actually on the page.

## Writing a blog post

Open `js/blog-data.js`, copy a post block to the top of the list, give it a unique `id`, and write your `content` using simple HTML tags (`<p>`, `<h2>`, `<ul>`, `<li>`, `<strong>`, `<a>`).

## ⚠️ Before you launch

- Confirm your social handles at the top of `js/data.js` (currently guessed as `@eatwithsamk`).
- Update `SITE_URL` in `generate-reviews.js` to your real domain (see above), then re-run the generator once more so every page's canonical/OG links point to the right place.

## Previewing locally

Open `index.html` in a browser, or run a tiny local server:

```bash
cd "/Users/samkohl/Sam's Personal/Eat With Sam K"
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Publishing (free options)

- **Netlify Drop** — drag the whole folder onto https://app.netlify.com/drop. Done.
- **GitHub Pages** — push this folder to a repo, enable Pages in settings.
- Works with any custom domain (e.g. eatwithsamk.com) via either host.

It's all static files — no server, no framework. The one exception is `generate-reviews.js`, a small Node script that builds the `reviews/` pages from `js/data.js` (see above); run it once before each deploy so the live site includes your latest reviews.
