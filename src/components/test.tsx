import React from 'react';

export interface CardProps {
  name: string;
  avatar: string;
}

export const Card: React.FC<CardProps> = ({ name, avatar }) => (
  <html>
    <head>
      <style>{`
        body,html{margin:0}
        @font-face{
          font-family:'NotoSansTC';
          src:url('file:./fonts/NotoSansTC-Regular.otf') format('opentype');
        }
        .card{
          width:1200px;height:630px;display:flex;align-items:center;
          justify-content:center;background:#18181b;color:#fff;
          font:60px/1 'NotoSansTC', sans-serif;
        }
        .avatar{border-radius:50%;width:160px;height:160px;margin-right:40px}
      `}</style>
    </head>
    <body>
      <div className="card">
        <img className="avatar" src={avatar} />
        {name}
      </div>
    </body>
  </html>
);
