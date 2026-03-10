const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

(async () => {
    console.log(`Pornesc scriptul v1.8 (Final Fix)...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' });
    const page = await context.newPage();

    try {
        await page.goto(FB_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(10000); 

        // --- TEHNICA NOUA: Afisam tot textul ascuns fara click (Unhide) ---
        await page.evaluate(() => {
            // Dezactivam ferestrele care ne blocheaza
            document.querySelectorAll('div[role="dialog"], div[id^="login_mount"]').forEach(e => e.remove());
            
            // "See more" la Facebook e de fapt un span ascuns. Il facem vizibil forțat.
            const hiddenSpans = document.querySelectorAll('span[style*="display: none"], div[style*="display: none"]');
            hiddenSpans.forEach(s => s.style.display = 'inline');
            
            // Stergem punctele de suspensie si textul "See more" ca sa ramana textul curat
            const buttons = Array.from(document.querySelectorAll('div, span')).filter(el => 
                el.innerText === 'See more' || el.innerText === 'Vezi mai mult' || el.innerText.includes('... See more')
            );
            buttons.forEach(b => b.remove());
        });
        await page.waitForTimeout(2000);

        const firstPost = page.locator('div[role="article"]').first();
        
        // Luam textul curat
        let text = await page.evaluate(() => {
            const msg = document.querySelector('div[data-ad-comet-preview="message"]');
            return msg ? msg.innerText.trim() : "";
        });

        if (!text) text = await firstPost.locator('div[dir="auto"]').first().innerText().catch(() => "");

        // IMAGINE/VIDEO: Cautam cea mai mare poza disponibila
        const imageUrl = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return "";
            const imgs = Array.from(article.querySelectorAll('img')).filter(i => i.src.includes('scontent'));
            // O luam pe cea mai "grasa" poza (minim 300px)
            const main = imgs.find(i => i.width > 300 || i.naturalWidth > 300) || imgs[0];
            return main ? main.src : "";
        });

        const title = text.split(/\s+/).slice(0, 10).join(' ') + '...';
        console.log(`Date Pregatite. Trimitere catre WP (Retry activat pentru Timeout)...`);

        // Incercam trimiterea cu 3 re-incercari daca serverul da Timeout
        let success = false;
        for (let i = 0; i < 3 && !success; i++) {
            try {
                const response = await axios.post(WP_ENDPOINT, {
                    title: title,
                    content: text,
                    image_url: imageUrl
                }, {
                    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
                    timeout: 180000 
                });
                console.log('Succes la WP:', response.data);
                success = true;
            } catch (err) {
                console.log(`Tentativa ${i+1} esuata (${err.code})...`);
                if (err.code === 'ETIMEDOUT') await new Promise(r => setTimeout(r, 5000));
                else break;
            }
        }

    } catch (error) {
        console.error('Eroare Scraper:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
