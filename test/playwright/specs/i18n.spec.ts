import { test, expect } from '@playwright/test';

const APP_PATH = process.env.PLAYWRIGHT_APP_PATH || '/exist/apps/tls-app';

test.describe('interface language', () => {
    test('renders and remembers Simplified Chinese without translating content', async ({ page }) => {
        await page.goto(`${APP_PATH}/browse.html?type=welcome&lang=zh-Hans`);

        await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
        await expect(page.locator('#navbarDropdown')).toContainText('浏览');
        await expect(page.locator('#query-inp')).toHaveAttribute('placeholder', '搜索');
        await expect(page.getByRole('link', { name: '登录' })).toBeVisible();

        await page.goto(`${APP_PATH}/index.html`);
        await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
        await expect(page.locator('h1')).toContainText('Thesaurus Linguae Sericae');
    });

    test('switches back to English from the language menu', async ({ page }) => {
        await page.goto(`${APP_PATH}/browse.html?type=welcome&lang=zh-Hans`);
        await page.locator('#tls-language-menu').click();
        await page.locator('button[lang="en"]').click();

        await expect(page).toHaveURL(/(?:\?|&)lang=en(?:&|$)/);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('#navbarDropdown')).toContainText('Browse');
    });
});
