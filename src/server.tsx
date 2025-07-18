import React from 'react';
import express from 'express';
import path from 'path';
import axios from 'axios';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageEnum } from '@yeci226/hoyoapi';

// Utilities
import Logger from '@/utilities/core/logger';
import { GachaType, getSingalLog } from '@/utilities/zzz/gacha';

// Components
import { Gacha } from '@/components/Gacha';
import { Card } from '@/components/test';

const app = express();

app.get('/profile', async (req, res) => {
  const { locale, userId, accountIndex } = req.query;
  const html = '<!DOCTYPE html>' + renderToStaticMarkup(<Card locale={LanguageEnum.TRADIIONAL_CHINESE} />);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(html);
});

app.get('/profile/character', async (req, res) => {
  const { locale, userId, accountIndex, characterId } = req.query;
  const html = '<!DOCTYPE html>' + renderToStaticMarkup(<Card locale={LanguageEnum.TRADIIONAL_CHINESE} />);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(html);
});

app.get('/gacha', async (req, res) => {
  const { locale, signalUrl, type = 'regular' } = req.query;
  const signalDataDetails = await getSingalLog(signalUrl as string, locale as LanguageEnum);
  if (!signalDataDetails) return res.status(400).send('Invalid signal URL');

  const html = '<!DOCTYPE html>' + renderToStaticMarkup(<Gacha locale={LanguageEnum.TRADIIONAL_CHINESE} signalDataDetails={signalDataDetails[type as GachaType]} />);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(html);
});

app.get('/shiyu', async (req, res) => {
  const { locale, userId, accountIndex } = req.query;
  const html = '<!DOCTYPE html>' + renderToStaticMarkup(<Card locale={LanguageEnum.TRADIIONAL_CHINESE} />);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(html);
});

app.get('/deadly', async (req, res) => {
  const { locale, userId, accountIndex, schedule } = req.query;
  const html = '<!DOCTYPE html>' + renderToStaticMarkup(<Card locale={LanguageEnum.TRADIIONAL_CHINESE} />);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(html);
});

app.get('/interknot', async (req, res) => {
  const { locale, userId, accountIndex } = req.query;
  const html = '<!DOCTYPE html>' + renderToStaticMarkup(<Card locale={LanguageEnum.TRADIIONAL_CHINESE} />);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(html);
});

app.get('/fonts/:font', async (req, res) => {
  const { font } = req.params;
  const fontPath = path.join(__dirname, 'assets', 'fonts', `${font}.ttf`);
  res.sendFile(fontPath);
});

app.listen(3000, () => {
  new Logger('系統').success('伺服器已啟動，端口：3000');
});
