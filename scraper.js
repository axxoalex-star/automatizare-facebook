const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const API_KEY = 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';
const WP_ENDPOINT = `https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post?api_key=${API_KEY}`;

(async () => {
    console.log(`Pornesc scriptul v2.4 (Ultra-Stable Screenshot Method)...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 1200 } // Viewport înalt pentru a prinde postarea
    });
    const page = await context.newPage();

    try {
        console.log(`Navigăm la Facebook...`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        
        // Închidem orice popup de login
        await page.evaluate(() => {
            const closeBtn = document.querySelector('div[aria-label="Închide"], div[aria-label="Close"], [id^="login_mount"] div[role="button"]');
            if (closeBtn) closeBtn.click();
            // Eliminăm overlay-urile care blochează scroll-ul
            document.querySelectorAll('div[id^="login_mount"]').forEach(el => el.remove());
            document.body.style.overflow = 'auto';
        });

        await page.waitForTimeout(5000);

        const firstPost = page.locator('div[role="article"]').first();
        await firstPost.scrollIntoViewIfNeeded();

        // --- EXPANDARE TEXT ---
        console.log("Expandăm textul...");
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return;
            const buttons = Array.from(article.querySelectorAll('div[role="button"], span[role="button"]'));
            const seeMore = buttons.find(b => b.innerText.includes('Vezi mai mult') || b.innerText.includes('See more'));
            if (seeMore) seeMore.click();
        });
        await page.waitForTimeout(3000);

        // --- EXTRAGERE DATE ȘI SCREENSHOT ---
        console.log("Capturăm imaginea postării (Screenshot)...");
        const screenshotPath = 'post_image.jpg';
        // Facem screenshot doar la containerul postării (perfect pentru video!)
        await firstPost.screenshot({ path: screenshotPath, type: 'jpeg', quality: 90 });

        const postData = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            const msgBox = article ? article.querySelector('div[data-ad-comet-preview="message"]') : null;
            let text = msgBox ? msgBox.innerText : (article ? article.innerText.slice(0, 500) : "");
            return {
                text: text.replace(/See more|Vezi mai mult/gi, '').trim()
            };
        });

        const title = postData.text.split('\n')[0].slice(0, 90) + '...';

        // --- TRIMITERE WP (Multipart pentru imagine) ---
        console.log("Trimitere date + imagine către WordPress...");
        
        const form = new FormData();
        form.append('title', title);
        form.append('content', postData.text);
        form.append('image', fs.createReadStream(screenshotPath));

        const response = await axios.post(WP_ENDPOINT, form, {
            headers: { ...form.getHeaders() },
            timeout: 60000 
        });

        console.log('Succes Total! WordPress a răspuns:', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        if (error.response) console.error('Răspuns server:', error.response.data);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
