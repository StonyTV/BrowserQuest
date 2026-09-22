async (page) => {
    // Seeded characters live in the isolated QA database, never the playable database.
    const fixture = null; // prepare-social-qa.js injects the isolated characters
    const browser = page.context().browser();
    const context = await browser.newContext({ viewport:{width:1440,height:900} });
    const friendContext = await browser.newContext({ viewport:{width:1200,height:850} });
    const hero = await context.newPage(), friend = await friendContext.newPage();
    const errors = [], traffic = [];
    hero.on('websocket', socket => {
        for (const direction of ['framesent','framereceived']) socket.on(direction, event => {
            const value = String(event.payload);
            if (value.startsWith('[31,') || value.startsWith('[32,')) traffic.push(direction + ': ' + value);
        });
    });
    for (const tab of [hero,friend]) tab.on('pageerror', error => errors.push(error.message));
    async function start(tab, token, name) {
        await tab.addInitScript(token => localStorage.setItem('bq-token', token), token);
        await tab.goto('http://127.0.0.1:8086/?qa=1');
        await tab.waitForFunction(() => window.__bqGame?.map?.isLoaded);
        await tab.getByPlaceholder('Name your character').fill(name);
        await tab.getByPlaceholder('Name your character').press('Enter');
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
        await tab.mouse.click(pos.x,pos.y);
        await tab.locator(kind === 43 ? '#guild-create-dialog' : '#bank-panel').waitFor({state:'visible',timeout:5000});
    }
    try {
        await start(hero, fixture.leader, 'ChefQA');
        await start(friend, fixture.member, 'AmiQA');

        await hero.getByRole('button',{name:'Sac · I',exact:true}).click();
        if (await hero.locator('#inventory-items .inventory-cell').count() !== 24) throw new Error('Missing empty slots');
        await hero.getByRole('button',{name:'Case 3 · Épée en acier',exact:true}).click();
        await hero.getByRole('button',{name:'Déplacer',exact:true}).click();
        await hero.getByRole('button',{name:'Case 24 · Vide',exact:true}).click();
        await hero.waitForFunction(() => __bqGame.profile.items.some(item => item.slot === 23));
        await hero.getByRole('button',{name:'Fermer le sac'}).click();
        await meetNpc(hero,43);
        await hero.getByLabel('Nom de la guilde').fill('Veilleurs QA');
        await hero.getByLabel('Sigle · 2 à 5 lettres').fill('VQA');
        await hero.getByRole('radio',{name:'Bannière',exact:true}).check();
        await hero.getByRole('radio',{name:'Cerf',exact:true}).check();
        await hero.screenshot({path:'output/playwright/v2-guild-creation.png',scale:'css'});
        await hero.getByRole('button',{name:'Fonder la guilde'}).click();
        await hero.getByRole('heading',{name:'Veilleurs QA'}).waitFor();
        await hero.getByRole('button',{name:'Joueurs',exact:true}).click();
        const row = hero.locator('.social-row').filter({hasText:'AmiQA'});
        await row.getByRole('button',{name:'Inviter en guilde'}).click();
        await friend.locator('#social-toggle').click();
        await friend.getByRole('button',{name:'Accepter',exact:true}).click();
        await friend.getByRole('button',{name:'Guilde',exact:true}).click();
        await friend.getByRole('heading',{name:'Veilleurs QA'}).waitFor();
        await row.getByRole('button',{name:'Grouper',exact:true}).click();
        await friend.getByRole('button',{name:'Groupe',exact:true}).click();
        await friend.getByRole('button',{name:'Accepter',exact:true}).click();
        await hero.waitForFunction(() => document.querySelectorAll('#party-hud .party-member').length === 2);
        await friend.getByLabel('Canal de discussion').selectOption('guild');
        await friend.getByLabel('Message',{exact:true}).fill('Notre première guilde !');
        await friend.getByLabel('Message',{exact:true}).press('Enter');
        await hero.getByText('[Guilde] AmiQA :',{exact:true}).waitFor();
        await hero.getByRole('button',{name:'Guilde',exact:true}).click();
        await hero.screenshot({path:'output/playwright/v2-guild-multiplayer.png',scale:'css'});
        await hero.getByRole('button',{name:'Fermer les compagnons'}).click();
        await meetNpc(hero,40);
        await hero.getByRole('button',{name:'Case 24 · Épée en acier',exact:true}).click();
        await hero.waitForFunction(() => __bqGame.profile.bank.items.length === 1);
        await hero.getByLabel('Pièces',{exact:true}).fill('10');
        await hero.getByRole('button',{name:'Déposer',exact:true}).click();
        await hero.waitForFunction(() => __bqGame.profile.bank.gold === 10);
        await hero.screenshot({path:'output/playwright/v2-bank.png',scale:'css'});
        await hero.locator('[aria-label="Cases du coffre"] [data-item-id]').click();
        await hero.waitForFunction(() => __bqGame.profile.bank.items.length === 0);
        await hero.getByRole('button',{name:'Fermer la banque'}).click();
        await hero.getByRole('button',{name:'Sac · I',exact:true}).click();
        await hero.locator('#inventory-items [data-item-id]').filter({has:hero.locator('.inventory-icon[style*=sword2]')}).click();
        await hero.getByRole('button',{name:'Équiper',exact:true}).click();
        await hero.waitForFunction(() => __bqGame.profile.items.find(i=>i.id===__bqGame.profile.equipped.weapon).kind===61);
        await hero.getByRole('button',{name:'Fermer le sac'}).click();
        await hero.bringToFront();
        const rat = await hero.evaluate(() => {
            const g=__bqGame, p=g.player;
            const rat=Object.values(g.entities).filter(e=>e.kind===2 && g.camera.isVisible(e)).sort((a,b)=>(Math.abs(a.gridX-p.gridX)+Math.abs(a.gridY-p.gridY))-(Math.abs(b.gridX-p.gridX)+Math.abs(b.gridY-p.gridY)))[0];
            if (!rat) throw new Error('No rat visible');
            return {x:(rat.x+8-g.camera.x)*g.renderer.scale,y:(rat.y+8-g.camera.y)*g.renderer.scale};
        });
        await hero.mouse.click(rat.x,rat.y);
        await hero.waitForFunction(() => __bqGame.profile.kills>0,{},{timeout:30000});
        await hero.screenshot({path:'output/playwright/v2-combat.png',scale:'css'});
        await hero.setViewportSize({width:390,height:844});
        await hero.getByRole('button',{name:'Sac · I',exact:true}).click();
        await hero.screenshot({path:'output/playwright/v2-mobile-inventory.png',scale:'css'});
        const overflow = await hero.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (overflow) throw new Error('Horizontal overflow on mobile');
        if (errors.length) throw new Error(errors.join('\n'));
    } catch (error) {
        await hero.screenshot({path:'output/playwright/v2-social-failure.png',scale:'css'});
        const state = await hero.evaluate(() => ({position:[__bqGame.player.gridX,__bqGame.player.gridY],mouse:__bqGame.getMouseGridPosition(),chat:document.getElementById('rpg-chat-log').textContent, flags:[__bqGame.hoveringCollidingTile,__bqGame.hoveringPlateauTile,__bqGame.player.isDead], previous:__bqGame.previousClickPosition, npc:Object.values(__bqGame.entities).filter(e=>e.kind===43).map(e=>({id:e.id,x:e.gridX,y:e.gridY,info:__bqGame.entityInfo[e.id]})), hit:document.elementFromPoint(720,402)?.id}));
        throw new Error(error.message + ' ' + JSON.stringify(state) + ' ERRORS ' + errors.join('; ') + ' TRAFFIC ' + JSON.stringify(traffic.slice(-8)));
    } finally { await context.close(); await friendContext.close(); }
}
