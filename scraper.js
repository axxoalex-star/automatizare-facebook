const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://siteul.tau.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

(async () => {
    console.log(`Pornesc scriptul de scraping cu User-Agent: ${UA}`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: UA,
        viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    try {
        console.log(`Accesăm Facebook: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(10000); 

        // Gestionare Popups: Curătăm orice banner care poate bloca vizibilitatea
        await page.evaluate(() => {
            const badElements = [
                'div[role="dialog"]', 
                'div[id^="login_mount"]', 
                '[aria-label="Închide"]', 
                '[aria-label="Close"]', 
                '#facebook:not(.can_go_back) .fb_iframe_widget'
            ];
            badElements.forEach(s => {
                document.querySelectorAll(s).forEach(el => el.remove());
            });
            document.body.style.overflow = 'auto'; // Re-activăm scroll-ul dacă e blocat
        });

        console.log("Căutăm prima postare și extindem textul...");
        const firstPost = page.locator('div[role="article"]').first();
        
        // Expandare text "See more"
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (article) {
                const buttons = Array.from(article.querySelectorAll('div[role="button"], span[role="button"], div[dir="auto"]'));
                const seeMore = buttons.find(b => b.innerText.includes('See more') || b.innerText.includes('Vezi mai mult'));
                if (seeMore) seeMore.click();
            }
        });
        await page.waitForTimeout(4000);

        // Extragem textul curat
        let text = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return null;
            const msg = article.querySelector('div[data-ad-comet-preview="message"]');
            if (msg) {
                return msg.innerText.replace(/... See more/g, '').replace(/... Vezi mai mult/g, '').trim();
            }
            return null;
        });

        if (!text) text = await firstPost.locator('div[dir="auto"]').first().innerText().catch(() => "Postare fara text");

        // Selectori Imagine Inteligenți: Căutăm poze scontent pe Facebook
        console.log("Căutăm imaginea principală (scontent)...");
        const allImages = await firstPost.locator('img').all();
        let imageUrl = '';
        for (const img of allImages) {
            const src = await img.getAttribute('src');
            if (src && src.includes('scontent') && !src.includes('emoji.php')) {
                imageUrl = src;
                break;
            }
        }
        if (!imageUrl && allImages.length > 0) {
            imageUrl = await allImages[0].getAttribute('src');
        }

        const title = text.split(/\s+/).slice(0, 10).join(' ') + '...';
        console.log(`Date pregătite. Trimitere către WordPress: ${WP_ENDPOINT}`);

        // Trimitere către WordPress cu Logging Detaliat și Anti-Blocking headers
        try {
            const response = await axios.post(WP_ENDPOINT, {
                title: title,
                content: text,
                image_url: imageUrl
            }, {
                headers: { 
                    'X-API-KEY': API_KEY,
                    'User-Agent': UA,
                    'Content-Type': 'application/json'
                },
                timeout: 300000 // 5 Minute
            });
            console.log('RĂSPUNS SERVER WP:', response.status, response.data);
        } catch (axiosError) {
            console.error('--- EROARE AXIOS DETALIATĂ ---');
            if (axiosError.response) {
                console.error(`Status: ${axiosError.response.status}`);
                console.error(`Mesaj: ${JSON.stringify(axiosError.response.data)}`);
            } else if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
                console.error('TIMED OUT: Serverul nu a răspuns în 5 minute. Verificați Firewall-ul (Wordfence/Cloudflare).');
            } else {
                console.error(`Cod Eroare: ${axiosError.code}`);
                console.error(`Mesaj: ${axiosError.message}`);
            }
            process.exit(1);
        }

    } catch (error) {
        console.error('EROARE SCRAPING:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
