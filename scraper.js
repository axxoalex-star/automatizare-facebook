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
        viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    try {
        console.log(`Accesăm pagina: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(10000); // Așteptăm să se încarce tot feed-ul

        // Curățăm ferestrele de login/cookies care blochează ecranul
        await page.evaluate(() => {
            const badOnes = document.querySelectorAll('div[role="dialog"], div[id^="login_mount"], [aria-label="Închide"], [aria-label="Close"]');
            badOnes.forEach(el => el.remove());
            document.body.style.overflow = 'auto';
        });

        console.log("Căutăm și extindem prima postare...");
        
        // Identificăm prima postare
        const firstPost = page.locator('div[role="article"]').first();
        
        // Căutăm butonul "See more" sau "Vezi mai mult" în interiorul postării
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (article) {
                // Căutăm toate elementele care pot fi butoane de expandare
                const buttons = Array.from(article.querySelectorAll('div[role="button"], span[role="button"], div[dir="auto"]'));
                const seeMore = buttons.find(b => b.innerText.includes('See more') || b.innerText.includes('Vezi mai mult'));
                if (seeMore) {
                    seeMore.click();
                    console.log("Click pe expandare efectuat.");
                }
            }
        });

        await page.waitForTimeout(3000); // Așteptăm să se extindă textul

        // Extragem textul final
        let text = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return null;
            
            // Încercăm selectorul specific de mesaj
            const msgContainer = article.querySelector('div[data-ad-comet-preview="message"]');
            if (msgContainer) {
                let fullText = msgContainer.innerText;
                // Ștergem manual "See more" sau "Vezi mai mult" dacă a rămas în text
                fullText = fullText.replace(/... See more/g, '').replace(/... Vezi mai mult/g, '').replace(/See more/g, '').replace(/Vezi mai mult/g, '');
                return fullText.trim();
            }
            return article.innerText; // Fallback
        });

        if (!text || text.length < 10) {
            console.log("Nu am găsit text valid.");
            return;
        }

        // Extragem imaginea de rezoluție mare
        const imageUrl = await firstPost.locator('img').first().getAttribute('src').catch(() => '');

        const title = text.split(/\s+/).slice(0, 10).join(' ') + '...';
        console.log(`Date pregătite! Titlu: ${title}`);

        // Trimitere către WordPress cu sistem de siguranță
        console.log("Trimitere către WordPress...");
        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: text,
            image_url: imageUrl
        }, {
            headers: { 'X-API-KEY': API_KEY },
            timeout: 60000 
        });

        console.log('Succes! Postarea a fost actualizată pe site.', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
