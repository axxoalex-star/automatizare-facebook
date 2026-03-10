const { chromium } = require('playwright');
const axios = require('axios');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 
const API_KEY = 'CHEIA_MEA_SECRETA_SUPER_PUTERNICA_123';
// Folosim cheia în URL pentru a evita blocajele de tip Firewall pe Headere
const WP_ENDPOINT = `https://lucianstanciuviziteu.ro/wp-json/fb-sync/v1/post?api_key=${API_KEY}`;

(async () => {
    console.log(`Pornesc scriptul v2.3 (Full Extraction & Anti-Firewall)...`);
    const browser = await chromium.launch({ headless: true });
    // Folosim un context care să nu arate a bot
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    try {
        console.log(`Navigăm la: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        
        // Închidem orice dialog de login/coockies care poate apărea
        await page.evaluate(() => {
            const closeBtn = document.querySelector('div[aria-label="Închide"], div[aria-label="Close"], [id^="login_mount"] div[role="button"]');
            if (closeBtn) closeBtn.click();
        });

        await page.waitForTimeout(5000);

        // --- EXPANDARE TEXT ---
        console.log("Căutăm butonul de expandare...");
        const expandSuccess = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return false;
            
            // Căutăm butoanele care conțin textul de expandare
            const buttons = Array.from(article.querySelectorAll('div[role="button"], span[role="button"]'));
            const seeMore = buttons.find(b => 
                b.innerText.includes('Vezi mai mult') || 
                b.innerText.includes('See more') || 
                b.innerText.includes('... Mai mult')
            );
            
            if (seeMore) {
                seeMore.scrollIntoView();
                seeMore.click();
                return true;
            }
            return false;
        });

        if (expandSuccess) {
            console.log("Am apăsat 'Vezi mai mult'. Așteptăm...");
            await page.waitForTimeout(3000);
        }

        // --- EXTRAGERE DATE ---
        const postData = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (!article) return null;

            // Extragem textul principal
            // FB pune textul în div-uri cu data-ad-comet-preview="message"
            const msgBox = article.querySelector('div[data-ad-comet-preview="message"]');
            let fullText = msgBox ? msgBox.innerText : "";
            
            // Dacă nu e acolo, încercăm selectorul de rezervă
            if (!fullText) {
                const textNodes = Array.from(article.querySelectorAll('div[dir="auto"]'));
                fullText = textNodes.map(n => n.innerText).join('\n');
            }

            // Curățăm resturile de "See more"
            fullText = fullText.replace(/See more|Vezi mai mult|\.\.\. Mai mult/gi, '').trim();

            // Căutăm imaginea principală
            // Prioritizăm imaginile scontent mari
            const imgs = Array.from(article.querySelectorAll('img'));
            const mainImg = imgs.find(img => {
                const src = img.src || "";
                const width = img.naturalWidth || img.width || 0;
                return src.includes('scontent') && width > 300 && !src.includes('emoji.php');
            });

            return {
                text: fullText,
                imageUrl: mainImg ? mainImg.src : (imgs[1] ? imgs[1].src : "")
            };
        });

        if (!postData || !postData.text) {
            throw new Error("Nu am putut extrage textul postării.");
        }

        // Titlul va fi prima propoziție sau primele 80 caractere
        let title = postData.text.split('\n')[0].slice(0, 90);
        if (title.length < postData.text.length && !title.endsWith('...')) title += '...';

        console.log(`Extracție reușită!`);
        console.log(`Titlu: ${title.substring(0, 50)}...`);
        console.log(`Imagine: ${postData.imageUrl ? 'GĂSITĂ' : 'LIPSĂ'}`);

        // --- TRIMITERE WP ---
        console.log("Trimitere către WordPress...");
        const response = await axios.post(WP_ENDPOINT, {
            title: title,
            content: postData.text,
            image_url: postData.imageUrl
        }, {
            timeout: 60000 // Lăsăm 60 de secunde pentru sideload
        });

        console.log('Rezultat WordPress:', response.data);

    } catch (error) {
        console.error('Eroare la procesare:', error.message);
        if (error.response) {
            console.error('Server Status:', error.response.status);
            console.error('Server Response:', error.response.data);
        }
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
