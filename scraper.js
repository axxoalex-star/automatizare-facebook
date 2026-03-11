const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// DATELE DE CONFIGURARE (Astea se pun in GitHub Secrets!)
const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const WP_USER = process.env.WP_USER || 'axxo'; 
// Parola de aplicatie (codul de 24 de caractere din WP)
const WP_APP_PASS = process.env.WP_APP_PASS || ''; 
// Endpoint-ul de camuflaj
const WP_URL = process.env.WP_ENDPOINT || 'https://lucianstanciuviziteu.ro/wp-json/support/v1/update';

(async () => {
    console.log(`Pornesc v3.0 (Auth Camouflage Mode - Full Screenshot)...`);
    
    if (!WP_APP_PASS) {
        console.error("EROARE CRITICA: Nu a fost gasita parola de aplicatie (WP_APP_PASS).");
        console.log("Te rog sa o adaugi in GitHub Secrets!");
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: true });
    // Pregatim un context care sa para a utilizator real (non-bot)
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1000, height: 1200 }
    });
    const page = await context.newPage();

    try {
        console.log(`Navigam la Facebook la pagina: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        
        // --- CURATARE INTERFATA (Anti-Login Banners) ---
        await page.evaluate(() => {
            const trash = [
                'div[role="dialog"]', 
                'div[id^="login_mount"]', 
                'div[aria-label="Închide"]',
                'div[aria-label="Close"]',
                '#rb_8' // Bannerul de jos la unii utilizatori
            ];
            trash.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
            document.body.style.overflow = 'auto'; // Re-activam scroll-ul daca era blocat de popup
        });

        await page.waitForTimeout(5000);

        // Identificam prima postare
        const firstPost = page.locator('div[role="article"]').first();
        await firstPost.scrollIntoViewIfNeeded();

        // --- EXPANSIE TEXT ---
        console.log("Căutăm și apăsăm pe 'Vezi mai mult'...");
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return;
            const btn = Array.from(article.querySelectorAll('div[role="button"], span')).find(b => 
                b.innerText.includes('Vezi mai mult') || b.innerText.includes('See more') || b.innerText.includes('... Mai mult')
            );
            if (btn) {
                btn.scrollIntoView();
                btn.click();
            }
        });
        await page.waitForTimeout(4000);

        // --- CAPTURA SCREENSHOT (Aceasta va fi poza principala) ---
        console.log("Realizam screenshot-ul postarii...");
        const screenshotPath = 'post.jpg';
        
        // Ascundem bara de feedback pentru un look profesional
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (article) {
                // Ascundem butoanele de Like/Comment/Share
                const footer = Array.from(article.querySelectorAll('div')).find(d => d.innerText.includes('Like') || d.innerText.includes('Îmi place'));
                if (footer && footer.parentElement) footer.parentElement.style.display = 'none';
                
                // Ascundem si numarul de comentarii/distribuiri
                const counts = article.querySelector('.x1n2onr6');
                if (counts) counts.style.display = 'none';
            }
        });

        await firstPost.screenshot({ path: screenshotPath, type: 'jpeg', quality: 80 });

        // --- EXTRAGERE TEXT COMPLET ---
        const finalData = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            const msg = article ? article.querySelector('div[data-ad-comet-preview="message"]') : null;
            if (!msg) return null;
            
            let cleanText = msg.innerText;
            // Scoatem mizeriile de "See more" ramase
            cleanText = cleanText.replace(/See more|Vezi mai mult|\.\.\. Mai mult/gi, '').trim();
            return cleanText;
        });

        if (!finalData) throw new Error("Nu am putut gasi corpul mesajului postarii.");

        console.log(`Date extrase cu succes! Titlu detectat: ${finalData.slice(0, 50)}...`);

        // --- TRIMITERE CATRE WORDPRESS ---
        console.log("Trimitere catre WordPress folosind Auth Nativa...");
        const form = new FormData();
        form.append('title', finalData.split('\n')[0].slice(0, 90) + '...');
        form.append('content', finalData);
        form.append('image', fs.createReadStream(screenshotPath));

        // Pregatim codul de autentificare
        const authString = `${WP_USER}:${WP_APP_PASS.replace(/\s+/g, '')}`;
        const base64Auth = Buffer.from(authString).toString('base64');

        const response = await axios.post(WP_URL, form, {
            headers: { 
                ...form.getHeaders(),
                'Authorization': `Basic ${base64Auth}`
            },
            timeout: 120000 // 2 minute asteptare pentru procesare imagine
        });

        console.log('Rezultat Final:', response.data);

    } catch (error) {
        console.error('Eroare la procesare:', error.message);
        if (error.response) {
            console.error('Status Server:', error.response.status);
            console.error('Detalii Server:', error.response.data);
        }
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
