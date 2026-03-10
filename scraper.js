const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_ENDPOINT = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post'; 
const API_KEY = process.env.API_KEY || 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

(async () => {
    console.log(`Pornesc scriptul de scraping v1.4...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    try {
        console.log(`Accesăm Facebook: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(10000); 

        // Curățăm elementele de login
        await page.evaluate(() => {
            document.querySelectorAll('div[role="dialog"], div[id^="login_mount"], [aria-label="Închide"]').forEach(el => el.remove());
            document.body.style.overflow = 'auto';
        });

        console.log("Căutăm prima postare...");
        const firstPost = page.locator('div[role="article"]').first();
        await firstPost.scrollIntoViewIfNeeded();

        // --- EXPANDARE TEXT ---
        console.log("Încercăm expandarea textului...");
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (article) {
                const buttons = Array.from(article.querySelectorAll('div[role="button"], span[role="button"], div[dir="auto"]'));
                const seeMore = buttons.find(b => b.innerText === 'See more' || b.innerText === 'Vezi mai mult' || b.innerText.includes('... See more'));
                if (seeMore) {
                    seeMore.scrollIntoView();
                    seeMore.click();
                }
            }
        });

        // Așteptăm ca textul să se schimbe (să se lungească)
        await page.waitForTimeout(5000);

        // --- EXTRAGERE TEXT COMPLET ---
        let fullText = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return null;
            
            // Căutăm containerul de mesaj
            const msg = article.querySelector('div[data-ad-comet-preview="message"]');
            if (msg) {
                return msg.innerText.replace(/\.\.\. See more/g, '').replace(/\.\.\. Vezi mai mult/g, '').trim();
            }
            
            // Plan B: Toate div-urile cu text din articol care nu sunt headere
            const textNodes = Array.from(article.querySelectorAll('div[dir="auto"]'));
            return textNodes.map(n => n.innerText).join('\n').trim();
        });

        if (!fullText || fullText.length < 5) {
            console.log("Eroare: Nu am putut lua textul.");
            return;
        }

        // --- EXTRAGERE IMAGINE ---
        console.log("Căutăm imaginea postării...");
        const imageUrl = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return '';
            
            // Căutăm toate imaginile și o luăm pe cea care pare a fi conținutul (cea mai mare sau scontent)
            const imgs = Array.from(article.querySelectorAll('img'));
            const contentImg = imgs.find(img => {
                const src = img.src || '';
                const width = img.width || 0;
                return src.includes('scontent') && width > 200 && !src.includes('emoji.php');
            });
            
            return contentImg ? contentImg.src : (imgs[1] ? imgs[1].src : ''); // Prima e de obicei profilul, a doua e postarea
        });

        const title = fullText.split(/\s+/).slice(0, 10).join(' ') + '...';
        console.log(`Date Pregătite: Text lungime ${fullText.length}, Imagine gasita: ${imageUrl ? 'DA' : 'NU'}`);

        // --- TRIMITERE WP ---
        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: fullText,
            image_url: imageUrl
        }, {
            headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
            timeout: 60000
        });

        console.log('Finalizat:', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
