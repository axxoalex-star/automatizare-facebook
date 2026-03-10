const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

(async () => {
    console.log(`Pornesc scriptul v1.6 (Deep Clean & Featured Image)...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    try {
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(8000); 

        // Eliminăm ferestrele de login
        await page.evaluate(() => {
            document.querySelectorAll('div[role="dialog"], div[id^="login_mount"], [aria-label="Închide"]').forEach(el => el.remove());
        });

        const firstPost = page.locator('div[role="article"]').first();
        
        // --- EXPANDARE AGRESIVA ---
        console.log("Căutăm butonul de expansiune...");
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (article) {
                // Căutăm orice element care conține textul de expandare
                const allElements = Array.from(article.querySelectorAll('div, span, a'));
                const seeMore = allElements.find(el => 
                    (el.innerText === 'See more' || el.innerText === 'Vezi mai mult' || el.innerText.includes('... See more')) 
                    && el.children.length === 0
                );
                if (seeMore) seeMore.click();
            }
        });

        await page.waitForTimeout(5000); // Așteptăm să se încarce textul lung

        // --- EXTRAGERE TEXT ȘI CURĂȚARE ---
        let text = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            const msg = article ? article.querySelector('div[data-ad-comet-preview="message"]') : null;
            if (!msg) return null;
            
            let raw = msg.innerText;
            // Curățăm agresiv orice urmă de "See more"
            return raw.replace(/\.{3}\s*See\s*more/gi, '')
                      .replace(/\.{3}\s*Vezi\s*mai\s*mult/gi, '')
                      .replace(/See\s*more/gi, '')
                      .trim();
        });

        if (!text) text = await firstPost.locator('div[dir="auto"]').first().innerText().catch(() => "");

        // --- EXTRAGERE IMAGINE (FOTO SAU VIDEO) ---
        console.log("Căutăm imaginea principală...");
        const imageUrl = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return '';
            
            const imgs = Array.from(article.querySelectorAll('img'));
            // Căutăm imaginea cea mai probabilă a postării (minim 300px, scontent)
            const main = imgs.find(img => img.src.includes('scontent') && img.width > 300 && !img.src.includes('emoji.php'));
            if (main) return main.src;
            
            // Dacă e video, căutăm poster-ul
            const video = article.querySelector('video');
            if (video && video.getAttribute('poster')) return video.getAttribute('poster');
            
            return imgs.length > 1 ? imgs[1].src : (imgs[0] ? imgs[0].src : '');
        });

        const title = text.split(/\s+/).slice(0, 10).join(' ') + '...';
        console.log(`Gata! Trimitere către WP (Protectie Timeout)...`);

        await axios.post(WP_ENDPOINT, {
            title: title,
            content: text,
            image_url: imageUrl
        }, {
            headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
            timeout: 90000 // Lăsăm 90 de secunde pentru ca WP să descarce poza
        });

        console.log('Succes!');

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
