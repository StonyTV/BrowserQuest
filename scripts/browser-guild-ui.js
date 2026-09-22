async (page) => {
    // Seeded characters live in the isolated QA database, never the playable database.
    const fixture = null; // prepare-social-qa.js injects the isolated characters
    const browser = page.context().browser();
    const context = await browser.newContext({ viewport:{width:1440,height:900} });
    const friendContext = await browser.newContext({ viewport:{width:1200,height:850} });
    const hero = await context.newPage(), friend = await friendContext.newPage();
    const errors = [];
    for (const tab of [hero,friend]) tab.on('pageerror', error => errors.push(error.message));
    async function start(tab, token, name) {
        await tab.addInitScript(token => localStorage.setItem('bq-token', token), token);
        await tab.goto('http://127.0.0.1:8086/?qa=1');
        await tab.waitForFunction(() => window.__bqGame && (__bqGame.renderer.mobile || __bqGame.renderer.tablet || __bqGame.map?.isLoaded));
        await tab.getByPlaceholder('Name your character').fill(name);
        if (await tab.evaluate(()=>navigator.maxTouchPoints>0)) await tab.locator('#createcharacter .play div').tap();
        else await tab.locator('#createcharacter .play div').click();
        await tab.waitForFunction(() => __bqGame.profile);
    }
    async function meetNpc(tab, kind) {
        await tab.waitForFunction(kind=>Object.values(__bqGame.entities).some(e=>e.kind===kind),kind);
        // Pathfind through the normal movement/combat client, then click the actual NPC sprite.
        await tab.evaluate(kind => {
            const npc = Object.values(__bqGame.entities).find(entity => entity.kind === kind && (kind !== 40 || entity.gridX === 18));
            if (!npc) throw new Error('NPC not loaded');
            __bqGame.makePlayerGoTo(npc.gridX, npc.gridY + 1);
        }, kind);
        await tab.waitForFunction(kind => {
            const npc = Object.values(__bqGame.entities).find(entity => entity.kind === kind && (kind !== 40 || entity.gridX === 18));
            return npc && Math.abs(__bqGame.player.gridX-npc.gridX) + Math.abs(__bqGame.player.gridY-npc.gridY) <= 1 && !__bqGame.player.isMoving();
        }, kind, {timeout:60000});
        await tab.bringToFront();
        await tab.waitForTimeout(300);
        const pos = await tab.evaluate(kind => {
            const g=__bqGame, npc=Object.values(g.entities).find(entity => entity.kind === kind && (kind !== 40 || entity.gridX === 18));
            return {x:(npc.x+8-g.camera.x)*g.renderer.scale,y:(npc.y+8-g.camera.y)*g.renderer.scale};
        }, kind);
        if (await tab.evaluate(()=>navigator.maxTouchPoints>0)) await tab.touchscreen.tap(pos.x,pos.y);
        else await tab.mouse.click(pos.x,pos.y);
        await tab.locator(kind === 43 ? '#guild-create-dialog' : '#bank-panel').waitFor({state:'visible',timeout:5000});
    }
    const sent = [];
    hero.on('websocket', socket => socket.on('framesent', frame => {
        try { const packet=JSON.parse(String(frame.payload)); if(packet[0]===31) sent.push(packet); } catch {}
    }));
    function check(value, message) { if (!value) throw new Error(message); }
    async function fill(tab, name, tag) {
        await tab.getByLabel('Nom de la guilde').fill(name);
        await tab.getByLabel('Sigle · 2 à 5 lettres').fill(tag);
        await tab.getByRole('radio',{name:'Bannière',exact:true}).check();
        await tab.getByRole('radio',{name:'Cerf',exact:true}).check();
        await tab.getByLabel('Couleur du fond').fill('#245a48');
        await tab.getByLabel('Couleur du motif').fill('#f6d98a');
    }
    async function draft(tab) {
        return tab.locator('#guild-create-form').evaluate(form => ({
            name:form.elements.guildName.value,tag:form.elements.guildTag.value,
            inputs:Array.from(form.querySelectorAll('input')).map(input=>[input.type,input.value,input.checked]),
            preview:document.getElementById('guild-create-preview').innerHTML
        }));
    }
    var stage='initial';
    try {
        await start(hero, fixture.leader, 'ChefQA');
        await meetNpc(hero,43);
        await fill(hero,'Veilleurs QA','VQA');
        const initial=await draft(hero);
        const position=await hero.evaluate(()=>[__bqGame.player.gridX,__bqGame.player.gridY]);
        check(await hero.locator('#guild-create-dialog [role=tab], #guild-create-dialog #social-tabs').count()===0,'Creation contains unrelated tabs');
        const box=await hero.locator('#guild-create-dialog').boundingBox();
        check(Math.abs(box.x+box.width/2-720)<2 && Math.abs(box.y+box.height/2-450)<2,'Creation is not centered');
        for(let i=0;i<22;i++) {
            await hero.keyboard.press('Tab');
            const focus=await hero.evaluate(()=>({inside:!!document.activeElement.closest('#guild-create-dialog'),tag:document.activeElement.tagName,id:document.activeElement.id,html:document.activeElement.outerHTML.slice(0,160)}));
            check(focus.inside,'Focus escaped modal at '+i+': '+JSON.stringify(focus));
        }
        await hero.mouse.click(15,450);
        stage='friend join';
        await start(friend,fixture.member,'AmiQA');
        await friend.locator('#social-toggle').click();
        await friend.locator('.social-row').filter({hasText:'ChefQA'}).getByRole('button',{name:'Grouper',exact:true}).click();
        await hero.waitForFunction(()=>document.getElementById('social-badge').textContent==='1');
        check(JSON.stringify(await draft(hero))===JSON.stringify(initial),'Social update erased guild draft');
        check(JSON.stringify(await hero.evaluate(()=>[__bqGame.player.gridX,__bqGame.player.gridY]))===JSON.stringify(position),'Backdrop click moved player');
        await hero.screenshot({path:'output/playwright/v2-guild-draft-retained.png',scale:'css'});
        await hero.keyboard.press('Escape');
        check(await hero.locator('#guild-create-dialog').isHidden(),'Escape did not cancel');
        check(await hero.evaluate(()=>__bqGame.profile.gold)===100,'Cancel charged gold');
        await meetNpc(hero,43);
        await fill(hero,'Veilleurs QA','VQA');
        // Two synchronous submit events exercise the guard before any server response.
        await hero.locator('#guild-create-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
        stage='hero founded';
        await hero.waitForFunction(()=>__bqGame.profile.gold===75 && !document.getElementById('guild-create-dialog').open);
        check(sent.filter(packet=>packet[1]==='guild.create').length===1,'Double submit sent duplicate creation');
        await hero.getByRole('heading',{name:'Veilleurs QA'}).waitFor();
        await friend.getByRole('button',{name:'Fermer les compagnons'}).click();
        stage='friend meets npc';
        await meetNpc(friend,43);
        await fill(friend,'Veilleurs QA','VQA');
        const duplicate=await draft(friend);
        await friend.getByRole('button',{name:'Fonder la guilde',exact:true}).click();
        stage='duplicate notice';
        await friend.locator('#guild-create-feedback').filter({hasText:'déjà utilisé'}).waitFor();
        check(JSON.stringify(await draft(friend))===JSON.stringify(duplicate),'Rejected creation lost draft');
        check(await friend.evaluate(()=>__bqGame.profile.gold)===100,'Rejected creation charged gold');
        check(await friend.getByRole('button',{name:'Fonder la guilde',exact:true}).isEnabled(),'Cannot correct rejected creation');
        await fill(friend,'Secondes Bannières '+Date.now().toString(36).slice(-3),'Z'+Date.now().toString(36).slice(-4));
        await friend.getByRole('button',{name:'Fonder la guilde',exact:true}).click();
        stage='friend founded';
        await friend.waitForFunction(()=>__bqGame.profile.gold===75 && !document.getElementById('guild-create-dialog').open);
        await friendContext.close();
        const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        try {
            const mobile=await mobileContext.newPage(); mobile.on('pageerror',error=>errors.push(error.message));
            stage='mobile start';
            await start(mobile,fixture.poor,'ApprentiQA');
            await mobile.screenshot({path:'output/playwright/v2-hud-mobile.png',scale:'css'});
            stage='mobile npc';
            await meetNpc(mobile,43);
            await fill(mobile,'Guilde mobile','MOB');
            check(await mobile.getByRole('button',{name:'Fonder la guilde',exact:true}).isDisabled(),'Poor founder can submit');
            check(await mobile.locator('#guild-create-shortfall').isVisible(),'Missing cost explanation');
            await mobile.screenshot({path:'output/playwright/v2-guild-mobile.png',scale:'css'});
            await mobile.setViewportSize({width:390,height:500});
            await mobile.getByRole('button',{name:'Annuler',exact:true}).scrollIntoViewIfNeeded();
            check(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
            await mobile.screenshot({path:'output/playwright/v2-guild-small-height.png',scale:'css'});
            await mobile.getByRole('button',{name:'Annuler',exact:true}).tap();
            check(await mobile.locator('#guild-create-dialog').isHidden(),'Touch cancel failed');
            await mobile.setViewportSize({width:390,height:844});
            stage='mobile npc';
            await meetNpc(mobile,43);
            stage='disconnect';
            await mobile.evaluate(()=>__bqGame.client.connection.close());
            await mobile.waitForFunction(()=>!document.getElementById('guild-create-dialog').open);
            await mobile.locator('#connection-error').waitFor({state:'visible'});
        } finally { await mobileContext.close(); }
        await hero.getByRole('button',{name:'Fermer les compagnons'}).click();
        await hero.keyboard.press('i');
        check(await hero.locator('#inventory-panel').isVisible(),'I shortcut failed');
        await hero.keyboard.press('Escape');
        await hero.locator('#social-toggle').focus(); await hero.keyboard.press('Space');
        check(await hero.locator('#social-panel').isVisible(),'Space on HUD button failed');
        await hero.keyboard.press('Escape');
        await hero.keyboard.press('g');
        check(await hero.locator('#social-panel').isVisible(),'G shortcut failed');
        await hero.keyboard.press('Escape');
        await hero.locator('#sound-toggle').click();
        check(await hero.locator('#sound-toggle').getAttribute('aria-pressed')==='true','Sound toggle failed');
        await hero.locator('#sound-toggle').click();
        check(await hero.locator('#rpg-hud img').evaluateAll(images=>images.every(image=>image.naturalWidth===32)),'HUD icons missing');
        await hero.mouse.move(700,700);
        await hero.screenshot({path:'output/playwright/v2-hud-desktop.png',scale:'css'});
        check(!errors.length,errors.join('\n'));
        console.log('Guild UI: draft retained during join/invite; focus trap; centered dialog; cancel; one submit; duplicate error retained; recovery; insufficient funds; mobile touch/short viewport; disconnect overlay. No page errors.');
    } catch(error) {
        await hero.screenshot({path:'output/playwright/v2-guild-ui-failure.png',scale:'css'});
        throw new Error(stage+': '+error.message);
    } finally { await context.close(); await friendContext.close(); }
}
