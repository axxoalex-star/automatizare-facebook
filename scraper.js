const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

(async () => {
    console.log(`Pornesc scriptul de scraping...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(10000); 

        // Curătăm orice banner de login
        await page.evaluate(() => {
            const bad = document.querySelectorAll('div[role="dialog"], div[id^="login_mount"], [aria-label="Închide"], [aria-label="Close"]');
            bad.forEach(el => el.remove());
            document.body.style.overflow = 'auto';
        });

        console.log("Extindem textul postării...");
        const firstPost = page.locator('div[role="article"]').first();
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (article) {
                const buttons = Array.from(article.querySelectorAll('div[role="button"], span[role="button"], div[dir="auto"]'));
                const seeMore = buttons.find(b => b.innerText.includes('See more') || b.innerText.includes('Vezi mai mult'));
                if (seeMore) seeMore.click();
            }
        });
        await page.waitForTimeout(4000);

        let text = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return null;
            const msg = article.querySelector('div[data-ad-comet-preview="message"]');
            return msg ? msg.innerText.replace(/... See more/g, '').replace(/... Vezi mai mult/g, '').trim() : null;
        });

        if (!text) text = await firstPost.locator('div[dir="auto"]').first().innerText().catch(() => "Postare fara text");

        const image = await firstPost.locator('img').first();
        const imageUrl = image ? await image.getAttribute('src') : '';
        const title = text.split(/\s+/).slice(0, 10).join(' ') + '...';

        console.log(`Trimitere rapidă către WordPress...`);

        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: text,
            image_url: imageUrl
        }, {
            headers: { 'X-API-KEY': API_KEY },
            timeout: 300000 // 5 Minute (Securitate)
        });

        console.log('Succes Total! Postarea a fost facută.', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
