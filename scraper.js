const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const API_KEY = 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';
const WP_ENDPOINT = `https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post?api_key=${API_KEY}`;

(async () => {
    console.log(`Pornesc scriptul v2.7 (Deep Cleaning & Precise Extraction)...`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1000, height: 1200 }
    });
    const page = await context.newPage();

    try {
        console.log(`Navigăm la Facebook...`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        
        // --- CURĂȚARE AVANSATĂ UI ---
        await page.evaluate(() => {
            // Ștergem bannerele de login, popups și footer-ul de login
            const selectors = [
                'div[role="dialog"]', 
                'div[id^="login_mount"]', 
                'div#rb_8', // Banner login jos uneori
                'div[aria-label="Închide"]',
                '.x9f619.x78zum5.xdt5ytf.x1iyjqo2.x6ikm8r.x10wlt62.x1n2onr6' // Bannerul de jos uneori are clasa asta
            ];
            selectors.forEach(s => {
                document.querySelectorAll(s).forEach(el => el.remove());
            });

            // Găsim "Connect with friends..." banner și îl ștergem
            const spans = Array.from(document.querySelectorAll('span'));
            const loginBanner = spans.find(s => s.innerText.includes('Connect with friends'));
            if (loginBanner) {
                let parent = loginBanner.parentElement;
                while (parent && parent.tagName !== 'BODY') {
                    if (parent.offsetHeight > 100) { parent.remove(); break; }
                    parent = parent.parentElement;
                }
            }
            
            document.body.style.overflow = 'auto';
        });

        await page.waitForTimeout(5000);

        const firstPost = page.locator('div[role="article"]').first();
        await firstPost.scrollIntoViewIfNeeded();

        // --- EXPANDARE TEXT (Metoda Forțată) ---
        console.log("Expandăm textul...");
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return;
            
            // Căutăm butonul de "See more" / "Vezi mai mult"
            const buttons = Array.from(article.querySelectorAll('div[role="button"], span[role="button"]'));
            const seeMore = buttons.find(b => 
                b.innerText.includes('See more') || 
                b.innerText.includes('Vezi mai mult') || 
                b.innerText.includes('... Mai mult')
            );
            
            if (seeMore) {
                seeMore.click();
            }
        });
        
        // Așteptăm să se schimbe DOM-ul după expansiune
        await page.waitForTimeout(4000);

        // --- EXTRAGERE TEXT ---
        const textData = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            const msgBox = article ? article.querySelector('div[data-ad-comet-preview="message"]') : null;
            if (!msgBox) return "";
            
            // Curățăm textul de butoanele care au rămas în interior (vezi mai mult)
            let result = msgBox.innerText;
            return result.replace(/See more|Vezi mai mult|\.\.\. Mai mult/gi, '').trim();
        });

        // --- CAPTURĂ POZĂ RESTRAINSĂ ---
        console.log("Capturăm screenshot-ul articolului...");
        const screenshotPath = 'post.jpg';
        
        // Ascundem elementele de feedback (like/comment) înainte de screenshot pentru a fi curat
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (article) {
                // Ascundem butoanele de like/comment/share de sub video
                const footer = article.querySelector('div[style*="border-top"]'); 
                if (footer) footer.style.display = 'none';
                
                // Încercăm să găsim și bara de reacții (Like, Love etc)
                const toolbar = Array.from(article.querySelectorAll('div[role="toolbar"]'));
                toolbar.forEach(t => t.style.display = 'none');
            }
        });

        await firstPost.screenshot({ path: screenshotPath, type: 'jpeg', quality: 80 });

        if (!textData) throw new Error("Nu am putut extrage textul.");

        // Titlu pentru WP
        const title = textData.split('\n')[0].slice(0, 90) + '...';

        // --- TRIMITERE ---
        console.log("Trimitere date către WordPress...");
        const form = new FormData();
        form.append('title', title);
        form.append('content', textData);
        form.append('image', fs.createReadStream(screenshotPath));

        const response = await axios.post(WP_ENDPOINT, form, {
            headers: { ...form.getHeaders() },
            timeout: 300000 
        });

        console.log('Succes v2.7!', response.data);

    } catch (error) {
        console.error('Eroare:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
