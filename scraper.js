const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

(async () => {
    console.log(`Pornesc scriptul v2.0 (Ultra Fast Embed Sync)...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' });
    const page = await context.newPage();

    try {
        await page.goto(FB_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(10000); 

        // Fortam afisarea textului ascuns
        await page.evaluate(() => {
            document.querySelectorAll('div[role="dialog"], div[id^="login_mount"]').forEach(e => e.remove());
            const hiddenElements = document.querySelectorAll('span[style*="display: none"], div[style*="display: none"]');
            hiddenElements.forEach(s => s.style.display = 'inline');
        });

        const firstPost = page.locator('div[role="article"]').first();
        
        // Extragem textul fara mizeriile de "See more"
        let text = await page.evaluate(() => {
            const msg = document.querySelector('div[data-ad-comet-preview="message"]');
            if (!msg) return "";
            return msg.innerText.split('See more')[0].split('Vezi mai mult')[0].trim();
        });

        // Imagine: O luam pe cea mai mare
        const imageUrl = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return "";
            const imgs = Array.from(article.querySelectorAll('img')).filter(i => i.src.includes('scontent'));
            const main = imgs.find(i => i.width > 250);
            return main ? main.src : (imgs[1] ? imgs[1].src : (imgs[0] ? imgs[0].src : ""));
        });

        const title = text.split(/\s+/).slice(0, 10).join(' ') + '...';
        console.log(`Date pregatite. Trimitere catre WP (Embed Mode)...`);

        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: text,
            image_url: imageUrl
        }, {
            headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
            timeout: 30000 // Acum ar trebui sa raspunda in sub 1 secunda
        });

        console.log('Postat cu succes (Embed):', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
