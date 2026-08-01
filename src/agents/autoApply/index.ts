// ============================================
// Ultron AI — LinkedIn Easy Apply Browser Agent
// Autonomous / Supervised Application Engine
// ============================================

import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { parseResumeFolder } from '../../services/resumeParser';
import { courierAgent } from '../courier';
import { getSqlite } from '../../database';
import { logger, logAgent } from '../../utils/logger';

export interface AutoApplyOptions {
  query?: string;
  location?: string;
  limit?: number;
  dryRun?: boolean; // If true, pauses at review step and takes screenshot without submitting
}

export interface ApplicationResult {
  jobTitle: string;
  company: string;
  url: string;
  status: 'SUBMITTED' | 'READY_FOR_REVIEW' | 'SKIPPED' | 'FAILED';
  notes?: string;
}

export const autoApplyAgent = {
  /**
   * Runs the autonomous LinkedIn Easy Apply workflow
   */
  async runLinkedInEasyApply(options: AutoApplyOptions = {}): Promise<ApplicationResult[]> {
    const {
      query = 'Backend Developer Node.js',
      location = 'India',
      limit = 3,
      dryRun = true,
    } = options;

    logAgent('AUTO-APPLY', `🚀 Launching LinkedIn Easy Apply Agent for "${query}" in "${location}"...`);

    const resumeProfile = await parseResumeFolder();
    const results: ApplicationResult[] = [];

    // Local user data dir to preserve existing login cookies
    const userDataDir = path.resolve('./.browser-data');
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    let context: BrowserContext | null = null;

    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // Visible so Boss can see the magic happen or log in once
        viewport: { width: 1280, height: 800 },
        args: ['--disable-blink-features=AutomationControlled'],
      });

      const page: Page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

      // Navigate to LinkedIn Easy Apply search
      const encodedQuery = encodeURIComponent(query);
      const encodedLoc = encodeURIComponent(location);
      const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodedQuery}&location=${encodedLoc}&f_AL=true`;

      logAgent('AUTO-APPLY', `🌐 Navigating to: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait a moment for jobs list to load
      await page.waitForTimeout(3000);

      // Check if user is logged in
      const isLoginNeeded = await page.$('input#username, a.nav__button-secondary');
      if (isLoginNeeded) {
        logAgent('AUTO-APPLY', '⚠️ LinkedIn login required. Please log into LinkedIn in the opened browser window.');
        courierAgent.speak('Boss, please log in to LinkedIn in the browser window so I can auto-apply.');
        // Wait up to 60s for manual login if needed
        await page.waitForSelector('.jobs-search-results-list, .scaffold-layout__list-container', { timeout: 60000 }).catch(() => null);
      }

      // Find job cards
      const jobCards = await page.$$('.jobs-search-results-list li, .scaffold-layout__list-item');
      logAgent('AUTO-APPLY', `📋 Found ${jobCards.length} job listings on page.`);

      let processedCount = 0;

      for (const card of jobCards) {
        if (processedCount >= limit) break;

        try {
          // Click on job card
          await card.scrollIntoViewIfNeeded();
          await card.click();
          await page.waitForTimeout(2000);

          const titleElem = await page.$('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title');
          const companyElem = await page.$('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name');

          const jobTitle = titleElem ? (await titleElem.textContent())?.trim() || 'Backend Role' : 'Backend Role';
          const company = companyElem ? (await companyElem.textContent())?.trim() || 'Tech Company' : 'Tech Company';

          logAgent('AUTO-APPLY', `🎯 Inspecting: ${jobTitle} at ${company}`);

          // Look for Easy Apply button
          const easyApplyBtn = await page.$('button.jobs-apply-button');
          if (!easyApplyBtn) {
            logAgent('AUTO-APPLY', `⏩ Skipped: No Easy Apply button found for ${company}`);
            continue;
          }

          await easyApplyBtn.click();
          await page.waitForTimeout(1500);

          // Fill standard application form steps
          await this.fillFormSteps(page, resumeProfile);

          if (dryRun) {
            // Take screenshot for review
            const screenshotPath = path.resolve(`./memory/application_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath });

            logAgent('AUTO-APPLY', `📸 Form filled for ${jobTitle} at ${company}! (Review Mode)`);
            results.push({
              jobTitle,
              company,
              url: page.url(),
              status: 'READY_FOR_REVIEW',
              notes: `Form filled and ready. Screenshot saved to ${screenshotPath}`,
            });

            // Close dialog
            const dismissBtn = await page.$('button[aria-label="Dismiss"], button[aria-label="Close"]');
            if (dismissBtn) await dismissBtn.click();
            const discardBtn = await page.$('button[data-control-name="discard_application_confirm_btn"]');
            if (discardBtn) await discardBtn.click();

          } else {
            // Submit application
            const submitBtn = await page.$('button[aria-label="Submit application"], button:has-text("Submit application")');
            if (submitBtn) {
              await submitBtn.click();
              await page.waitForTimeout(2000);
              logAgent('AUTO-APPLY', `🎉 Application SUBMITTED for ${jobTitle} at ${company}!`);
              results.push({
                jobTitle,
                company,
                url: page.url(),
                status: 'SUBMITTED',
              });
            }
          }

          processedCount++;
        } catch (err: unknown) {
          const e = err as Error;
          logger.error(`Error processing job card: ${e.message}`);
        }
      }

      // Record to SQLite
      this.saveApplicationResults(results);

      // Alert Boss
      if (results.length > 0) {
        courierAgent.speak(`Boss, I processed ${results.length} LinkedIn Easy Apply applications for you.`);
      }

    } catch (error: unknown) {
      const e = error as Error;
      logger.error(`[AUTO-APPLY] Error: ${e.message}`);
    } finally {
      if (context) {
        await context.close();
      }
    }

    return results;
  },

  async fillFormSteps(page: Page, profile: ReturnType<typeof parseResumeFolder> extends Promise<infer T> ? T : never): Promise<void> {
    // Up to 5 steps in Easy Apply modal
    for (let step = 0; step < 5; step++) {
      await page.waitForTimeout(1000);

      // 1. Phone number field
      const phoneInput = await page.$('input[id*="phoneNumber"], input[name*="phoneNumber"]');
      if (phoneInput && (await phoneInput.inputValue()) === '') {
        await phoneInput.fill(profile.phone);
      }

      // 2. Experience numeric fields (e.g. "How many years of Node.js experience?")
      const numericInputs = await page.$$('input[type="text"][id*="numeric"], input[type="number"]');
      for (const numInput of numericInputs) {
        const val = await numInput.inputValue();
        if (!val) {
          await numInput.fill(String(profile.experienceYears || 2));
        }
      }

      // 3. Radio / Yes-No questions (usually work authorization / sponsorship)
      const radioInputs = await page.$$('input[type="radio"][value="Yes"]');
      for (const radio of radioInputs) {
        const isChecked = await radio.isChecked();
        if (!isChecked) {
          await radio.check().catch(() => null);
        }
      }

      // 4. Click Next or Review
      const nextBtn = await page.$('button[aria-label="Continue to next step"], button:has-text("Next"), button:has-text("Review")');
      if (nextBtn) {
        await nextBtn.click();
      } else {
        break; // Reached final step
      }
    }
  },

  saveApplicationResults(results: ApplicationResult[]): void {
    const sqlite = getSqlite();
    for (const res of results) {
      try {
        sqlite
          .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run(
            `auto_apply_${res.company}_${Date.now()}`,
            JSON.stringify({ ...res, appliedAt: new Date().toISOString() })
          );
      } catch (e) {
        logger.error('Failed to save application result:', e);
      }
    }
  },
};
