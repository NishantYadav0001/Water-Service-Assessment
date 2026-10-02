const { test, expect } = require('@playwright/test');

async function cleanupDrafts(page) {
    await page.waitForTimeout(1500); 
    const draftsBtn = await page.locator('#btn-view-drafts');
    if (await draftsBtn.isVisible()) {
        await draftsBtn.click();
        await page.waitForTimeout(1500);
    }
    const deletedCount = await page.evaluate(() => {
        const deleteBtns = document.querySelectorAll('.delete-btn');
        for (const btn of deleteBtns) {
            btn.click();
        }
        return deleteBtns.length;
    });
    console.log(`cleanupDrafts found and clicked ${deletedCount} delete buttons`);
    await page.waitForTimeout(2000);
}

test('Debug GP User Save Draft', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    
    await page.goto('http://127.0.0.1:8080/jal-seva-aankalan/frontend/index.html');
    await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
    await page.reload();
    
    await page.fill('#loginEmail', 'gpuser_1790794965781@example.com');
    await page.fill('#loginPwd', 'Password123!');
    await page.click('#login-form button[type="submit"]');
    
    await page.waitForTimeout(3000);
    
    console.log('Cleaning up drafts...');
    await cleanupDrafts(page);

    console.log('Clicking new form...');
    await page.click('#btn-new-form');
    await page.waitForTimeout(2000);
    
    console.log('Clicking save draft...');
    await page.click('#save-draft-btn');
    await page.waitForTimeout(2000);
    
    // Get text of toast
    const toastText = await page.locator('#toast').textContent();
    console.log('TOAST CONTENT:', toastText);
});
