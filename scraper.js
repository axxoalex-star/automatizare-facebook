const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

(async () => {
    console.log(`Pornesc scriptul de scraping...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
        console.log(`Accesăm pagina principală: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        
        // Închidem orice banner care ne stă în cale
        await page.addStyleTag({ content: 'div[role="dialog"], div[id^="login_mount"] { display: none !important; }' });
        await page.waitForTimeout(3000);

        // Pasul 1: Găsim link-ul către prima postare (Permalink)
        console.log("Căutăm link-ul către prima postare...");
        const firstPost = page.locator('div[role="article"]').first();
        
        // Link-ul este de obicei pe timestamp (data/ora)
        const postLinkElement = firstPost.locator('a[href*="/posts/"], a[href*="/permalink/"], a[href*="/videos/"], a[href*="pfbid"]').first();
        let postUrl = await postLinkElement.getAttribute('href');
        
        if (!postUrl) {
            console.log("Nu am putut găsi link-ul direct. Plan B: Extragere directă...");
        } else {
            // Transformăm link-ul în URL complet dacă e nevoie
            if (postUrl.startsWith('/')) postUrl = 'https://www.facebook.com' + postUrl;
            console.log(`Mergem pe pagina directă a postării: ${postUrl}`);
            await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(4000);
        }

        // Pasul 2: Extragem textul (pe pagina directă este mult mai ușor de luat complet)
        let text = await page.locator('div[data-ad-comet-preview="message"]').first().innerText().catch(() => null);
        if (!text) text = await page.locator('div[dir="auto"]').first().innerText().catch(() => null);

        if (!text) {
            console.log("Nu am găsit textul postării.");
            return;
        }

        // Pasul 3: Extragem imaginea
        // Pe pagina directă, prima imagine mare este de obicei cea dorită
        const image = await page.locator('img[alt*="imagine"], img[src*="scontent"]').first();
        const imageUrl = image ? await image.getAttribute('src') : '';

        const title = text.split(/\s+/).slice(0, 10).join(' ') + '...';
        console.log(`Date extrase cu succes! Titlu: ${title}`);

        // Pasul 4: Trimitem către WordPress
        console.log("Trimit ddatele către WordPress...");
        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: text,
            image_url: imageUrl
        }, {
            headers: {
                'X-API-KEY': API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 60000 // Așteptăm un minut pentru descărcarea pozei pe WP
        });

        console.log('Răspuns WordPress:', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
