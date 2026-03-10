const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const API_KEY = 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';
const WP_ENDPOINT = `https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post?api_key=${API_KEY}`;

(async () => {
    console.log(`Pornesc scriptul v2.2 (Data Extraction Fix)...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
        console.log(`Accesăm Facebook: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(10000); 

        // --- EXTRAGERE TEXT COMPLETĂ ---
        const data = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return null;

            // Apăsăm toate butoanele de expandare text
            const buttons = Array.from(article.querySelectorAll('div, span, a')).filter(el => 
                el.innerText === 'See more' || el.innerText === 'Vezi mai mult' || el.innerText.includes('... See more')
            );
            buttons.forEach(b => b.click());

            // Căutăm imaginea mare de postare
            const imgs = Array.from(article.querySelectorAll('img'));
            // Filtrăm imaginile: să fie scontent, să nu fie profil (mici), să nu fie emoji
            const mainImg = imgs.find(img => {
                const src = img.src || '';
                const rect = img.getBoundingClientRect();
                return src.includes('scontent') && rect.width > 300 && !src.includes('emoji.php');
            });

            // Căutăm containerul de mesaj
            const msg = article.querySelector('div[data-ad-comet-preview="message"]');
            
            return {
                text: msg ? msg.innerText.replace(/See more|Vezi mai mult/g, '').trim() : article.innerText.slice(0, 500),
                imageUrl: mainImg ? mainImg.src : ""
            };
        });

        if (!data || !data.text) {
            console.log("Nu am putut extrage datele.");
            return;
        }

        const title = data.text.split(/\s+/).slice(0, 10).join(' ') + '...';
        console.log(`Date Extrase: Titlu: ${title}, Imagine: ${data.imageUrl ? 'GASITA' : 'LIPSA'}`);

        // --- TRIMITERE CĂTRE WP ---
        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: data.text,
            image_url: data.imageUrl
        }, { timeout: 40000 });

        console.log('Succes:', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
