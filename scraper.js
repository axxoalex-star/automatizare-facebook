const { chromium } = require('playwright');
const axios = require('axios');

// Configurarea link-urilor - SE POT PRELUA DIN GitHub Secrets sau pune manual pentru testare
const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/PAGINA.TA'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://siteul.tau.ro/wp-json/fb-sync/v1/post'; 

const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

(async () => {
    console.log(`Pornesc scriptul de scraping pentru: ${FB_PAGE_URL}`);
    const browser = await chromium.launch({ headless: true });
    
    // Simulam un browser normal pentru a nu fi detectati prea repede de Facebook
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
        await page.goto(FB_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000); // Asteptam ca React/Facebook sa randeze feed-ul

        // Cautam containerul unei postari. Facebook foloseste de regula role="article"
        const firstPost = await page.locator('div[role="article"]').first();
        
        // --- NOU: Incercam sa expandam textul daca exista butonul "Vezi mai mult" ---
        const seeMoreButton = firstPost.locator('text="Vezi mai mult"').or(firstPost.locator('text="See more"'));
        if (await seeMoreButton.isVisible()) {
            console.log("Am gasit butonul 'Vezi mai mult', expandez textul...");
            await seeMoreButton.click();
            await page.waitForTimeout(2000); // Asteptam expansion-ul
        }

        // Cautam textul. Dupa expandare, cautam containerul principal de mesaj.
        let text = await firstPost.locator('div[data-ad-comet-preview="message"]').first().innerText().catch(() => null);
        
        // Fallback daca nu gasim selectorul specific
        if (!text) {
            text = await firstPost.locator('div[dir="auto"]').first().innerText().catch(() => null);
        }
        
        if (!text) {
            console.log("Nu am gasit text sau Facebook si-a modificat design-ul (DOM).");
            return;
        }

        // Cautam prima imagine atasata postarii
        const image = await firstPost.locator('img').first();
        const imageUrl = image ? await image.getAttribute('src') : '';

        // Generam un titlu din primele cuvinte din continut
        const title = text.split(' ').slice(0, 8).join(' ') + '...';

        console.log(`Am gasit postarea. Titlu dedus: "${title}"`);
        
        // Trimitem payload-ul via Axios la receptorul din WordPress
        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: text,
            image_url: imageUrl
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': API_KEY 
            }
        });

        console.log('Raspuns receptor WP:', response.data);

    } catch (error) {
        console.error('Eroare in timpul procesului:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
