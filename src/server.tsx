import express from 'express';
import puppeteer from 'puppeteer';
import { LanguageEnum } from '@yeci226/hoyoapi';

// Utilities
import Logger from '@/utilities/core/logger';

// Renderers
import { handleDeadlyDraw } from '@/renderers/deadly';
import { handleSignalLogDraw } from '@/renderers/gacha';
import { handleCharacterDraw, handleProfileDraw } from '@/renderers/profile';
import { handleShiyuDraw } from '@/renderers/shiyu';
import { handleInterknotDraw } from '@/renderers/interknot';

const app = express();
const browserPromise = puppeteer.launch({ args: ['--no-sandbox'] });

app.get('/profile', async (req, res) => {
  const locale = req.query.locale as LanguageEnum;
  const query = {
    userId: req.query.userId as string,
    accountIndex: parseInt(req.query.accountIndex as string),
  };

  const html = await handleProfileDraw(locale, query);
  const browser = await browserPromise;
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const buffer = await page.screenshot({ type: 'png' });
  await page.close();

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(buffer);
});

app.get('/profile/character', async (req, res) => {
  const locale = req.query.locale as LanguageEnum;
  const query = {
    userId: req.query.userId as string,
    accountIndex: parseInt(req.query.accountIndex as string),
    characterId: req.query.characterId as string,
  };

  const html = await handleCharacterDraw(locale, query);
  const browser = await browserPromise;
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const buffer = await page.screenshot({ type: 'png' });
  await page.close();

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(buffer);
});

app.get('/gacha', async (req, res) => {
  const locale = req.query.locale as LanguageEnum;
  const query = {
    signalUrl: req.query.signalUrl as string,
  };

  const html = await handleSignalLogDraw(locale, query);
  const browser = await browserPromise;
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const buffer = await page.screenshot({ type: 'png' });
  await page.close();

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(buffer);
});

app.get('/shiyu', async (req, res) => {
  const locale = req.query.locale as LanguageEnum;
  const query = {
    userId: req.query.userId as string,
    accountIndex: parseInt(req.query.accountIndex as string),
    schedule: parseInt(req.query.schedule as string),
  };

  const html = await handleShiyuDraw(locale, query);
  const browser = await browserPromise;
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const buffer = await page.screenshot({ type: 'png' });
  await page.close();

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(buffer);
});

app.get('/deadly', async (req, res) => {
  const locale = req.query.locale as LanguageEnum;
  const query = {
    userId: req.query.userId as string,
    accountIndex: parseInt(req.query.accountIndex as string),
    schedule: parseInt(req.query.schedule as string),
  };

  const html = await handleDeadlyDraw(locale, query);
  const browser = await browserPromise;
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const buffer = await page.screenshot({ type: 'png' });
  await page.close();

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(buffer);
});

app.get('/interknot', async (req, res) => {
  const locale = req.query.locale as LanguageEnum;
  const query = {
    userId: req.query.userId as string,
    accountIndex: parseInt(req.query.accountIndex as string),
  };

  const html = await handleInterknotDraw(locale, query);
  const browser = await browserPromise;
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const buffer = await page.screenshot({ type: 'png' });
  await page.close();

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(buffer);
});

app.listen(3000, () => {
  new Logger('Server').info('Server is running on port 3000');
});
