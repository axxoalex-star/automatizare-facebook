const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

(async () => {
    console.log(`Pornesc scriptul de scraping v1.5 (Suport Video/Foto)...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    try {
        console.log(`Accesăm Facebook: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(10000); 

        // Curătăm UI-ul de blocaje
        await page.evaluate(() => {
            document.querySelectorAll('div[role="dialog"], div[id^="login_mount"], [aria-label="Închide"]').forEach(el => el.remove());
            document.body.style.overflow = 'auto';
        });

        const firstPost = page.locator('div[role="article"]').first();
        await firstPost.scrollIntoViewIfNeeded();

        // EXPANDARE TEXT
        console.log("Extindem textul...");
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (article) {
                const buttons = Array.from(article.querySelectorAll('div[role="button"], span[role="button"], div[dir="auto"]'));
                const seeMore = buttons.find(b => b.innerText.includes('See more') || b.innerText.includes('Vezi mai mult'));
                if (seeMore) seeMore.click();
            }
        });
        await page.waitForTimeout(5000);

        // EXTRAGERE TEXT
        let fullText = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return null;
            const msg = article.querySelector('div[data-ad-comet-preview="message"]');
            if (msg) return msg.innerText.replace(/\.\.\. See more/g, '').replace(/\.\.\. Vezi mai mult/g, '').trim();
            const fallbacks = Array.from(article.querySelectorAll('div[dir="auto"]')).map(n => n.innerText).filter(t => t.length > 5);
            return fallbacks.length > 0 ? fallbacks[0] : null;
        });

        // --- EXTRAGERE IMAGINE SAU PREVIEW VIDEO ---
        console.log("Căutăm imaginea sau preview-ul video...");
        const imageUrl = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return '';
            
            // 1. Căutăm poze în tag-uri img (atât foto cât și preview video)
            const imgs = Array.from(article.querySelectorAll('img'));
            
            // Căutăm imaginea principală: scontent, dimensiune mare, nu e profil
            const mainImg = imgs.find(img => {
                const src = img.src || '';
                const width = img.naturalWidth || img.width || 0;
                // Excludem iconițe mici și poze de profil (care au de obicei 'cp' în URL sau 'profile' în alt)
                return src.includes('scontent') && width > 250 && !src.includes('emoji.php');
            });

            if (mainImg) return mainImg.src;

            // 2. Plan B: Căutăm în tag-uri video dacă există un poster/thumb
            const video = article.querySelector('video');
            if (video && video.poster) return video.poster;

            // 3. Plan C: Căutăm orice imagine mare care nu e avatar
            const potential = imgs.filter(img => (img.width > 300 || img.naturalWidth > 300));
            return potential.length > 0 ? potential[potential.length - 1].src : '';
        });

        const title = fullText ? (fullText.split(/\s+/).slice(0, 10).join(' ') + '...') : "Postare Facebook";
        console.log(`Rezultat: Text (${fullText?.length || 0} char), Imagine: ${imageUrl ? 'Găsită' : 'Lipsă'}`);

        // TRIMITERE
        await axios.post(WP_ENDPOINT, {
            title: title,
            content: fullText || "Conținut indisponibil",
            image_url: imageUrl
        }, {
            headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
            timeout: 60000
        });

        console.log('Succes!');

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
