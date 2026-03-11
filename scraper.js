const { chromium } = require('playwright');
const fs = require('fs');
const axios = require('axios'); // Folosim axios pentru a descarca poza in varianta noua

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

        // Schimbam sa luam a doua postare (index 1 in loc de 0)
        const targetPost = page.locator('div[role="article"]').nth(1);
        await targetPost.scrollIntoViewIfNeeded();

        // --- EXPANSIE TEXT ---
        console.log("Căutăm și apăsăm pe 'Vezi mai mult'...");
        await targetPost.evaluate((article) => {
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

        // --- EXTRAGERE IMAGINE REALA POSTARE ---
        console.log("Incercam sa extragem poza originala a postarii...");
        const screenshotPath = 'post.jpg';
        
        const imageUrl = await targetPost.evaluate((article) => {
            const imgs = Array.from(article.querySelectorAll('img'));
            let bestImg = null;
            let maxArea = 0;
            
            for (let img of imgs) {
                // Ignore elementele de interfata si emoji
                if (img.src.includes('emoji') || img.src.includes('rsrc.php')) continue;
                
                let w = img.naturalWidth || img.width || img.clientWidth;
                let h = img.naturalHeight || img.height || img.clientHeight;
                let area = w * h;
                
                // Cautam imagini mari (postarile de obicei au imagini peste 300x300)
                if (area > maxArea && w > 100 && h > 100) {
                    maxArea = area;
                    bestImg = img;
                }
            }
            return bestImg ? bestImg.src : null;
        });

        if (imageUrl) {
            console.log("Imagine gasita! URL: " + imageUrl.substring(0, 100) + "...");
            try {
                const response = await axios({
                    url: imageUrl,
                    method: 'GET',
                    responseType: 'arraybuffer', // Pt a putea salva binar fiserul usor
                    timeout: 20000
                });
                fs.writeFileSync(screenshotPath, response.data);
                console.log("Poza postarii a fost descarcata cu succes.");
            } catch (err) {
                console.log("Eroare la descarcarea pozei. Facem screenshot fallback...");
                await targetPost.screenshot({ path: screenshotPath, type: 'jpeg', quality: 90 }); 
            }
        } else {
            console.log("Nu s-a gasit o imagine clara (poate e video sau text curat). Efectuam screenshot de rezerva...");
            await targetPost.evaluate((article) => {
                const toolbars = Array.from(article.querySelectorAll('div[role="button"], div[role="toolbar"]'));
                toolbars.forEach(tb => {
                    const txt = tb.innerText;
                    if (txt && (txt.includes('Like') || txt.includes('Îmi place') || txt.includes('Comment') || txt.includes('Share'))) {
                        tb.style.display = 'none';
                    }
                });
            });
            await targetPost.screenshot({ path: screenshotPath, type: 'jpeg', quality: 90 }); 
        }

        // --- EXTRAGERE TEXT COMPLET ---
        // Asteptam ca Facebook sa randeze textul complet
        await page.waitForTimeout(2000); 
        
        const finalData = await targetPost.evaluate((article) => {
            // Metoda 1: Incercam sa gasim div-ul oficial de "message" formatat de Facebook
            const msgNode = article.querySelector('[data-ad-comet-preview="message"]');
            if (msgNode && msgNode.innerText.length > 10) {
                 return msgNode.innerText.replace(/See more|Vezi mai mult|\.\.\. Mai mult/gi, '').trim();
            }

            // Metoda 2 (Fallback Agresiv): Luam TOT textul din interiorul postarii randate.
            // Din moment ce am ascuns deja butoanele (Like/Share) mai sus, a ramas doar contentul brut.
            let rawText = article.innerText;
            let lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            // Filtram liniile "parazit" de la inceput (Nume Profil, "Favorite", Data postarii, etc.)
            let cleanLines = lines.filter(l => {
                const lower = l.toLowerCase();
                if (lower.includes('lucian daniel stanciu')) return false;
                if (lower.includes('stanciu-viziteu')) return false;
                if (lower === 'favorite' || lower === 'follow' || lower === 'like') return false;
                if (lower.includes('vezi mai mult') || lower.includes('see more') || lower.includes('... mai mult')) return false;
                if (l.includes('·') && l.length < 20) return false; // de ex. 22h · 
                return true;
            });
            
            const result = cleanLines.join('\n\n').trim();
            return result.length > 10 ? result : "Postare fara text";
        });

        if (finalData === "Postare fara text") {
            console.log("Avertisment: Nu s-a putut gasi textul specific. Salvez varianta simpla.");
        }

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
