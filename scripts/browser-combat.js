async (page) => {
    const fixture=QA_FIXTURE;
    const browser=page.context().browser();
    const contexts=await Promise.all([browser.newContext({viewport:{width:1440,height:900}}),browser.newContext({viewport:{width:1440,height:900}})]);
    const hero=await contexts[0].newPage(),observer=await contexts[1].newPage();
    const errors=[],received=[],sent=[],observed=[];
    for(const [tab,log] of [[hero,received],[observer,observed]]) {
        tab.on('pageerror',error=>errors.push(error.message));
        tab.on('websocket',socket=>{
            socket.on('framereceived',event=>{
                const raw=String(event.payload);if(raw==='go') return;
                const packet=JSON.parse(raw);log.push(...(Array.isArray(packet[0])?packet:[packet]));
            });
            if(tab===hero) socket.on('framesent',event=>sent.push(JSON.parse(String(event.payload))));
        });
    }
    async function start(tab,token,name) {
        await tab.addInitScript(token=>{if(location.origin==='http://127.0.0.1:8086') localStorage.setItem('bq-token',token);},token);
        await tab.goto('http://127.0.0.1:8086/?qa=1');
        await tab.waitForFunction(()=>window.__bqGame?.map?.isLoaded);
        await tab.getByPlaceholder('Name your character').fill(name);
        await tab.getByPlaceholder('Name your character').press('Enter');
        await tab.waitForFunction(()=>window.__bqGame?.profile);
    }
    async function walk(tab,x,y) {
        await tab.bringToFront();
        await tab.evaluate(({x,y})=>{
            const g=__bqGame,path=g.findPath(g.player,x,y,[g.player]);
            if(path.length<2||path.length>128) throw new Error('Invalid QA destination '+x+','+y);
            g.makePlayerGoTo(x,y);
        },{x,y});
        await tab.waitForFunction(({x,y})=>{
            const g=__bqGame,a=g.authoritativePosition;
            return a?.x===x&&a.y===y&&a.status==='arrived'&&!g.player.isMoving();
        },{x,y},{timeout:30000});
    }
    async function until(predicate,label,timeout=15000) {
        const deadline=Date.now()+timeout;
        while(Date.now()<deadline) {if(predicate()) return;await hero.waitForTimeout(50);}
        throw new Error(label);
    }
    try {
        await start(hero,fixture.hero,'ExplorateurQA');await start(observer,fixture.observer,'GuetteurQA');
        await hero.bringToFront();await hero.waitForTimeout(300);
        const rat=await hero.evaluate(()=>{
            const g=__bqGame,p=g.player;
            const mob=Object.values(g.entities).filter(e=>e.kind===2&&g.camera.isVisible(e)&&e.getDistanceToEntity(p)>1)
                .sort((a,b)=>a.getDistanceToEntity(p)-b.getDistanceToEntity(p))[0];
            if(!mob) throw new Error('No nearby rat');
            return {id:mob.id,x:mob.gridX,y:mob.gridY,cx:(mob.x+8-g.camera.x)*g.renderer.scale,cy:(mob.y+8-g.camera.y)*g.renderer.scale};
        });
        await hero.mouse.click(rat.cx,rat.cy);
        await hero.waitForFunction(id=>{const info=__bqGame.entityInfo[id];return info&&info.hp<info.maxHp;},rat.id,{timeout:15000});
        const retreat=await hero.evaluate(({x,y})=>{
            const g=__bqGame,p=g.player;
            for(const [dx,dy] of [[0,-15],[15,0],[-15,0],[0,15]]) {
                const tx=x+dx,ty=y+dy;
                if(g.map.isColliding(tx,ty)||g.map.isDoor(tx,ty)) continue;
                const path=g.findPath(p,tx,ty,[p]);
                if(path.length>10&&path.length<60) return {x:tx,y:ty};
            }
            throw new Error('No retreat route');
        },rat);
        await walk(hero,retreat.x,retreat.y);
        await until(()=>observed.some(p=>p[0]===36&&p[1]===rat.id&&p[5]==='returning'),'Observer never saw the return home');
        await until(()=>observed.some(p=>p[0]===36&&p[1]===rat.id&&p[5]==='idle'&&p[2]===rat.x&&p[3]===rat.y),'Rat never reached home');
        const steps=observed.filter(p=>p[0]===36&&p[1]===rat.id);
        let moved=0;
        for(let i=1;i<steps.length;i++) {
            const distance=Math.abs(steps[i][2]-steps[i-1][2])+Math.abs(steps[i][3]-steps[i-1][3]);
            if(distance>1) throw new Error('Monster teleported between steps');
            if(distance) moved++;
        }
        if(moved<4) throw new Error('Pursuit was not observed');
        await observer.bringToFront();
        await observer.waitForFunction(rat=>{const m=__bqGame.entities[rat.id];return m?.serverMode==='idle'&&m.gridX===rat.x&&m.gridY===rat.y&&!m.serverMotion;},rat);
        await observer.screenshot({path:'output/playwright/v2-ai-return.png',scale:'css'});

        // Southern goblins are aggressive. Neither browser sends AGGRO or HURT hints.
        await walk(observer,19,254);
        const heroId=await hero.evaluate(()=>__bqGame.player.id);
        received.length=0;observed.length=0;
        await walk(hero,19,267);
        await until(()=>received.some(p=>p[0]===36&&p[4]===heroId&&p[8]===true),'No autonomous monster strike');
        const strike=received.find(p=>p[0]===36&&p[4]===heroId&&p[8]===true);
        await until(()=>observed.some(p=>p[0]===36&&p[1]===strike[1]&&p[4]===heroId&&p[8]===true),'Observer did not see the same attack');
        await hero.screenshot({path:'output/playwright/v2-ai-aggro.png',scale:'css'});
        if(sent.some(p=>p[0]===6||p[0]===9)) throw new Error('Browser still pilots aggression/damage');
        // Disconnecting the pursued player releases targets on every other client.
        await hero.goto('about:blank');
        await observer.bringToFront();
        await until(()=>observed.some(p=>p[0]===36&&p[1]===strike[1]&&p[4]===null&&p[5]==='returning'),'Disconnect did not release aggression');
        await observer.waitForFunction(id=>{const m=__bqGame.entities[id];return !m||!m.target;},strike[1]);
        if(errors.length) throw new Error(errors.join('\n'));
        return {ratSteps:moved,aggressiveMonster:strike[1],clientAggroPackets:0,clientHurtPackets:0,pageErrors:errors.length};
    } catch(error) {
        await observer.screenshot({path:'output/playwright/v2-ai-failure.png',scale:'css'});
        throw new Error(error.message+' '+JSON.stringify({errors,recent:received.filter(p=>[35,36].includes(p[0])).slice(-10)}));
    } finally {await contexts[0].close();await contexts[1].close();}
}
