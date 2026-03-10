const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

(async () => {
    console.log(`Pornesc scriptul de scraping...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
        console.log(`Accesăm pagina: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000); 

        // Eliminăm orice fereastră de Login sau Cookies care acoperă ecranul
        await page.evaluate(() => {
            const selectors = ['div[role="dialog"]', 'div[id^="login_mount"]', 'div.x9f619.x78zum5.xdt5ytf.xl56j7k'];
            selectors.forEach(s => {
                document.querySelectorAll(s).forEach(el => el.remove());
            });
            document.body.style.overflow = 'auto'; // Deblocăm scroll-ul
        });

        console.log("Căutăm prima postare...");
        const firstPost = page.locator('div[role="article"]').first();
        await firstPost.waitFor({ timeout: 15000 });

        // Căutăm butonul "Vezi mai mult" și îi dăm click forțat prin cod (nu cursor)
        const seeMore = firstPost.locator('text="Vezi mai mult"').or(firstPost.locator('text="See more"')).first();
        if (await seeMore.isVisible()) {
            console.log("Am găsit butonul de expansiune. Extindem textul...");
            await seeMore.click({ force: true }).catch(() => {});
            await page.waitForTimeout(2000);
        }

        // Extragem textul complet folosind selectorul de mesaj
        let text = await firstPost.locator('div[data-ad-comet-preview="message"]').innerText().catch(() => null);
        if (!text) text = await firstPost.locator('div[dir="auto"]').first().innerText().catch(() => null);

        if (!text) {
            console.log("Eroare: Nu am putut extrage textul.");
            return;
        }

        // Extragem imaginea
        const image = await firstPost.locator('img').first();
        const imageUrl = image ? await image.getAttribute('src') : '';

        const title = text.split(/\s+/).slice(0, 8).join(' ') + '...';
        console.log(`Gata! Titlu extras: ${title}`);

        // TRIMITEM CĂTRE WORDPRESS CU RETRY (Re-încercare în caz de timeout)
        let success = false;
        let attempts = 0;
        while (!success && attempts < 3) {
            try {
                attempts++;
                console.log(`Trimitere către WordPress (Încercarea ${attempts})...`);
                const response = await axios.post(WP_ENDPOINT, {
                    title: title,
                    content: text,
                    image_url: imageUrl
                }, {
                    headers: { 'X-API-KEY': API_KEY },
                    timeout: 60000 // Așteptăm un minut
                });
                console.log('Succes WordPress:', response.data);
                success = true;
            } catch (err) {
                console.error(`Eșec la trimitere: ${err.message}`);
                if (attempts < 3) await new Promise(r => setTimeout(r, 5000)); // Așteptăm 5 secunde înainte de re-încercare
            }
        }

    } catch (error) {
        console.error('Eroare Generală:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
