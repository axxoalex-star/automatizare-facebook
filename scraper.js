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

        // --- GASIRE POSTARE ---
        // Folosim un selector mult mai strict: postarile reale din timeline au mereu 'aria-posinset' in HTML.
        // Asta previne Playwright de la a confunda "Bio-ul / Intro-ul" paginii cu o postare cand apeleaza .first()
        const targetPost = page.locator('div[role="article"][aria-posinset="1"]');
        await targetPost.scrollIntoViewIfNeeded();

        // --- EXPANSIE TEXT ---
        console.log("Căutăm și apăsăm pe 'Vezi mai mult'...");
        try {
            // Cautam un element de tip buton sau text clickabil care sa contina "Vezi mai mult"
            // Facebook foloseste des div[role="button"] cu elemente transparente deasupra
            const btn = targetPost.locator('div[role="button"]').filter({ hasText: /Vezi mai mult|See more|\.\.\. Mai mult/i }).first();
            
            if (await btn.isVisible({ timeout: 3000 })) {
                console.log("Am găsit butonul de expandare, forțăm apăsarea (force: true)...");
                // Facebook blochează uneori click-urile cu un strat transparent, așa că forțăm click-ul nativ Playwright:
                await btn.click({ force: true });
                
                // Verificăm dacă a dispărut butonul ca dovadă a faptului că postarea s-a expandat cu succes
                try {
                    await btn.waitFor({ state: 'hidden', timeout: 3000 });
                    console.log("Succes: Textul a fost expandat vizual complet.");
                } catch (timeoutErr) {
                    console.log("Avertisment: Butonul nu a dorit să dispară complet din cod, dar textul probabil s-a deschis.");
                }
            } else {
                console.log("Nu am găsit un buton vizibil de 'Vezi mai mult'. Textul este probabil deja scurt și vizibil în întregime.");
            }
        } catch (e) {
            console.log("Eroare la procesul de expansiune a textului:", e.message);
        }
        // Asteptam 5 secunde pentru ca React-ul de pe Facebook sa expandeze complet textul inainte de a-l citi
        await page.waitForTimeout(5000);

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
        // Nu mai asteptam extra, am asteptat deja 5 secunde dupa click pe "Vezi mai mult"
        
        const finalData = await targetPost.evaluate((article) => {
            // Metoda 1 (Cea mai fiabila): Div-ul oficial al mesajului de pe Facebook
            const msgNode = article.querySelector('[data-ad-comet-preview="message"]');
            if (msgNode && msgNode.innerText.trim().length > 10) {
                // Curatam explicit cuvintele "Vezi mai mult / See more" din text
                return msgNode.innerText.replace(/\s*(See more|Vezi mai mult|\.\.\. Mai mult)\s*/gi, ' ').trim();
            }

            // Metoda 2 (Fallback): Colectam textul din TOATE span-urile cu text real (tehnica TreeWalker)
            // Aceasta metoda prinde chiar si textul din span-uri imbricate profund, pe care innerText le poate rata
            const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, null);
            let allText = [];
            let node;
            while ((node = walker.nextNode())) {
                const txt = node.textContent.trim();
                const parent = node.parentElement;
                const tag = parent ? parent.tagName.toLowerCase() : '';
                const role = parent ? parent.getAttribute('role') : '';
                
                // Sarim textele de la butoane, aria si elemente UI
                if (role === 'button' || role === 'link' || role === 'navigation') continue;
                if (['script', 'style', 'svg', 'path'].includes(tag)) continue;
                if (txt.length === 0) continue;
                // Sarim metadatele specifice: ore (22h, 4d), like-uri, emotii
                if (txt.match(/^\d+(h|m|d|w)$/) || txt.match(/^\d+\.?\d*K?$/) || txt.length < 3) continue;
                if (['See more', 'Vezi mai mult', 'Favorite', 'Follow', 'Like', 'Share', 'Comment', 'Comentariu', 'Distribuie'].includes(txt)) continue;
                
                allText.push(txt);
            }
            
            // Unim textele unique si eliminam duplicate consecutive
            const uniqueLines = [];
            for (let t of allText) {
                if (uniqueLines.length === 0 || uniqueLines[uniqueLines.length - 1] !== t) {
                    uniqueLines.push(t);
                }
            }
            
            const result = uniqueLines.join(' ').trim();
            return result.length > 10 ? result : 'Postare fara text';
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
