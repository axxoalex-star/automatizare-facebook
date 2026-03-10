const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/PAGINA.TA'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://siteul.tau.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

(async () => {
    console.log(`Pornesc scriptul de scraping pentru: ${FB_PAGE_URL}`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
        await page.goto(FB_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000); 

        const closeLoginBanner = page.locator('div[role="dialog"] div[aria-label="Close"], div[aria-label="Închide"]').first();
        if (await closeLoginBanner.isVisible()) {
            await closeLoginBanner.click().catch(() => {});
        }

        const firstPost = await page.locator('div[role="article"]').first();
        
        const seeMoreButton = firstPost.locator('text="Vezi mai mult"').or(firstPost.locator('text="See more"'));
        if (await seeMoreButton.isVisible()) {
            console.log("Am gasit butonul 'Vezi mai mult', expandez textul (Force Click)...");
            await seeMoreButton.dispatchEvent('click'); 
            await page.waitForTimeout(2000);
        }

        let text = await firstPost.locator('div[data-ad-comet-preview="message"]').first().innerText().catch(() => null);
        if (!text) text = await firstPost.locator('div[dir="auto"]').first().innerText().catch(() => null);
        
        if (!text) {
            console.log("Nu am gasit text.");
            return;
        }

        const image = await firstPost.locator('img').first();
        const imageUrl = image ? await image.getAttribute('src') : '';
        const title = text.split(/\s+/).slice(0, 8).join(' ') + '...';

        console.log(`Am gasit postarea. Trimit datele catre WP...`);
        
        // --- MODIFICAT: Axios cu timeout mai mare si User-Agent ---
        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: text,
            image_url: imageUrl
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': API_KEY,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            },
            timeout: 90000 // Asteptam pana la 90 de secunde (WP descarca imaginea in acest timp)
        });

        console.log('Raspuns receptor WP:', response.data);

    } catch (error) {
        if (error.code === 'ETIMEDOUT') {
            console.error('Eroare: Serverul WordPress nu a raspuns la timp. Verificati daca IP-ul GitHub este blocat de un modul de securitate (ex: Wordfence).');
        } else {
            console.error('Eroare in timpul procesului:', error.message);
        }
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
