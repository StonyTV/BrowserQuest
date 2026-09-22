async (page) => {
    const fixture=QA_FIXTURE;
    const contexts=await Promise.all([0,1].map(()=>page.context().browser().newContext({viewport:{width:1440,height:900}})));
    const hero=await contexts[0].newPage(),ally=await contexts[1].newPage(),errors=[];
    for(const tab of [hero,ally]) tab.on('pageerror',error=>errors.push(error.message));
    function check(value,message) {if(!value) throw new Error(message);}
    async function start(tab,token,name) {
        await tab.addInitScript(token=>localStorage.setItem('bq-token',token),token);
        await tab.goto('http://127.0.0.1:8086/?qa=1');
        await tab.waitForFunction(()=>window.__bqGame?.map?.isLoaded);
        await tab.getByPlaceholder('Name your character').fill(name);
        await tab.getByPlaceholder('Name your character').press('Enter');
        await tab.waitForFunction(()=>__bqGame.profile);
    }
    try {
        await start(hero,fixture.hero,'ÉclaireurQA');await start(ally,fixture.ally,'CompagnonQA');
        await hero.locator('#social-toggle').click();
        await hero.locator('.social-row').filter({hasText:'CompagnonQA'}).getByRole('button',{name:'Grouper',exact:true}).click();
        await ally.locator('#social-toggle').click();
        await ally.getByRole('button',{name:'Accepter',exact:true}).click();
        await hero.waitForFunction(()=>document.querySelectorAll('#party-hud .party-member').length===2);
        for(const tab of [hero,ally]) await tab.getByRole('button',{name:'Fermer les compagnons'}).click();
        const rat=await hero.evaluate(()=>{
            const g=__bqGame,p=g.player;
            const rat=Object.values(g.entities).filter(e=>e.kind===2&&g.camera.isVisible(e)).sort((a,b)=>a.getDistanceToEntity(p)-b.getDistanceToEntity(p))[0];
            if(!rat) throw new Error('No visible rat');return {id:rat.id,x:rat.gridX,y:rat.gridY};
        });
        const destination=await ally.evaluate(({x,y})=>{
            const g=__bqGame;
            const point=[[x+2,y],[x-2,y],[x,y+2],[x,y-2]].find(([nx,ny])=>!g.map.isColliding(nx,ny)&&!g.getEntityAt(nx,ny)&&g.findPath(g.player,nx,ny,[g.player]).length>0);
            if(!point) throw new Error('No ally position');g.makePlayerGoTo(...point);return point;
        },rat);
        await ally.waitForFunction(([x,y])=>__bqGame.authoritativePosition?.x===x&&__bqGame.authoritativePosition.y===y&&__bqGame.authoritativePosition.status==='arrived',destination);
        await hero.bringToFront();await hero.waitForTimeout(300);
        const position=await hero.evaluate(id=>{const g=__bqGame,r=g.entities[id];return {x:(r.x+8-g.camera.x)*g.renderer.scale,y:(r.y+8-g.camera.y)*g.renderer.scale};},rat.id);
        await hero.mouse.click(position.x,position.y);
        for(const tab of [hero,ally]) await tab.waitForFunction(()=>__bqGame.profile.experience===40&&__bqGame.profile.progression.level===2,{},{timeout:30000});
        await ally.waitForFunction(()=>Array.from(document.querySelectorAll('#party-hud .party-level')).every(level=>level.textContent==='Niv. 2'));
        const heroId=await hero.evaluate(()=>__bqGame.player.id);
        await ally.waitForFunction(id=>__bqGame.entityInfo[id]?.level===2&&__bqGame.entityInfo[id].maxHp===88,heroId);
        await hero.screenshot({path:'output/playwright/v2-level-up.png',scale:'css'});
        await ally.screenshot({path:'output/playwright/v2-level-observer.png',scale:'css'});
        await hero.getByRole('button',{name:'Sac · I',exact:true}).click();
        check(await hero.locator('#character-level').textContent()==='Niveau 2','Level absent from character sheet');
        check(await hero.locator('#character-stats').textContent()==='Vitalité88Puissance6–11Armure1Résistance+0','Character stats incorrect');
        await hero.screenshot({path:'output/playwright/v2-character-sheet.png',scale:'css'});
        await hero.setViewportSize({width:390,height:844});
        await hero.screenshot({path:'output/playwright/v2-character-mobile.png',scale:'css'});
        check(await hero.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
        await ally.reload();await ally.waitForFunction(()=>window.__bqGame?.map?.isLoaded);
        await ally.locator('#loadcharacter .play div').click();
        await ally.waitForFunction(()=>__bqGame.profile?.experience===40&&__bqGame.profile.maxHitPoints===88);
        check(await ally.evaluate(()=>__bqGame.profile.gold===0&&__bqGame.profile.kills===0),'Party XP changed ally gold or kill count');
        check(!errors.length,errors.join('\n'));
        return {sharedExperience:5,level:2,maxHp:88,reconnect:true,pageErrors:0};
    } catch(error) {
        await hero.screenshot({path:'output/playwright/v2-progression-failure.png',scale:'css'});
        throw error;
    } finally {for(const context of contexts) await context.close();}
}
