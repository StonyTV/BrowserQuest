async (page) => {
    const networkDelay = 0; // Also run with 150 ms outbound delay.
    const browser = page.context().browser();
    const contexts = await Promise.all([browser.newContext({viewport:{width:1440,height:900}}),browser.newContext({viewport:{width:1200,height:850}})]);
    const hero = await contexts[0].newPage(), observer = await contexts[1].newPage();
    const errors = [], corrections = [];
    hero.on('websocket', socket => socket.on('framereceived', event => {
        if (String(event.payload) === 'go') return;
        const packet=JSON.parse(String(event.payload)), packets=Array.isArray(packet[0])?packet:[packet];
        for(const data of packets) if(data[0]===35 && data[4]==='rejected') corrections.push(data);
    }));
    for (const tab of [hero,observer]) tab.on('pageerror', error=>errors.push(error.message));
    async function start(tab,name) {
        await tab.goto('http://127.0.0.1:8086/?qa=1');
        await tab.waitForFunction(()=>window.__bqGame?.map?.isLoaded);
        await tab.getByPlaceholder('Name your character').fill(name);
        await tab.getByPlaceholder('Name your character').press('Enter');
        await tab.waitForFunction(()=>window.__bqGame?.profile);
    }
    async function walkSomewhere() {
        return hero.evaluate(()=>{
            const g=__bqGame,p=g.player;
            for(const [dx,dy] of [[8,0],[-8,0],[0,8],[0,-8],[5,5],[-5,5]]) {
                const x=p.gridX+dx,y=p.gridY+dy;
                if(g.map.isColliding(x,y)||g.map.isDoor(x,y)) continue;
                const path=g.findPath(p,x,y,[p]);
                if(path.length>=6&&path.length<=18) {g.makePlayerGoTo(x,y);return {x,y,length:path.length};}
            }
            throw new Error('No test route');
        });
    }
    async function arrived() {
        await hero.waitForFunction(()=>{
            const g=__bqGame,a=g.authoritativePosition;
            return a?.status==='arrived'&&a.sequence===g.movementSync.sequence&&!g.player.isMoving()&&g.player.gridX===a.x&&g.player.gridY===a.y;
        },{}, {timeout:20000});
    }
    try {
        await start(hero,'MarcheQA'); await start(observer,'TemoinQA');
        if (networkDelay) await hero.evaluate(delay=>{
            const client=__bqGame.client, send=client.sendMessage.bind(client);
            client.sendMessage=function(message) {
                if (![34,15].includes(message[0])) return send(message);
                const frame=JSON.parse(JSON.stringify(message));
                setTimeout(()=>send(frame),delay);
            };
        },networkDelay);
        await hero.bringToFront();
        const destination=await walkSomewhere();
        await hero.waitForFunction(()=>__bqGame.authoritativePosition?.status==='moving');
        const early=await hero.evaluate(()=>__bqGame.authoritativePosition);
        if(early.x===destination.x&&early.y===destination.y) throw new Error('Destination applied instantaneously');
        const sequence=await hero.evaluate(()=>__bqGame.movementSync.sequence);
        await walkSomewhere();
        await hero.waitForFunction(sequence=>__bqGame.movementSync.sequence>sequence,sequence);
        await arrived();
        const position=await hero.evaluate(()=>({id:__bqGame.player.id,...__bqGame.authoritativePosition}));
        await observer.bringToFront();
        await observer.waitForFunction(position=>{
            const other=__bqGame.entities[position.id];
            return other&&!other.isMoving()&&other.gridX===position.x&&other.gridY===position.y;
        },position,{timeout:15000});
        await observer.screenshot({path:'output/playwright/v2-movement-observer.png',scale:'css'});
        await hero.bringToFront();
        if(corrections.length) throw new Error('Legitimate movement was corrected: '+JSON.stringify(corrections));
        // Hostile client: a discontinuous route and the old instant-MOVE packet both fail.
        await hero.evaluate(()=>{const g=__bqGame,a=g.authoritativePosition;g.client.sendMessage([34,++g.movementSync.sequence,[[a.x,a.y],[a.x+10,a.y]]]);});
        await hero.waitForFunction(()=>__bqGame.authoritativePosition.status==='rejected');
        await hero.evaluate(()=>__bqGame.client.sendMessage([4,100,100]));
        await hero.waitForTimeout(150);
        const refused=await hero.evaluate(()=>__bqGame.authoritativePosition);
        if(refused.x!==position.x||refused.y!==position.y) throw new Error('Forged movement changed position');
        // Walk through a real outdoor door, then leave the interior through its return door.
        await hero.evaluate(()=>__bqGame.makePlayerGoTo(27,209));
        await hero.waitForFunction(()=>__bqGame.authoritativePosition?.status==='teleport'&&__bqGame.player.gridX===155&&__bqGame.player.gridY===286,{}, {timeout:30000});
        await hero.screenshot({path:'output/playwright/v2-door-interior.png',scale:'css'});
        await observer.bringToFront();
        await observer.waitForFunction(id=>{
            const other=__bqGame.entities[id];
            return !other || (other.gridX===155&&other.gridY===286);
        },position.id,{timeout:5000});
        await hero.bringToFront();
        const exit=await hero.evaluate(()=>{
            const g=__bqGame,p=g.player;
            for(let y=p.gridY-5;y<=p.gridY+5;y++) for(let x=p.gridX-5;x<=p.gridX+5;x++) {
                if(!g.map.isDoor(x,y)) continue;
                const d=g.map.getDoorDestination(x,y);
                if(d.x===27&&d.y===209) {g.makePlayerGoTo(x,y);return {x:d.x,y:d.y};}
            }
            throw new Error('Return door not found');
        });
        await hero.waitForFunction(exit=>__bqGame.authoritativePosition?.status==='teleport'&&__bqGame.player.gridX===exit.x&&__bqGame.player.gridY===exit.y,exit,{timeout:15000});
        await hero.screenshot({path:'output/playwright/v2-door-return.png',scale:'css'});
        await hero.evaluate(()=>{
            const g=__bqGame;
            const candidates=Object.values(g.entities).filter(entity=>entity.type==='weapon')
                .map(item=>({item,path:g.findPath(g.player,item.gridX,item.gridY,[g.player])}))
                .filter(value=>value.path.length>1&&value.path.length<60).sort((a,b)=>a.path.length-b.path.length);
            if(!candidates.length) throw new Error('No reachable equipment');
            g.makePlayerGoToItem(candidates[0].item);
        });
        await hero.waitForFunction(()=>__bqGame.profile.items.length===3,{}, {timeout:20000});
        await arrived();
        if(corrections.length!==2) throw new Error('Unexpected route correction: '+JSON.stringify(corrections));
        if(errors.length) throw new Error(errors.join('\n'));
    } catch(error) {
        await hero.screenshot({path:'output/playwright/v2-movement-failure.png',scale:'css'});
        const state=await hero.evaluate(()=>({position:[__bqGame.player.gridX,__bqGame.player.gridY],authoritative:__bqGame.authoritativePosition,sequence:__bqGame.movementSync.sequence,door:__bqGame.movementSync.door,path:__bqGame.player.path,step:__bqGame.player.step}));
        throw new Error(error.message+' '+JSON.stringify({state,corrections,errors}));
    } finally {for(const context of contexts) await context.close();}
}
