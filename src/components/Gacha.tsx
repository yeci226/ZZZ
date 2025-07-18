import React from 'react';
import { LanguageEnum } from '@yeci226/hoyoapi';

import { GachaType, SignalDataDetail } from '@/utilities/zzz/gacha';

import style from './style';

export interface GachaProps {
  locale: LanguageEnum;
  signalDataDetails: SignalDataDetail;
}

export const Gacha: React.FC<GachaProps> = ({ locale, signalDataDetails }) => {
  return (
    <html lang="zh-TW" style={{ height: '100vh', width: '100vw' }}>
      <head>
        <style>{style}</style>
        <meta charSet="UTF-8" />
      </head>

      <body
        style={{
          fontFamily: `${locale}, Arial, sans-serif`,
          backgroundColor: '#2a2a2a',
          color: 'white',
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          id="status-bar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 20px',
            backgroundColor: '#1a1a1a',
            fontSize: '14px',
          }}
        >
          <div
            id="status-left"
            style={{
              fontWeight: 'bold',
            }}
          >
            {`繩網通訊`}
          </div>
          <div
            id="status-right"
            style={{
              display: 'flex',
              gap: '5px',
              alignItems: 'center',
            }}
          >
            <div
              id="status-icon"
              style={{
                width: '16px',
                height: '16px',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-wifi" viewBox="0 0 16 16">
                <path d="M15.384 6.115a.485.485 0 0 0-.047-.736A12.44 12.44 0 0 0 8 3C5.259 3 2.723 3.882.663 5.379a.485.485 0 0 0-.048.736.52.52 0 0 0 .668.05A11.45 11.45 0 0 1 8 4c2.507 0 4.827.802 6.716 2.164.205.148.49.13.668-.049" />
                <path d="M13.229 8.271a.482.482 0 0 0-.063-.745A9.46 9.46 0 0 0 8 6c-1.905 0-3.68.56-5.166 1.526a.48.48 0 0 0-.063.745.525.525 0 0 0 .652.065A8.46 8.46 0 0 1 8 7a8.46 8.46 0 0 1 4.576 1.336c.206.132.48.108.653-.065m-2.183 2.183c.226-.226.185-.605-.1-.75A6.5 6.5 0 0 0 8 9c-1.06 0-2.062.254-2.946.704-.285.145-.326.524-.1.75l.015.015c.16.16.407.19.611.09A5.5 5.5 0 0 1 8 10c.868 0 1.69.201 2.42.56.203.1.45.07.61-.091zM9.06 12.44c.196-.196.198-.52-.04-.66A2 2 0 0 0 8 11.5a2 2 0 0 0-1.02.28c-.238.14-.236.464-.04.66l.706.706a.5.5 0 0 0 .707 0l.707-.707z" />
              </svg>
            </div>
            <div
              id="status-icon"
              style={{
                width: '16px',
                height: '16px',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-bar-chart-fill" viewBox="0 0 16 16">
                <path d="M1 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1zm5-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm5-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z" />
              </svg>
            </div>
            <div
              id="status-icon"
              style={{
                width: '16px',
                height: '16px',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-battery-full" viewBox="0 0 16 16">
                <path d="M2 6h10v4H2z" />
                <path d="M2 4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm10 1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm4 3a1.5 1.5 0 0 1-1.5 1.5v-3A1.5 1.5 0 0 1 16 8" />
              </svg>
            </div>
          </div>
        </div>

        <div
          id="main-content"
          style={{
            flex: 1,
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '30px',
          }}
        >
          <div
            id="stats-card"
            style={{
              backgroundColor: '#3a3a3a',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div id="stats-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '16px' }}>
              <span>總抽取數</span>
              <span>263</span>
            </div>
            <div id="stats-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '16px' }}>
              <span>S級數量</span>
              <span>4</span>
            </div>
            <div id="stats-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '16px' }}>
              <span>平均S級抽數</span>
              <span>55.75</span>
            </div>
            <div id="stats-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '16px' }}>
              <span>平均限定S級抽數</span>
              <span>74.33</span>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              id="characters-section"
              style={{
                display: 'grid',
                gap: '10px',
                gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
              }}
            >
              {Array.from({ length: 10 }).map((_, index) => (
                <div
                  id="character-item"
                  style={{
                    position: 'relative',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div
                    id="character-avatar"
                    style={{
                      width: '100%',
                      aspectRatio: '1/1',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #4a4a4a, #6a6a6a)',
                      overflow: 'hidden',
                    }}
                  />
                  <div id="character-name" style={{ textAlign: 'center', lineHeight: '1.2' }}>{`橘福福`}</div>
                  <div id="character-name-container" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                    <div
                      id="character-pity"
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        left: '-4px',
                        minWidth: '20px',
                        textAlign: 'center',
                        backgroundColor: index * 10 > 80 ? '#FF6969' : index * 10 > 70 ? '#FFBB5C' : '#9DF1DF',
                        padding: '2px 4px',
                        borderRadius: '8px',
                      }}
                    >{`${index * 10}`}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            id="bottom-nav"
            style={{
              display: 'flex',
              justifyContent: 'space-around',
              padding: '15px 20px',
              backgroundColor: '#3a3a3a',
              borderRadius: '12px',
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div
              id="nav-item"
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                position: 'relative',
              }}
            >
              RSC
            </div>
            <div
              id="nav-item"
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                position: 'relative',
              }}
            >
              RSC
            </div>
            <div
              id="nav-item"
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                position: 'relative',
              }}
            >
              RSC
            </div>
            <div
              id="nav-item"
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                position: 'relative',
              }}
            >
              RSC
            </div>
          </div>
        </div>
      </body>
    </html>
  );
};
