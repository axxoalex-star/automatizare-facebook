const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// DATELE DE CONFIGURARE (Folosește Secretele din GitHub pentru acestea)
const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_USER = process.env.WP_USER || 'axxo'; // Nume utilizator WordPress
const WP_APP_PASS = process.env.WP_APP_PASS || ''; // Parola de aplicație (fără spații)
const WP_URL = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/support/v1/update';

(async () => {
    console.log(`Pornesc v3.0 (Auth Camouflage Mode)...`);
    
    if (!WP_APP_PASS) {
        console.error("EROARE: Lipsește WP_APP_PASS. Configurează secretul în GitHub!");
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: true });
    // User agent real pentru a evita detectarea ca bot de către Facebook
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1000, height: 1200 }
    });
    const page = await context.newPage();

    try {
        console.log(`Navigăm la Facebook: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        
        // Curățare UI (eliminăm bannere de login care pot acoperi postarea)
        await page.evaluate(() => {
            const selectors = ['div[role="dialog"]', 'div[id^="login_mount"]', 'div[aria-label="Închide"]'];
            selectors.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
            document.body.style.overflow = 'auto';
        });

        await page.waitForTimeout(5000);

        const firstPost = page.locator('div[role="article"]').first();
        await firstPost.scrollIntoViewIfNeeded();

        // Expandare "Vezi mai mult"
        console.log("Expandăm textul postării...");
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return;
            const btn = Array.from(article.querySelectorAll('div[role="button"], span')).find(b => 
                b.innerText.includes('Vezi mai mult') || b.innerText.includes('See more')
            );
            if (btn) btn.click();
        });
        await page.waitForTimeout(4000);

        // Screenshot postare
        console.log("Capturăm screenshot-ul...");
        const screenshotPath = 'post.jpg';
        await firstPost.screenshot({ path: screenshotPath, type: 'jpeg', quality: 75 });

        // Extragere text
        const textData = await page.evaluate(() => {
            const msg = document.querySelector('div[data-ad-comet-preview="message"]');
            return msg ? msg.innerText.replace(/See more|Vezi mai mult/gi, '').trim() : "";
        });

        if (!textData) throw new Error("Nu am putut extrage textul postării.");

        const title = textData.split('\n')[0].slice(0, 90) + '...';

        // Trimitere către WordPress folosind Autentificarea Nativă (Application Password)
        console.log("Trimitere către WordPress (Camouflage Auth)...");
        
        const form = new FormData();
        form.append('title', title);
        form.append('content', textData);
        form.append('image', fs.createReadStream(screenshotPath));

        const auth = Buffer.from(`${WP_USER}:${WP_APP_PASS.replace(/\s+/g, '')}`).toString('base64');

        const response = await axios.post(WP_URL, form, {
            headers: { 
                ...form.getHeaders(),
                'Authorization': `Basic ${auth}`
            },
            timeout: 120000 // 2 minute
        });

        console.log('Succes v3.0:', response.data);

    } catch (error) {
        console.error('Eroare la procesare:', error.message);
        if (error.response) console.error('Status Server:', error.response.status, error.response.data);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
