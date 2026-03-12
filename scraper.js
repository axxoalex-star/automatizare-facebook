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
        // --- EXPANSIE TEXT ---
        console.log("Căutăm și apăsăm pe 'Vezi mai mult'...");
        try {
            // Unele butoane Vezi mai mult au ascunsa acțiunea în React handler-ul exact pe textul vizibil
            // Playwright .click() pe text direct mimeaza degetul uman pe ecran
            const expandLocators = targetPost.locator('text=/Vezi mai mult|See more|\.\.\. Mai mult/i');
            
            // Aflăm câte astfel de butoane sunt (uneori fb ascunde comentarii) și dăm click pe PRIMUL
            if (await expandLocators.count() > 0) {
                const btn = expandLocators.first();
                if (await btn.isVisible({ timeout: 2000 })) {
                    console.log("Am găsit butonul de expandare, forțăm apăsarea (force: true)...");
                    await btn.click({ force: true });
                }
            } else {
                console.log("Nu am găsit un buton vizibil de 'Vezi mai mult'. Textul este probabil deja scurt și vizibil în întregime.");
            }
        } catch (e) {
            console.log("Avertisment la click-ul de expandare:", e.message);
        }
        console.log("Forțăm scroll în jos și în sus pentru încărcarea/randarea completă a textului...");
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(1000);
        await targetPost.scrollIntoViewIfNeeded();
        await page.waitForTimeout(2000);

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
        let finalData = "Postare fara text";
        try {
            // Caută containerul principal al postării și extrage toate elementele div care au atributul dir="auto"
            const textLocator = targetPost.locator('div[dir="auto"]');
            const elementCount = await textLocator.count();
            
            let allParagraphs = [];
            for (let i = 0; i < elementCount; i++) {
                let pText = await textLocator.nth(i).innerText();
                let txt = pText.trim();
                
                // Elimină spațiile goale și metadatele foarte scurte pur informative
                if (txt.length > 0 && !txt.match(/^[0-9]+\s*(m|h|d|w)$/) && !txt.includes('@')) {
                    allParagraphs.push(txt);
                }
            }
            
            let extractedText = allParagraphs.join('\n').trim();

            // Dacă textul extras are mai puțin de 50 de caractere, punem fallback larg
            if (extractedText.length < 50) {
                console.log("Text vizibil extrem de scurt (<50 char). Încercăm fallback global pe articol...");
                extractedText = await targetPost.innerText();
                // Eliminăm manual cuvintele de sistem la ieșire globală
                extractedText = extractedText.replace(/Like|Share|Comment|Îmi place|Comentează|Distribuie|Vezi mai mult|See more/gi, '').trim();
            }

            if (extractedText.trim().length > 5) {
                // Curăță textul predefinit de Vezi mai mult
                let cleanText = extractedText.replace(/Vezi mai mult|See more|\.\.\. Mai mult/gi, '').trim();
                
                // Filtrarea duplicatelor (pentru titlu dublat) și ocolirea rândurilor goale
                let lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                
                // Dacă primele două linii sunt identice, elimină una din ele
                if (lines.length > 1 && lines[0] === lines[1]) {
                    lines.shift();
                }
                
                finalData = lines.join('\n\n');
            }
            
        } catch (e) {
            console.log("Eroare la colectarea textului:", e.message);
        }

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
