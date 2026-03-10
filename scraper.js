const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

(async () => {
    console.log(`Pornesc scriptul de scraping...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    try {
        console.log(`Accesăm pagina: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(8000); 

        // Ștergem bannerele de login care pot bloca interactiunea
        await page.evaluate(() => {
            const overlays = document.querySelectorAll('div[role="dialog"], div[id^="login_mount"], [aria-label="Închide"], [aria-label="Close"]');
            overlays.forEach(el => el.remove());
            document.body.style.overflow = 'auto';
        });

        console.log("Căutăm și extindem prima postare...");
        const firstPost = page.locator('div[role="article"]').first();
        
        // Expandăm textul prin Click direct în browser
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (article) {
                const buttons = Array.from(article.querySelectorAll('div[role="button"], span[role="button"], div[dir="auto"]'));
                const seeMore = buttons.find(b => b.innerText.includes('See more') || b.innerText.includes('Vezi mai mult'));
                if (seeMore) seeMore.click();
            }
        });

        await page.waitForTimeout(4000); // Timp extra pentru extindere

        let text = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return null;
            const msg = article.querySelector('div[data-ad-comet-preview="message"]');
            if (msg) {
                return msg.innerText.replace(/... See more/g, '').replace(/... Vezi mai mult/g, '').trim();
            }
            return null;
        });

        if (!text) {
            console.log("Plan B: Extragere text prin selector alternativ...");
            text = await firstPost.locator('div[dir="auto"]').first().innerText().catch(() => null);
        }

        const image = await firstPost.locator('img').first();
        const imageUrl = image ? await image.getAttribute('src') : '';

        const title = text.split(/\s+/).slice(0, 10).join(' ') + '...';
        console.log(`Date pregătite! Trimitere către WordPress (Timeout mărit la 2 min)...`);

        // TRIMITERE CU TIMEOUT DE 120 DE SECUNDE
        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: text,
            image_url: imageUrl
        }, {
            headers: { 'X-API-KEY': API_KEY },
            timeout: 120000 // 2 minute pentru a permite WP să descarce poza
        });

        console.log('Succes! WordPress a răspuns:', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
