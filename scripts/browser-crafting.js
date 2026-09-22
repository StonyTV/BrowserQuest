async (page) => {
    // Requires the normal authenticated QA server and local Mailpit; never uses live character data.
    const fixture = null; // Optional legacy profile supplied by prepare-account-qa.js
    const browser = page.context().browser(), errors = [];
    let stage = 'initialization';
    const desktopContext = await browser.newContext({viewport:{width:1440,height:900}});
    const mobileContext = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const hero = await desktopContext.newPage(), friend = await mobileContext.newPage();
    const stamp = Date.now().toString(), names = ['Aube'+stamp.slice(-7), 'Lune'+stamp.slice(-7)];
    async function code(email, reset = false) {
        for(let i=0;i<40;i++) {
            const inbox = await (await page.request.get('http://127.0.0.1:54326/api/v1/messages')).json();
            const message = inbox.messages.find(m=>m.To.some(to=>to.Address===email) && (!reset || m.Subject.includes('Reset')));
            if(message) {
                const mail = await (await page.request.get('http://127.0.0.1:54326/api/v1/message/'+message.ID)).json();
                const match=mail.Text.match(/\b\d{6}\b/); if(match) return match[0];
            }
            await page.waitForTimeout(100);
        }
        throw new Error('Email missing');
    }
    async function register(tab, index) {
        stage = 'register ' + index;
        const email = 'browser-'+stamp+'-'+index+'@example.com', password='QA-'+stamp+'-adventure';
        tab.on('pageerror', error=>errors.push(error.stack));
        if (fixture && index === 0) await tab.addInitScript(token => { if (!sessionStorage.getItem('legacy-seeded')) { localStorage.setItem('bq-token', token); sessionStorage.setItem('legacy-seeded', '1'); } }, fixture.token);
        await tab.goto('http://127.0.0.1:8086/?qa=1');
        await tab.getByRole('button',{name:'Créer un compte',exact:true}).click();
        await tab.getByLabel('Adresse e-mail',{exact:true}).fill(email);
        await tab.getByLabel('Mot de passe',{exact:true}).fill(password);
        if (index === 1) {
            await tab.setViewportSize({width:390,height:500});
            await tab.getByRole('button',{name:'Créer mon compte',exact:true}).scrollIntoViewIfNeeded();
            if (await tab.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Mobile form overflow');
            await tab.screenshot({path:'output/playwright/account-mobile-short-form.png',scale:'css'});
            await tab.setViewportSize({width:390,height:844});
        }
        await tab.screenshot({path:'output/playwright/account-signup-'+index+'.png',scale:'css'});
        await tab.getByRole('button',{name:'Créer mon compte',exact:true}).click();
        await tab.getByRole('heading',{name:'Ouvrez les portes'}).waitFor();
        await tab.getByLabel('Code de confirmation',{exact:true}).fill(await code(email));
        await tab.getByRole('button',{name:'Confirmer mon adresse'}).click();
        await tab.getByRole('heading',{name:'Vos personnages'}).waitFor();
        if (fixture && index === 0) await tab.getByRole('button',{name:'Récupérer AncienQA · ancien personnage',exact:true}).click();
        else await tab.getByRole('button',{name:'Nouveau personnage Une nouvelle histoire'}).first().click();
        await tab.getByLabel('Nom du personnage',{exact:true}).fill(names[index]);
        await tab.getByRole('button',{name:fixture && index === 0 ? 'Rattacher à mon compte' : 'Créer le personnage',exact:true}).click();
        await tab.getByRole('heading',{name:'Vos personnages'}).waitFor();
        if(await tab.locator('.account-character').count()!==3) throw new Error('Three slots missing');
        await tab.screenshot({path:'output/playwright/account-characters-'+index+'.png',scale:'css'});
        const cookies=await tab.context().cookies();
        if(!cookies.some(cookie=>cookie.name==='bq_session'&&cookie.httpOnly&&cookie.sameSite==='Lax'))throw new Error('Session cookie not protected');
        if(await tab.evaluate(()=>document.cookie.includes('bq_session')))throw new Error('Readable session cookie');
        await tab.reload();
        await tab.getByRole('heading',{name:'Vos personnages'}).waitFor();
        await tab.getByRole('button',{name:'Jouer avec '+names[index],exact:true}).click();
        stage = 'enter world ' + index;
        await tab.waitForFunction(()=>__bqGame.profile);
        if (fixture && index === 0) {
            const profile = await tab.evaluate(()=>({id:__bqGame.profile.id,gold:__bqGame.profile.gold,experience:__bqGame.profile.experience,token:localStorage.getItem('bq-token')}));
            if (profile.id !== fixture.id || profile.gold !== 77 || profile.experience !== 45 || profile.token) throw new Error('Legacy recovery did not preserve identity/progress or clear the token');
        }
        return {email,password};
    }
    async function meet(tab, x, y) {
        stage = 'meet ' + x + ',' + y;
        if(await tab.locator('#crafting-panel').isVisible()) await tab.getByRole('button',{name:'Fermer les métiers'}).click();
        await tab.evaluate(({x,y})=>__bqGame.makePlayerGoTo(x,y+1),{x,y});
        await tab.waitForFunction(({x,y})=>__bqGame.authoritativePosition?.x===x&&__bqGame.authoritativePosition.y===y+1&&__bqGame.authoritativePosition.status==='arrived',{x,y},{timeout:60000});
        await tab.bringToFront(); await tab.waitForTimeout(200);
        const pos=await tab.evaluate(({x,y})=>{const g=__bqGame;return {x:(x*16+8-g.camera.x)*g.renderer.scale,y:(y*16+8-g.camera.y)*g.renderer.scale};},{x,y});
        await tab.mouse.click(pos.x,pos.y);
        await tab.locator('#crafting-panel').waitFor({state:'visible'});
    }
    async function harvest(x,y,kind,quantity) {
        await meet(hero,x,y);
        await hero.getByRole('button',{name:'Récolter',exact:true}).click();
        await hero.waitForFunction(({kind,quantity})=>__bqGame.profile.items.filter(i=>i.kind===kind).reduce((n,i)=>n+i.quantity,0)===quantity,{kind,quantity});
    }
    try {
        await register(hero,0); await register(friend,1);
        await friend.setViewportSize({width:1440,height:900});
        await meet(hero,10,223); await meet(friend,10,223);
        stage='shared harvest';
        await hero.getByRole('button',{name:'Récolter',exact:true}).click();
        await friend.waitForFunction(()=>document.querySelector('#harvest-status').textContent.includes('récolte ·'));
        if(await friend.getByRole('button',{name:'Récolter',exact:true}).isEnabled())throw new Error('Busy node still enabled');
        await hero.screenshot({path:'output/playwright/crafting-harvest-desktop.png',scale:'css'});
        await hero.waitForFunction(()=>__bqGame.profile.items.find(i=>i.kind===100)?.quantity===2);
        await friend.waitForFunction(()=>document.querySelector('#harvest-status').textContent.includes('Renouvellement'));
        if(await friend.evaluate(()=>__bqGame.profile.items.some(i=>i.kind===100)))throw new Error('Reward leaked to observer');
        await hero.getByRole('button',{name:'Fermer les métiers'}).click();
        await hero.getByRole('button',{name:'Sac · I',exact:true}).click();
        await hero.getByRole('button',{name:'Case 3 · Bois de frêne',exact:true}).click();
        if(await hero.getByRole('button',{name:'Équiper',exact:true}).count())throw new Error('Resource can be equipped');
        if(await hero.locator('#inventory-items .item-quantity').textContent()!=='2')throw new Error('Missing stack count');
        await hero.screenshot({path:'output/playwright/crafting-resource-inventory.png',scale:'css'});
        await hero.getByRole('button',{name:'Fermer le sac'}).click();
        await harvest(28,222,101,2); await harvest(27,224,101,4);
        await meet(hero,17,224);
        stage='workshop';
        await hero.screenshot({path:'output/playwright/crafting-workshop-desktop.png',scale:'css'});
        await hero.getByRole('button',{name:'Fabriquer Épée en acier',exact:true}).click();
        await hero.waitForFunction(()=>__bqGame.profile.professions.smithing===10);
        const made=await hero.evaluate(()=>{const p=__bqGame.profile;return {id:p.items.find(i=>i.craftedBy===p.name)?.id,gold:p.gold,lumbering:p.professions.lumbering,mining:p.professions.mining,resources:p.items.filter(i=>i.kind===100||i.kind===101).length};});
        if(!made.id||made.gold!==74||made.lumbering!==3||made.mining!==6||made.resources)throw new Error('Crafting costs/reward incorrect: '+JSON.stringify(made));
        await hero.getByRole('button',{name:'Fermer les métiers'}).click();
        await hero.getByRole('button',{name:'Sac · I',exact:true}).click();
        await hero.locator('#inventory-items [data-item-id="'+made.id+'"]').click();
        await hero.getByRole('button',{name:'Équiper',exact:true}).click();
        await hero.waitForFunction(id=>__bqGame.profile.equipped.weapon===id,made.id);
        await hero.getByRole('button',{name:'Fermer le sac'}).click();
        await hero.getByRole('button',{name:'Compte et personnages',exact:true}).click();
        await hero.getByRole('button',{name:'Changer de personnage',exact:true}).click();
        await hero.getByRole('button',{name:'Jouer avec '+names[0],exact:true}).click();
        await hero.waitForFunction(id=>__bqGame.profile?.equipped.weapon===id&&__bqGame.profile.professions.smithing===10,made.id);
        stage='mobile professions';
        await friend.getByRole('button',{name:'Fermer les métiers'}).click();
        await friend.setViewportSize({width:390,height:844});
        await friend.getByRole('button',{name:'Métiers · M',exact:true}).tap();
        await friend.screenshot({path:'output/playwright/crafting-professions-mobile.png',scale:'css'});
        if(await friend.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile overflow');
        await friend.getByRole('button',{name:'Fermer les métiers'}).tap();
        await friend.screenshot({path:'output/playwright/crafting-hud-mobile.png',scale:'css'});
        if(errors.length)throw new Error(errors.join('; '));
        return {verified:['two verified accounts','exclusive harvest visible to observer','stack count and resource restrictions','three harvests through world sprites','exact craft costs','crafted weapon equip','session/character reconnect preserves professions and gear','mobile professions and HUD'],pageErrors:errors};
    } catch(error) {
        await hero.screenshot({path:'output/playwright/crafting-failure-desktop.png',scale:'css'});
        await friend.screenshot({path:'output/playwright/crafting-failure-mobile.png',scale:'css'});
        throw new Error(stage+': '+error.message+'; page errors: '+errors.join('; '));
    } finally { await desktopContext.close(); await mobileContext.close(); }
}
