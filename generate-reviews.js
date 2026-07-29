/* ============================================================
   EAT WITH SAM K — REVIEW PAGE GENERATOR
   Run this any time you add, edit, or remove a place in
   js/data.js (or a post in js/blog-data.js):

     node generate-reviews.js

   It builds:
     - reviews/<id>.html   (one real, static, SEO-optimized
       page per place — full <title>, meta description, Open
       Graph tags, and Review structured data baked in, so
       Google — and anyone sharing the link on social — sees
       real content immediately, no JavaScript required)
     - sitemap.xml
     - robots.txt

   You never edit the files in reviews/ by hand — they're
   regenerated from js/data.js every time you run this script.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// TODO: update this once you have a real domain (e.g. after
// pointing eatwithsamk.com at your Netlify/GitHub Pages deploy).
// It's used for canonical URLs, Open Graph tags, and the sitemap.
const SITE_URL = "https://www.eatwithsamk.com";

function loadModule(relPath, trailingExpr) {
  const code = fs.readFileSync(path.join(__dirname, relPath), "utf8");
  return vm.runInNewContext(code + "\n" + trailingExpr, {});
}

const { SITE, PLACES, BADGES, PRICE_GUIDE } = loadModule("js/data.js", "({ SITE, PLACES, BADGES, PRICE_GUIDE });");
const BLOG_POSTS = loadModule("js/blog-data.js", "(BLOG_POSTS);");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// A styled hover tooltip (not the native browser `title` box) — matches
// the client-side helper in js/common.js, used the same way here.
function tooltipAttrs(text) {
  const safe = escapeAttr(text);
  return `data-tooltip="${safe}" aria-label="${safe}" tabindex="0"`;
}

function priceTagHtml(price) {
  const tier = PRICE_GUIDE[price];
  if (!tier) return escapeHtml(price);
  return `<span class="price-tag has-tooltip" ${tooltipAttrs(`${tier.range} — ${tier.description}`)}>${escapeHtml(price)}</span>`;
}

function ratingClass(rating) {
  if (rating >= 9) return "great";
  if (rating >= 8) return "";
  return "good";
}

function truncate(str, max) {
  const clean = str.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trim() + "…" : clean;
}

// Best-effort split of "5056 Broadway, Suite B-103, Nashville, TN 37203"
// into schema.org PostalAddress fields.
function parseAddress(address) {
  const parts = address.split(",").map((p) => p.trim());
  const last = parts[parts.length - 1] || "";
  const match = last.match(/^([A-Za-z]{2})\s+(\d{5}(-\d{4})?)$/);
  const region = match ? match[1] : "";
  const postalCode = match ? match[2] : "";
  const locality = parts.length >= 2 ? parts[parts.length - 2] : "";
  const streetAddress = parts.slice(0, Math.max(parts.length - 2, 1)).join(", ");
  return { streetAddress, addressLocality: locality, addressRegion: region, postalCode };
}

function reviewUrl(place) {
  return `${SITE_URL}/reviews/${place.id}.html`;
}

function socialButtonsHtml() {
  return ""; // filled client-side by js/common.js via [data-socials]
}

// Small inline 0-10 meter for the Taste/Value/Atmosphere/Service breakdown.
function scoreRowHtml(label, value) {
  if (value === undefined || value === null) return "";
  const pct = Math.max(0, Math.min(100, (value / 10) * 100));
  return `
    <div class="score-row">
      <span class="score-label">${escapeHtml(label)}</span>
      <div class="score-bar"><div class="score-bar-fill" style="width:${pct}%"></div></div>
      <span class="score-value">${value}/10</span>
    </div>`;
}

function renderReviewPage(place, relatedPosts) {
  const cls = ratingClass(place.rating);
  const year = place.date ? new Date(place.date + "T12:00:00").getFullYear() : new Date().getFullYear();
  const title = `${place.name} Review (${year}): ${place.rating}/10 in ${place.city} | Eat With Sam K`;
  const description = `${truncate(place.ate, 140)} Sam K's rating: ${place.rating}/10.`;
  const canonical = reviewUrl(place);
  const ogImage = `${SITE_URL}/images/logo.png`;
  const addr = parseAddress(place.address);
  const telDigits = place.phone ? place.phone.replace(/[^+\d]/g, "") : "";
  const websiteLabel = place.website ? place.website.replace(/^https?:\/\/(www\.)?/, "") : "";
  const tagsHtml = (place.tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");
  const greatForBadges = (place.badges || []).map((key) => BADGES[key]).filter(Boolean);
  const badgesHtml = greatForBadges
    .map((b) => `<span class="badge-pill has-tooltip" ${tooltipAttrs(b.description)}>${b.emoji} ${escapeHtml(b.label)}</span>`)
    .join("");
  // Strip tracking query params (?igsh=...) for a clean embed permalink.
  const videoPermalink = place.video ? place.video.split("?")[0] : "";
  const photosHtml = (place.photos || [])
    .map((p) => `<img src="../${p.src}" alt="${escapeAttr(p.alt || place.name)}" loading="lazy" />`)
    .join("");

  const quickFactsHtml = `
    <ul class="quick-facts">
      <li>⭐ <strong>Overall:</strong> ${place.rating}/10</li>
      <li>📍 <strong>Address:</strong> ${escapeHtml(place.address)}</li>
      ${place.price ? `<li>💰 <strong>Price:</strong> ${priceTagHtml(place.price)}</li>` : ""}
      ${place.cuisine ? `<li>🍽️ <strong>Cuisine:</strong> ${escapeHtml(place.cuisine)}</li>` : ""}
    </ul>
    ${greatForBadges.length ? `<p class="quick-facts-label">❤️ <strong>Great For:</strong></p><div class="badge-row">${badgesHtml}</div>` : ""}`;

  const scores = place.scores || {};
  const breakdownHtml = [
    scoreRowHtml("Taste", scores.taste),
    scoreRowHtml("Value", scores.value),
    scoreRowHtml("Atmosphere", scores.atmosphere),
    scoreRowHtml("Service", scores.service),
  ].join("");
  const hasBreakdown = Object.keys(scores).length > 0;

  const hasProsOrCons = (place.pros && place.pros.length) || (place.cons && place.cons.length);
  const prosConsHtml = hasProsOrCons
    ? `
    <div class="pros-cons">
      ${place.pros && place.pros.length ? `<div class="pros"><h3>👍 Pros</h3><ul>${place.pros.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul></div>` : ""}
      ${place.cons && place.cons.length ? `<div class="cons"><h3>👎 Cons</h3><ul>${place.cons.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul></div>` : ""}
    </div>`
    : "";

  const relatedHtml = relatedPosts.length
    ? `
    <div class="reveal">
      <h2 class="review-section-title">Related Articles</h2>
      <p class="review-about">${escapeHtml(place.name)} appears on:</p>
      <ul class="related-articles">
        ${relatedPosts.map((post) => `<li><a href="../post.html?id=${post.id}">${escapeHtml(post.title)}</a></li>`).join("")}
      </ul>
    </div>`
    : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: place.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: addr.streetAddress,
      addressLocality: addr.addressLocality,
      addressRegion: addr.addressRegion,
      postalCode: addr.postalCode,
      addressCountry: "US",
    },
    ...(place.about ? { description: place.about } : {}),
    ...(place.phone ? { telephone: place.phone } : {}),
    ...(place.website ? { url: place.website } : {}),
    ...(place.price ? { priceRange: place.price } : {}),
    ...(place.cuisine ? { servesCuisine: place.cuisine } : {}),
    ...(place.lat && place.lng
      ? { geo: { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng } }
      : {}),
    review: {
      "@type": "Review",
      reviewRating: {
        "@type": "Rating",
        ratingValue: place.rating,
        bestRating: "10",
        worstRating: "1",
      },
      author: { "@type": "Person", name: "Sam K" },
      reviewBody: place.ate,
      publisher: { "@type": "Organization", name: SITE.name },
    },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/index.html` },
      { "@type": "ListItem", position: 2, name: "Reviews", item: `${SITE_URL}/reviews.html` },
      { "@type": "ListItem", position: 3, name: place.name, item: canonical },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-2V4D6ZQV6Q"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-2V4D6ZQV6Q');
  </script>

  <!-- Google AdSense -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7072826210873110"
       crossorigin="anonymous"></script>

  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:site_name" content="${escapeHtml(SITE.name)}" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${ogImage}" />

  <link rel="icon" type="image/png" href="../images/favicon.png?v=2" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="../css/style.css?v=13" />

  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
</head>
<body>

  <header class="site-header">
    <div class="header-inner">
      <a class="logo" href="../index.html"><img class="logo-img" src="../images/logo.png?v=2" alt="Eat With Sam K logo" /> Eat With Sam K</a>
      <nav class="main-nav" data-nav="reviews" data-prefix="../"></nav>
      <div class="social-row" data-socials></div>
    </div>
  </header>

  <main class="post-wrap">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="../index.html">Home</a><span>›</span>
      <a href="../reviews.html">Reviews</a><span>›</span>
      <span aria-current="page">${escapeHtml(place.name)}</span>
    </nav>

    <div class="review-hero">
      <div class="rating-badge rating-badge-lg ${cls}">${place.rating}<small>/ 10</small></div>
      <div>
        <h1>${escapeHtml(place.name)} Review (${year})</h1>
        <p class="card-city">📍 ${escapeHtml(place.city)}</p>
      </div>
    </div>
    ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ""}

    <div class="reveal quick-facts-card">${quickFactsHtml}</div>

    ${place.quickTake ? `<div class="reveal"><h2 class="review-section-title">Quick Take</h2><p class="review-about">${escapeHtml(place.quickTake)}</p></div>` : ""}

    ${videoPermalink ? `
    <div class="reveal">
      <h2 class="review-section-title">My Video Review</h2>
      <div class="ig-embed">
        <blockquote class="instagram-media" data-instgrm-permalink="${videoPermalink}" data-instgrm-version="14"></blockquote>
      </div>
    </div>
    ` : ""}

    ${place.about ? `<div class="reveal"><h2 class="review-section-title">About ${escapeHtml(place.name)}</h2><p class="review-about">${escapeHtml(place.about)}</p></div>` : ""}

    <h2 class="review-section-title">What I Ordered</h2>
    ${photosHtml ? `<div class="review-photos reveal">${photosHtml}</div>` : ""}
    <article class="place-card" style="margin: 12px 0 22px;">
      <p class="card-ate">${escapeHtml(place.ate)}</p>
      <div class="card-contact">
        <span>🏠 ${escapeHtml(place.address)}</span>
        ${place.phone ? `<span>📞 <a href="tel:${telDigits}">${escapeHtml(place.phone)}</a></span>` : ""}
        ${place.website ? `<span>🌐 <a href="${place.website}" target="_blank" rel="noopener">${escapeHtml(websiteLabel)}</a></span>` : ""}
      </div>
      <div class="card-actions">
        <a class="btn btn-primary" href="${place.video}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Watch My Review
        </a>
        <a class="btn btn-ghost" href="../reviews.html">← All Reviews</a>
      </div>
    </article>

    ${hasBreakdown ? `
    <div class="reveal">
      <h2 class="review-section-title">The Breakdown</h2>
      <div class="score-grid">${breakdownHtml}</div>
    </div>
    ` : ""}

    ${hasProsOrCons ? `<div class="reveal"><h2 class="review-section-title">Pros &amp; Cons</h2>${prosConsHtml}</div>` : ""}

    <div class="reveal final-rating">
      <h2 class="review-section-title">Final Rating</h2>
      <div class="rating-badge rating-badge-lg ${cls}">${place.rating}<small>/ 10</small></div>
    </div>

    ${relatedHtml}

    <h2 class="review-section-title">Find it on the map</h2>
    <div id="map" class="review-map"></div>
  </main>

  <footer class="site-footer" data-footer data-prefix="../"></footer>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  ${videoPermalink ? '<script async src="//www.instagram.com/embed.js"></script>' : ""}
  <script src="../js/data.js?v=6"></script>
  <script src="../js/common.js?v=11"></script>
  <script>
    var map = L.map("map", { scrollWheelZoom: false }).setView([${place.lat}, ${place.lng}], 15);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    var icon = L.divIcon({
      className: "",
      html: '<div class="rating-marker ${cls}"><span>${place.rating}</span></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 44],
      popupAnchor: [0, -44],
    });
    L.marker([${place.lat}, ${place.lng}], { icon: icon }).addTo(map)
      .bindPopup(${JSON.stringify(`<div class="popup-title">${place.name}</div>`)})
      .openPopup();
    window.addEventListener("load", function () { map.invalidateSize(); });
  </script>
</body>
</html>
`;
}

function renderSitemap() {
  const urls = [
    { loc: `${SITE_URL}/index.html`, priority: "1.0" },
    { loc: `${SITE_URL}/map.html`, priority: "0.9" },
    { loc: `${SITE_URL}/reviews.html`, priority: "0.9" },
    { loc: `${SITE_URL}/blog.html`, priority: "0.8" },
    { loc: `${SITE_URL}/about.html`, priority: "0.5" },
    { loc: `${SITE_URL}/privacy.html`, priority: "0.2" },
    ...PLACES.map((p) => ({ loc: reviewUrl(p), priority: "0.9" })),
    ...BLOG_POSTS.map((post) => ({ loc: `${SITE_URL}/post.html?id=${post.id}`, priority: "0.6" })),
  ];
  const body = urls
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function renderRobots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

const reviewsDir = path.join(__dirname, "reviews");
fs.mkdirSync(reviewsDir, { recursive: true });

// Clear out stale review pages for places that no longer exist in data.js.
for (const f of fs.readdirSync(reviewsDir)) {
  if (f.endsWith(".html") && !PLACES.some((p) => `${p.id}.html` === f)) {
    fs.unlinkSync(path.join(reviewsDir, f));
    console.log(`removed stale reviews/${f}`);
  }
}

for (const place of PLACES) {
  const relatedPosts = BLOG_POSTS.filter((post) => post.places && post.places.includes(place.id));
  const outPath = path.join(reviewsDir, `${place.id}.html`);
  fs.writeFileSync(outPath, renderReviewPage(place, relatedPosts));
  console.log(`wrote reviews/${place.id}.html`);
}

fs.writeFileSync(path.join(__dirname, "sitemap.xml"), renderSitemap());
console.log("wrote sitemap.xml");

fs.writeFileSync(path.join(__dirname, "robots.txt"), renderRobots());
console.log("wrote robots.txt");

console.log(`\nDone — ${PLACES.length} review page(s) generated.`);
