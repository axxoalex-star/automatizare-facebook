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

        // Preluam PRIMA postare de pe pagina (care este postarea de ieri, deoarece azi nu a fost postat nimic).
        // Folosirea lui nth(1) inainte prindea din greseala primul comentariu al primei postari.
        const targetPost = page.locator('div[role="article"]').first();
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
            if (msgNode && msgNode.innerText.trim().length > 10) {
                 return msgNode.innerText.replace(/See more|Vezi mai mult|\.\.\. Mai mult/gi, '').trim();
            }

            // Metoda 2: Cautam cel mai lung bloc de text din toata postarea (de obicei ala e corpul mesajului)
            const textContainers = Array.from(article.querySelectorAll('div[dir="auto"], span[dir="auto"]'));
            let longestText = "";
            let maxLength = 0;

            for (let container of textContainers) {
                let txt = container.innerText.trim();
                // Ignoram meta-datele scurte gen "Author", "@nume", ora (22h), numarul de like-uri
                if (
                    txt.length > maxLength && 
                    !txt.toLowerCase().includes('author') && 
                    !txt.includes('@') && 
                    !txt.match(/^[0-9]+[mhdw]$/) // de ex "22h" sau "4d"
                ) {
                    // Daca am gasit un text mai lung si mai valid
                    maxLength = txt.length;
                    longestText = txt;
                }
            }
            
            if (longestText.length > 10) {
                return longestText.replace(/See more|Vezi mai mult|\.\.\. Mai mult/gi, '').trim();
            }

            return "Postare fara text";
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
