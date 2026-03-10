const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const API_KEY = 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';
// Adaugam cheia direct in URL pentru a pacali Firewall-ul
const WP_ENDPOINT = `https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post?api_key=${API_KEY}`;

(async () => {
    console.log(`Pornesc scriptul v2.1 (Anti-Firewall Sync)...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' });
    const page = await context.newPage();

    try {
        // --- PASUL 1: TEST DE CONEXIUNE ---
        console.log("Testez dacă ușa serverului este deschisă...");
        try {
            const test = await axios.get(WP_ENDPOINT, { timeout: 10000 });
            console.log("Serverul a raspuns: ", test.data.message);
        } catch (e) {
            console.log("ATENȚIE: Serverul nu a răspuns la testul rapid. Probabil IP-ul GitHub este blocat.");
        }

        // --- PASUL 2: SCRAPING FACEBOOK ---
        await page.goto(FB_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(10000); 

        const text = await page.evaluate(() => {
            const msg = document.querySelector('div[data-ad-comet-preview="message"]');
            return msg ? msg.innerText.split('See more')[0].trim() : "Postare Facebook";
        });

        const imageUrl = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img')).filter(i => i.src.includes('scontent'));
            return imgs.find(i => i.width > 250)?.src || "";
        });

        const title = text.slice(0, 50) + '...';

        // --- PASUL 3: TRIMITERE DATE ---
        console.log("Trimit datele finale către WordPress...");
        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: text,
            image_url: imageUrl
        }, { timeout: 30000 });

        console.log('Succes Total!', response.data);

    } catch (error) {
        console.error('Eroare Finală:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
