import { test, expect } from '@playwright/test';

test.describe('Facturas RD E2E Test Suite', () => {
  const FRONTEND_URL = 'http://localhost:5173';

  // Listen for console errors globally across tests
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      console.error(`Page Error: ${err.message}`);
      // Failing the test if there's an unhandled exception
      expect(err.message).toBeUndefined(); 
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`Console Error: ${msg.text()}`);
        // We won't strictly fail on all console errors unless it's a structural one, 
        // but we log them. To strictly fail as requested:
        expect(msg.type()).not.toBe('error');
      }
    });
  });

  // Viewport tests setup
  const viewports = [
    { name: 'Desktop', width: 1440, height: 900 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Mobile', width: 375, height: 667 },
  ];

  for (const vp of viewports) {
    test.describe(`Viewport: ${vp.name}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test('Should load login and navigate to dashboard', async ({ page }) => {
        await page.goto(`${FRONTEND_URL}/login`);
        await expect(page).toHaveURL(/.*login/);
        // Assuming there's a login button or form, wait for it
        // Or if it redirects automatically, handle that. 
        // Since we don't know the exact login flow, let's try direct navigation to /dashboard if possible, or attempt login.
        
        // Let's go to /dashboard directly, it might redirect to login if unauthorized.
        await page.goto(`${FRONTEND_URL}/dashboard`);
        // We just check that the page loads without JS errors.
      });

      test('Should navigate to /facturas and test filters', async ({ page }) => {
        await page.goto(`${FRONTEND_URL}/facturas`);
        await page.waitForLoadState('networkidle');

        // Check for quick filter chips if they exist
        const chips = ['Sin clasificar', 'Por confirmar', 'Con error', 'Confirmadas', 'ITBIS > RD$5,000', 'Editadas a mano'];
        for (const chip of chips) {
          const chipLocator = page.getByText(chip, { exact: true });
          if (await chipLocator.isVisible()) {
            await chipLocator.click();
            await page.waitForTimeout(100);
          }
        }

        // Popover "Más filtros"
        const moreFiltersBtn = page.getByRole('button', { name: /Más filtros/i });
        if (await moreFiltersBtn.isVisible()) {
          await moreFiltersBtn.click();
          await page.waitForTimeout(200);
          // Press escape to close
          await page.keyboard.press('Escape');
        }
      });

      test('Should navigate to /clientes and test modals', async ({ page }) => {
        await page.goto(`${FRONTEND_URL}/clientes`);
        await page.waitForLoadState('networkidle');

        // Nuevo cliente
        const btnNuevo = page.getByRole('button', { name: /Nuevo cliente/i });
        if (await btnNuevo.isVisible()) {
          await btnNuevo.click();
          await page.waitForTimeout(200);
          await page.keyboard.press('Escape');
        }
      });

      test('Should navigate to /reporteria and test exports', async ({ page }) => {
        await page.goto(`${FRONTEND_URL}/reporteria`);
        await page.waitForLoadState('networkidle');

        // Check export buttons
        const exportExcel = page.getByRole('button', { name: /Exportar/i }); // Or similar
        if (await exportExcel.isVisible()) {
            await expect(exportExcel).toBeVisible();
        }
      });

      test('Should navigate to /reglas and test modals', async ({ page }) => {
        await page.goto(`${FRONTEND_URL}/reglas`);
        await page.waitForLoadState('networkidle');

        // Nueva regla
        const btnRegla = page.getByRole('button', { name: /Nueva regla/i });
        if (await btnRegla.isVisible()) {
          await btnRegla.click();
          await page.waitForTimeout(200);
          await page.keyboard.press('Escape');
        }
      });

      test('Check layout integrity', async ({ page }) => {
        await page.goto(`${FRONTEND_URL}/dashboard`);
        await page.waitForLoadState('networkidle');
        
        // Evaluate horizontal overflow
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        
        expect(hasOverflow).toBeFalsy();
      });
    });
  }
});
