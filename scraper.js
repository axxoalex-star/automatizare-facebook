const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

(async () => {
    console.log(`Pornesc scriptul v1.7 (Fast Sync)...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' });
    const page = await context.newPage();

    try {
        await page.goto(FB_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(10000); 

        // Încercăm să dăm click pe orice buton de expansiune
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"], span')).filter(el => 
                el.innerText.includes('See more') || el.innerText.includes('Vezi mai mult')
            );
            if (buttons.length > 0) buttons[0].click();
        });
        await page.waitForTimeout(4000);

        const firstPost = page.locator('div[role="article"]').first();
        
        // Extragem textul și curățăm manual "See more"
        let text = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            const msg = article ? article.querySelector('div[data-ad-comet-preview="message"]') : null;
            if (!msg) return "";
            return msg.innerText.split('See more')[0].split('Vezi mai mult')[0].trim();
        });

        // IMAGINE: Căutăm orice imagine mare (peste 300px) sau scontent
        const imageUrl = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return "";
            const imgs = Array.from(article.querySelectorAll('img'));
            const main = imgs.find(i => i.src.includes('scontent') && i.width > 250);
            return main ? main.src : (imgs[1] ? imgs[1].src : (imgs[0] ? imgs[0].src : ""));
        });

        const title = text.split(/\s+/).slice(0, 10).join(' ') + '...';
        console.log(`Trimitere către WordPress (Timeout mărit la 3 minute)...`);

        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: text,
            image_url: imageUrl
        }, {
            headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
            timeout: 180000 // 3 minute
        });

        console.log('Rezultat:', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
