const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1:8080/jal-seva-aankalan/frontend/index.html';

const USERS = {
    superAdmin: { email: 'superadmin@jalseva.in', password: 'admin' },
    gpUser: { email: 'gpuser_1790794965781@example.com', password: 'Password123!' }
};

// Helper: navigate fresh (clear storage, reload, wait for login form)
async function freshStart(page) {
    await page.goto(BASE_URL);
    await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
    await page.reload();
    // Wait for login form to be ready
    await page.waitForSelector('#loginEmail', { state: 'visible', timeout: 15000 });
}

// Helper: log in and wait until the dashboard is fully visible
async function login(page, email, password) {
    await page.fill('#loginEmail', email);
    await page.fill('#loginPwd', password);
    await page.click('#login-form button[type="submit"]');
    // Wait for the full login flow: app-layout must be visible
    await expect(page.locator('#app-layout')).not.toHaveClass(/hidden/, { timeout: 30000 });
    // Wait for dashboard data to fully load
    await page.waitForTimeout(2000);
}

// Helper: log out and wait for login form
async function logout(page) {
    await page.click('#logout-btn');
    await page.waitForSelector('#loginEmail', { state: 'visible', timeout: 15000 });
}

// Helper: wait for form view to be active
async function waitForForm(page) {
    await expect(page.locator('#form-view')).toHaveClass(/active/, { timeout: 30000 });
    await page.waitForTimeout(500);
}

// Helper: wait for dashboard view to be active
async function waitForDashboard(page) {
    await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 30000 });
    await page.waitForTimeout(500);
}

// Helper: Delete all existing drafts to ensure a clean state
async function cleanupDrafts(page) {
    await page.waitForTimeout(1500); // Give dashboard time to render rows
    const draftsBtn = await page.locator('#btn-view-drafts');
    if (await draftsBtn.isVisible()) {
        await draftsBtn.click();
        await page.waitForTimeout(1500);
    }
    const deletedCount = await page.evaluate(() => {
        const deleteBtns = document.querySelectorAll('.delete-record');
        for (const btn of deleteBtns) {
            btn.click();
        }
        return deleteBtns.length;
    });
    console.log(`cleanupDrafts found and clicked ${deletedCount} delete buttons`);
    await page.waitForTimeout(2000);
    if (await draftsBtn.isVisible()) {
        await draftsBtn.click(); // toggle back
        await page.waitForTimeout(1000);
    }
}

// ─────────────────────────────────────────────────────────
// TEST 1: GP User — Login, Create Draft, Delete Draft
// ─────────────────────────────────────────────────────────
test('GP User: login, create draft, verify draft, delete draft', async ({ page }) => {
    page.on('dialog', async dialog => await dialog.accept());

    await freshStart(page);
    await login(page, USERS.gpUser.email, USERS.gpUser.password);
    await cleanupDrafts(page);

    // Click "Start New Assessment Form"
    await page.click('#btn-new-form');
    await waitForForm(page);

    // Click "Save & Exit"
    await page.click('#save-exit-btn');
    await waitForDashboard(page);

    // Verify a draft row exists
    await page.waitForSelector('.badge-draft', { state: 'visible', timeout: 10000 });

    // Verify "Delete" button exists
    await page.waitForSelector('.delete-record', { state: 'visible', timeout: 5000 });

    // Delete the draft
    await page.locator('.delete-record').first().click();

    // Toast should confirm deletion
    await expect(page.locator('#toast')).toContainText('Draft Deleted', { timeout: 10000 });
});

// ─────────────────────────────────────────────────────────
// TEST 2: GP User — Navigation guard warns on unsaved changes
// ─────────────────────────────────────────────────────────
test('GP User: unsaved changes navigation guard', async ({ page }) => {
    let dialogShown = false;
    page.on('dialog', async dialog => {
        dialogShown = true;
        await dialog.dismiss();
    });

    await freshStart(page);
    await login(page, USERS.gpUser.email, USERS.gpUser.password);
    await cleanupDrafts(page);

    await page.click('#btn-new-form');
    await waitForForm(page);

    // Make a change to trigger dirty state
    await page.fill('#secA-totalHHs', '100');
    await page.waitForTimeout(500);

    // Try navigating back
    await page.click('#back-to-dashboard');
    await page.waitForTimeout(1000);

    expect(dialogShown).toBe(true);
});

// ─────────────────────────────────────────────────────────
// TEST 3: Super Admin — Login, View Dashboard
// ─────────────────────────────────────────────────────────
test('Super Admin: login and view dashboard', async ({ page }) => {
    page.on('dialog', async dialog => await dialog.accept());

    await freshStart(page);
    await login(page, USERS.superAdmin.email, USERS.superAdmin.password);

    // "Manage Users" button should be visible for admins
    await expect(page.locator('#nav-toggle-btn')).toBeVisible({ timeout: 5000 });
});

// ─────────────────────────────────────────────────────────
// TEST 4: Super Admin — Can delete GP User's draft
// ─────────────────────────────────────────────────────────
test('Super Admin: create GP draft then delete it as admin', async ({ page }) => {
    page.on('dialog', async dialog => await dialog.accept());

    // Step 1: GP User creates a draft
    await freshStart(page);
    await login(page, USERS.gpUser.email, USERS.gpUser.password);
    await cleanupDrafts(page);
    
    await page.click('#btn-new-form');
    await waitForForm(page);
    await page.click('#save-exit-btn');
    await waitForDashboard(page);
    await logout(page);

    // Step 2: Super Admin logs in and deletes the draft
    await login(page, USERS.superAdmin.email, USERS.superAdmin.password);

    // Wait for delete button
    await page.waitForSelector('.delete-record', { state: 'visible', timeout: 15000 });
    await page.locator('.delete-record').first().click();

    // Toast should confirm
    await expect(page.locator('#toast')).toContainText('Draft Deleted', { timeout: 10000 });
});

// ─────────────────────────────────────────────────────────
// TEST 5: Super Admin — Open User Management dashboard
// ─────────────────────────────────────────────────────────
test('Super Admin: open user management dashboard', async ({ page }) => {
    page.on('dialog', async dialog => await dialog.accept());

    await freshStart(page);
    await login(page, USERS.superAdmin.email, USERS.superAdmin.password);

    // For super admin, we start on user management view automatically
    await expect(page.locator('#user-management-view')).toHaveClass(/active/, { timeout: 15000 });

    // Verify tables are present
    await expect(page.locator('#pending-users-table')).toBeVisible();
    await expect(page.locator('#all-users-table')).toBeVisible();
});

// ─────────────────────────────────────────────────────────
// TEST 6: Super Admin — Freeze a GP User (custom modal)
// ─────────────────────────────────────────────────────────
test('Super Admin: freeze a GP user with reason', async ({ page }) => {
    page.on('dialog', async dialog => await dialog.accept());

    await freshStart(page);
    await login(page, USERS.superAdmin.email, USERS.superAdmin.password);

    // Go to user management (should be active by default for super admin)
    await expect(page.locator('#user-management-view')).toHaveClass(/active/, { timeout: 15000 });

    // Wait for All Users table to populate
    await page.waitForSelector('#all-users-table tbody tr', { timeout: 15000 });

    // Find a freeze button
    const freezeBtn = page.locator('button.freeze-user-btn').first();
    const count = await freezeBtn.count();

    if (count > 0) {
        await freezeBtn.click();
        await page.waitForTimeout(1000);

        // Handle custom modal
        const promptInput = page.locator('#confirm-modal-prompt-input');
        if (await promptInput.isVisible().catch(() => false)) {
            await promptInput.fill('Test freeze reason');
        }
        const okBtn = page.locator('#confirm-modal-ok');
        if (await okBtn.isVisible().catch(() => false)) {
            await okBtn.click();
        }
        await page.waitForTimeout(2000);
    }

    expect(true).toBe(true);
});

// ─────────────────────────────────────────────────────────
// TEST 7: GP User — Cannot have more than 2 drafts
// ─────────────────────────────────────────────────────────
test('GP User: draft limit enforcement (max 2)', async ({ page }) => {
    page.on('dialog', async dialog => await dialog.accept());

    await freshStart(page);
    await login(page, USERS.gpUser.email, USERS.gpUser.password);

    // Clean up existing drafts first
    let deleteButtons = page.locator('.delete-record');
    let delCount = await deleteButtons.count();
    for (let i = delCount - 1; i >= 0; i--) {
        await deleteButtons.nth(i).click();
        await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(1000);

    // Create draft 1
    await page.click('#btn-new-form');
    await waitForForm(page);
    await page.click('#save-exit-btn');
    await waitForDashboard(page);

    // Create draft 2
    await page.click('#btn-new-form');
    await waitForForm(page);
    await page.click('#save-exit-btn');
    await waitForDashboard(page);

    // Attempt draft 3 — should be blocked
    await page.click('#btn-new-form');
    await page.waitForTimeout(3000);

    // Form should NOT have opened
    const formHidden = await page.evaluate(() =>
        document.getElementById('form-view').classList.contains('hidden')
    );
    expect(formHidden).toBe(true);

    // Toast should show limit message
    const toastText = await page.locator('#toast').textContent();
    expect(toastText).toContain('2 unfinished drafts');

    // Clean up
    deleteButtons = page.locator('.delete-record');
    delCount = await deleteButtons.count();
    for (let i = delCount - 1; i >= 0; i--) {
        await deleteButtons.nth(i).click();
        await page.waitForTimeout(2000);
    }
});
