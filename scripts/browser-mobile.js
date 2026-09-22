async (page) => {
    const context = await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const mobile = await context.newPage();
    const errors = [];
    mobile.on('pageerror', error => errors.push(error.message));
    try {
        await mobile.goto('http://127.0.0.1:8086/?qa=1');
        await mobile.waitForFunction(() => !!window.__bqGame);
        await mobile.getByPlaceholder('Name your character').fill('MobileQA');
        await mobile.screenshot({path:'output/playwright/v2-mobile-login.png',scale:'css'});
        await mobile.locator('#createcharacter .play div').tap();
        await mobile.waitForFunction(() => __bqGame.started,{},{timeout:30000});
        await mobile.getByRole('button',{name:'Sac · I',exact:true}).tap();
        await mobile.getByRole('button',{name:'Case 1 · Épée usée',exact:true}).tap();
        await mobile.getByRole('button',{name:'Déplacer',exact:true}).tap();
        await mobile.getByRole('button',{name:'Case 24 · Vide',exact:true}).tap();
        await mobile.waitForFunction(() => __bqGame.profile.items.some(item=>item.slot===23));
        await mobile.screenshot({path:'output/playwright/v2-mobile-touch.png',scale:'css'});
        await mobile.getByRole('button',{name:'Fermer le sac'}).tap();
        const destination = await mobile.evaluate(() => {
            const g=__bqGame,p=g.player;
            const target = [[p.gridX+2,p.gridY],[p.gridX-2,p.gridY],[p.gridX,p.gridY-2],[p.gridX,p.gridY+2]].find(([x,y])=>!g.map.isColliding(x,y) && !g.getEntityAt(x,y));
            return {target,x:(target[0]*16+8-g.camera.x)*g.renderer.scale,y:(target[1]*16+8-g.camera.y)*g.renderer.scale};
        });
        await mobile.touchscreen.tap(destination.x,destination.y);
        await mobile.waitForFunction(([x,y])=>__bqGame.player.gridX===x&&__bqGame.player.gridY===y,destination.target,{timeout:15000});
        await mobile.waitForFunction(([x,y])=>__bqGame.authoritativePosition?.status==='arrived'&&__bqGame.authoritativePosition.x===x&&__bqGame.authoritativePosition.y===y,destination.target,{timeout:15000});
        if (await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Mobile page overflow');
        if (errors.length) throw new Error(errors.join('\n'));
    } finally { await context.close(); }
}
