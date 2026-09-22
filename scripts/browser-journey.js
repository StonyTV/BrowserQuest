async (page) => {
    await page.getByRole('button', { name: 'Fermer le sac' }).click();
    const target = await page.evaluate(() => {
        const g = window.__bqGame;
        const box = document.getElementById('foreground').getBoundingClientRect();
        return Object.values(g.entities).filter(e => e.kind === 2).map(e => ({
            id: e.id,
            x: box.left + (e.gridX * 16 - g.camera.x + 8) * g.renderer.scale,
            y: box.top + (e.gridY * 16 - g.camera.y + 8) * g.renderer.scale,
            distance: Math.abs(e.gridX - g.player.gridX) + Math.abs(e.gridY - g.player.gridY)
        })).filter(e => e.x > box.left && e.x < box.right && e.y > box.top && e.y < box.bottom)
            .sort((a, b) => a.distance - b.distance)[0];
    });
    if (!target) throw new Error('No creature visible');
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(() => Number(document.getElementById('gold-count').textContent.split(' ')[0]) > 0, { timeout: 20000 });
    await page.screenshot({ path: 'output/playwright/first-kill.png', scale: 'css' });
}
