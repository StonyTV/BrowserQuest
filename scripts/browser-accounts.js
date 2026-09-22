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
    try {
        const first=await register(hero,0), second=await register(friend,1);
        stage = 'duplicate account';
        const duplicate = await desktopContext.newPage();
        await duplicate.goto('http://127.0.0.1:8086/?qa=1');
        await duplicate.getByRole('button',{name:'Jouer avec '+names[0],exact:true}).click();
        await duplicate.getByText('Votre compte joue déjà dans une autre fenêtre. Fermez-la pour reprendre ici.',{exact:true}).waitFor();
        await duplicate.getByRole('button',{name:'Retour aux personnages',exact:true}).waitFor();
        await duplicate.close();
        await hero.getByLabel('Message',{exact:true}).fill('Deux comptes, un même village');
        await hero.getByRole('button',{name:'Envoyer',exact:true}).click();
        await friend.getByText('Deux comptes, un même village',{exact:false}).first().waitFor();
        await friend.getByRole('button',{name:'Sac · I',exact:true}).tap();
        await friend.getByRole('button',{name:'Case 1 · Épée usée',exact:true}).tap();
        await friend.getByRole('button',{name:'Déplacer',exact:true}).tap();
        await friend.getByRole('button',{name:'Case 24 · Vide',exact:true}).tap();
        await friend.waitForFunction(()=>__bqGame.profile.items.some(item=>item.slot===23));
        await friend.getByRole('button',{name:'Fermer le sac'}).tap();
        await friend.getByRole('button',{name:'Compte et personnages',exact:true}).tap();
        await friend.getByRole('button',{name:'Changer de personnage',exact:true}).tap();
        await friend.getByRole('heading',{name:'Vos personnages'}).waitFor();
        await friend.getByRole('button',{name:'Jouer avec '+names[1],exact:true}).tap();
        stage = 'mobile reconnect inventory';
        await friend.waitForFunction(()=>__bqGame.profile?.items.some(item=>item.slot===23));
        await friend.screenshot({path:'output/playwright/account-mobile-playing.png',scale:'css'});
        await hero.getByRole('button',{name:'Compte et personnages',exact:true}).click();
        await hero.getByRole('button',{name:'Changer de personnage',exact:true}).click();
        await hero.getByRole('heading',{name:'Vos personnages'}).waitFor();
        await hero.getByRole('button',{name:'Déconnexion',exact:true}).click();
        await hero.getByRole('button',{name:'Mot de passe oublié ?',exact:true}).click();
        await hero.getByLabel('Adresse e-mail',{exact:true}).fill(first.email);
        await hero.getByRole('button',{name:'Recevoir un code',exact:true}).click();
        await hero.getByRole('heading',{name:'Un nouveau départ'}).waitFor();
        await hero.getByLabel('Code de confirmation',{exact:true}).fill(await code(first.email,true));
        await hero.getByLabel('Nouveau mot de passe',{exact:true}).fill(first.password+'-renewed');
        await hero.getByRole('button',{name:'Enregistrer et se connecter',exact:true}).click();
        await hero.getByRole('heading',{name:'Vos personnages'}).waitFor();
        await hero.screenshot({path:'output/playwright/account-recovered-desktop.png',scale:'css'});
        if(errors.length)throw new Error(errors.join('; '));
        return {verified:['desktop and touch signup','email code','three slots','HttpOnly cookie','reload persistence','two-account chat','owned inventory save','character switch','logout','password recovery',...(fixture?['legacy claim preserves identity, gold and XP']:[]),'duplicate account error'],pageErrors:errors};
    } catch(error) {
        await hero.screenshot({path:'output/playwright/account-failure-desktop.png',scale:'css'});
        await friend.screenshot({path:'output/playwright/account-failure-mobile.png',scale:'css'});
        throw new Error(stage + ': ' + error.message + '; page errors: ' + errors.join('; '));
    } finally { await desktopContext.close(); await mobileContext.close(); }
}
