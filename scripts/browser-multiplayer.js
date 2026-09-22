async (page) => {
    const context = await page.context().browser().newContext({ viewport: { width: 1200, height: 900 } });
    const friend = await context.newPage();
    try {
        await friend.goto('http://127.0.0.1:8085/?qa=1');
        await friend.waitForFunction(() => window.__bqGame && window.__bqGame.map.isLoaded);
        await friend.getByPlaceholder('Name your character').fill('CompagnonQA');
        await friend.getByPlaceholder('Name your character').press('Enter');
        await friend.waitForFunction(() => window.__bqGame && window.__bqGame.started);
        const position = await page.evaluate(() => [__bqGame.player.gridX, __bqGame.player.gridY]);
        // Use the client's pathfinder and normal network messages to meet the other player.
        await friend.evaluate(([x, y]) => __bqGame.makePlayerGoTo(x, y + 1), position);
        await friend.waitForFunction(([x,y]) => Math.abs(__bqGame.player.gridX-x) + Math.abs(__bqGame.player.gridY-y) <= 2, position, {timeout: 25000});
        await friend.keyboard.press('Enter');
        await friend.locator('#rpg-chat-input').fill('Bonjour aventurier !');
        await friend.locator('#rpg-chat-input').press('Enter');
        await page.waitForFunction(() => document.getElementById('bubbles').textContent.includes('Bonjour aventurier !'));
        if (await page.locator('#inventory-panel').isVisible()) await page.getByRole('button', {name:'Fermer le sac'}).click();
        await page.screenshot({path:'output/playwright/multiplayer-chat.png',scale:'css'});
    } finally { await context.close(); }
}
