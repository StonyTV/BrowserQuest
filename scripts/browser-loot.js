async (page) => {
    await page.evaluate(() => {
        const g = window.__bqGame;
        const item = Object.values(g.entities).filter(e => e.type === 'weapon')
            .sort((a,b) => (Math.abs(a.gridX-g.player.gridX)+Math.abs(a.gridY-g.player.gridY)) - (Math.abs(b.gridX-g.player.gridX)+Math.abs(b.gridY-g.player.gridY)))[0];
        if (!item) throw new Error('No equipment in loaded region');
        g.makePlayerGoToItem(item);
    });
    await page.waitForFunction(() => document.querySelectorAll('#inventory-items li').length > 2, { timeout: 25000 });
    await page.getByRole('button', { name: 'Sac · I' }).click();
    await page.getByRole('button', { name: 'Équiper', exact: true }).first().click();
    await page.waitForFunction(() => window.__bqGame.player.getWeaponName() === 'sword2');
    await page.screenshot({ path: 'output/playwright/equipped-loot.png', scale: 'css' });
    await page.reload();
    await page.locator('#loadcharacter .play div').click();
    await page.waitForFunction(() => window.__bqGame && window.__bqGame.started && window.__bqGame.player.getWeaponName() === 'sword2');
    await page.getByRole('button', { name: 'Sac · I' }).click();
    await page.screenshot({ path: 'output/playwright/reconnected.png', scale: 'css' });
}
