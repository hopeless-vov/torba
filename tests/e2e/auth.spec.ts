import { expect, test } from '@playwright/test'

// Smoke test: the app boots, guards protected routes to the login page,
// and the login/register toggle works. Runs without a real Supabase
// backend (an unauthenticated session simply routes to /login).
test.describe('auth gate', () => {
  test('redirects to login and toggles to register', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Вхід у систему' })).toBeVisible()

    await page.getByRole('button', { name: 'Зареєструватися' }).click()

    await expect(page.getByRole('heading', { name: 'Реєстрація' })).toBeVisible()
    await expect(page.getByText('Назва компанії')).toBeVisible()
  })
})
