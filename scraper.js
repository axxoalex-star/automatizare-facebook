const { chromium } = require('playwright');
const fs = require('fs');

const FB_PAGE_URL = process.env.FB_PAGE_URL || 'https://www.facebook.com/luciandanielstanciuviziteu'; 

(async () => {
    console.log(`Pornesc v5.0 (Arhitectura PULL - Salvare Locala File-System)...`);
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1000, height: 1200 }
    });
    const page = await context.newPage();

    try {
        console.log(`Navigam la Facebook la pagina: ${FB_PAGE_URL}`);
        await page.goto(FB_PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        
        // --- CURATARE INTERFATA ---
        await page.evaluate(() => {
            const trash = [
                'div[role="dialog"]', 
                'div[id^="login_mount"]', 
                'div[aria-label="Închide"]',
                'div[aria-label="Close"]',
                '#rb_8'
            ];
            trash.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
            document.body.style.overflow = 'auto'; 
        });

        await page.waitForTimeout(5000);

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

        // --- CAPTURA SCREENSHOT ---
        console.log("Realizam screenshot-ul postarii...");
        const screenshotPath = 'post.jpg';
        
        await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            if (article) {
                const toolbars = Array.from(article.querySelectorAll('div[role="button"], div[role="toolbar"]'));
                toolbars.forEach(tb => {
                    const txt = tb.innerText;
                    if (txt.includes('Like') || txt.includes('Îmi place') || txt.includes('Comment') || txt.includes('Share')) {
                        tb.style.display = 'none';
                    }
                });
            }
        });

        await firstPost.screenshot({ path: screenshotPath, type: 'jpeg', quality: 90 }); 

        // --- EXTRAGERE TEXT COMPLET ---
        const finalData = await page.evaluate(() => {
            const article = document.querySelector('div[role="article"]');
            const msg = article ? article.querySelector('div[data-ad-comet-preview="message"]') : null;
            if (!msg) return null;
            
            let cleanText = msg.innerText;
            cleanText = cleanText.replace(/See more|Vezi mai mult|\.\.\. Mai mult/gi, '').trim();
            return cleanText;
        });

        if (!finalData) throw new Error("Nu am putut gasi corpul mesajului postarii.");

        const title = finalData.split('\n')[0].slice(0, 90) + '...';
        console.log(`Date extrase cu succes! Titlu detectat: ${title}`);

        // --- SALVARE IN FISIERE FIZICE (JSON) ---
        console.log("Scriem datele în data.json...");
        
        const payload = {
            title: title,
            content: finalData,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync('data.json', JSON.stringify(payload, null, 2));

        console.log("Fisierele 'data.json' si 'post.jpg' au fost create! Scriptul scraper.js a terminat. GitHub Actions va prelua commit-ul.");

    } catch (error) {
        console.error('Eroare la extragere:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
