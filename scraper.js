const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const API_KEY = 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';
const WP_ENDPOINT = `https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post?api_key=${API_KEY}`;

(async () => {
    console.log(`Pornesc scriptul v2.5 (High-Speed Screenshot Sync)...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1000, height: 1000 } // Viewport mai mic pentru screenshot mai mic
    });
    const page = await context.newPage();

    try {
        console.log(`Navigăm la Facebook...`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        
        await page.evaluate(() => {
            const closeBtn = document.querySelector('div[aria-label="Închide"], div[aria-label="Close"], [id^="login_mount"] div[role="button"]');
            if (closeBtn) closeBtn.click();
            document.querySelectorAll('div[id^="login_mount"]').forEach(el => el.remove());
        });

        await page.waitForTimeout(5000);

        const firstPost = page.locator('div[role="article"]').first();
        await firstPost.scrollIntoViewIfNeeded();

        // Expansiune
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('div[role="button"], span')).find(b => b.innerText.includes('Vezi mai mult') || b.innerText.includes('See more'));
            if (btn) btn.click();
        });
        await page.waitForTimeout(3000);

        // Screenshot mic și rapid
        console.log("Capturăm screenshot-ul...");
        const screenshotPath = 'post.jpg';
        await firstPost.screenshot({ path: screenshotPath, type: 'jpeg', quality: 60 }); // Calitate redusă pt viteză

        const text = await page.evaluate(() => {
            const msg = document.querySelector('div[data-ad-comet-preview="message"]');
            return msg ? msg.innerText.replace(/See more|Vezi mai mult/g, '').trim() : "Postare Facebook";
        });

        const title = text.slice(0, 80) + '...';

        // Trimitere cu timeout mărit la 5 minute
        console.log("Trimitere către WordPress (Timeout 5 min)...");
        const form = new FormData();
        form.append('title', title);
        form.append('content', text);
        form.append('image', fs.createReadStream(screenshotPath));

        const response = await axios.post(WP_ENDPOINT, form, {
            headers: { ...form.getHeaders() },
            timeout: 300000 // 5 minute
        });

        console.log('Succes!', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
